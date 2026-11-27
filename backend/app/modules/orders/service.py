import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import realtime, storage
from app.modules.auth.models import User
from app.modules.colleges.models import College
from app.modules.delivery.models import CustodyEvent
from app.modules.finance.models import BindingPrice, Coupon, PlatformConfig, RateCard
from app.modules.notifications.models import notify
from app.modules.orders import pricing, slots
from app.modules.orders.documents import inspect_upload
from app.modules.orders.enums import Binding, ConversionStatus, OrderStatus, PaymentStatus
from app.modules.orders.models import Order, OrderDocument, OrderEvent, OrderQuotation, PrintRule
from app.modules.orders.schemas import BindingIn, DeliveryIn, DocConfigIn, QuotePreviewIn
from app.modules.orders.enums import ColorMode, Sided
from app.modules.payments.models import GatewayStatus, Payment, Refund
from app.modules.shops.models import ShopBindingPrice, ShopProfile, ShopRateCard
from app.modules.students.models import StudentProfile

EDITABLE = (OrderStatus.draft, OrderStatus.awaiting_payment)
PRE_PRINT = (OrderStatus.draft, OrderStatus.awaiting_payment, OrderStatus.placed, OrderStatus.accepted)
MAX_DOCUMENTS = 20
MAX_SLOT_DAYS_AHEAD = 7
_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alikes

# (key, label, statuses that mean "this step has been reached", rank)
STEPS = [
    ("placed", "Order Placed", {OrderStatus.placed, OrderStatus.accepted}),
    ("printing", "Printing", {OrderStatus.printing}),
    ("packing", "Binding and Packing", {OrderStatus.packing}),
    ("handover_verified", "Shop Handover Verified", {OrderStatus.handover_verified}),
    ("out_for_delivery", "Out for Delivery", {OrderStatus.out_for_delivery}),
    ("delivered", "Delivered to Security Cabin", {OrderStatus.delivered, OrderStatus.collected}),
]


def random_code(n: int) -> str:
    return "".join(secrets.choice(_CODE_CHARS) for _ in range(n))


def set_status(db: Session, order: Order, status: OrderStatus, actor_id: uuid.UUID | None = None,
               note: str | None = None) -> None:
    """The only way an order's status should change: also appends an immutable from -> to event."""
    previous, order.status = order.status, status
    order.events.append(OrderEvent(type=status.value, from_status=previous, to_status=status, actor_id=actor_id, note=note))
    realtime.emit(db, realtime.order_topics(order), "order.status", order_id=order.id, status=status.value)


def get_order(db: Session, user: User, order_id: uuid.UUID) -> Order:
    order = db.get(Order, order_id)
    if not order or order.student_id != user.id:  # 404 (not 403) so ids can't be probed
        raise HTTPException(404, "Order not found")
    return order


def get_editable(db: Session, user: User, order_id: uuid.UUID) -> Order:
    order = get_order(db, user, order_id)
    if order.status not in EDITABLE:
        raise HTTPException(409, "This order can no longer be edited")
    if order.status == OrderStatus.awaiting_payment:  # editing invalidates the locked quote
        if order.quotation:
            db.delete(order.quotation)
            db.flush()
            order.quotation = None
        order.payment_status = PaymentStatus.unpaid
        order.checkout_at = None
        set_status(db, order, OrderStatus.draft, note="checkout reset by edit")
    return order


def create_draft(db: Session, user: User) -> Order:
    profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not profile:
        raise HTTPException(409, "Complete your profile before placing an order")
    code = random_code(6)
    while db.scalar(select(Order.id).where(Order.code == f"UP-{code}")):
        code = random_code(6)
    order = Order(code=f"UP-{code}", student_id=user.id, college_id=profile.college_id)
    order.events.append(OrderEvent(type=OrderStatus.draft.value, to_status=OrderStatus.draft, actor_id=user.id))
    db.add(order)
    db.commit()
    return order


def add_document(db: Session, order: Order, filename: str, data: bytes) -> OrderDocument:
    cfg = db.get(PlatformConfig, 1)
    if len(data) > cfg.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is too large (max {cfg.max_upload_mb} MB)")
    if not data:
        raise HTTPException(422, "File is empty")
    if len(order.documents) >= MAX_DOCUMENTS:
        raise HTTPException(409, f"You can add up to {MAX_DOCUMENTS} documents per order")
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1][:255]
    content_type, pages = inspect_upload(filename, data)

    doc_id = uuid.uuid4()
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:100]
    key = f"orders/{order.id}/{doc_id}/{safe}"
    storage.put_object(key, data, content_type)
    doc = OrderDocument(
        id=doc_id, position=len(order.documents), filename=filename, content_type=content_type,
        size_bytes=len(data), storage_key=key, page_count=pages, page_count_auto=pages is not None,
        # Office files are converted to PDF by the worker for a preview and an exact page count.
        conversion_status=ConversionStatus.pending if content_type.startswith("application/vnd.openxmlformats")
        else ConversionStatus.not_needed,
    )
    if pages:  # sensible default the student can refine
        doc.rules.append(PrintRule(page_from=1, page_to=pages, color=ColorMode.bw, gsm=80, sided=Sided.single))
    order.documents.append(doc)
    db.commit()
    return doc


def get_document(order: Order, doc_id: uuid.UUID) -> OrderDocument:
    for d in order.documents:
        if d.id == doc_id:
            return d
    raise HTTPException(404, "Document not found")


def remove_document(db: Session, order: Order, doc: OrderDocument) -> None:
    key = doc.storage_key
    order.documents.remove(doc)
    db.commit()
    try:
        storage.delete_object(key)
    except Exception:  # orphaned object is harmless; don't fail the request
        pass


def set_document_config(db: Session, doc: OrderDocument, body: DocConfigIn) -> OrderDocument:
    if doc.page_count_auto:
        pages = doc.page_count
    elif body.page_count:
        pages = body.page_count
    else:
        raise HTTPException(422, "Enter the number of pages in this document")
    rules = [pricing.RuleInput(r.page_from, r.page_to, r.color, r.gsm, r.sided) for r in body.rules]
    try:
        pricing.validate_rules(pages, rules)
    except pricing.PricingError as e:
        raise HTTPException(422, str(e)) from None
    doc.page_count = pages
    doc.copies = body.copies
    doc.paper_size = body.paper_size
    doc.orientation = body.orientation
    doc.rules.clear()
    doc.rules.extend(PrintRule(**r.model_dump()) for r in body.rules)
    db.commit()
    return doc


def set_binding(db: Session, order: Order, body: BindingIn) -> None:
    order.binding = body.binding
    order.cover_page = body.cover_page
    order.subject_name = body.subject_name.strip() if body.subject_name else None
    order.subject_code = body.subject_code.strip() if body.subject_code else None
    order.cover_template = body.cover_template
    order.cover_color = body.cover_color
    order.cover_title = (body.cover_title.strip() or None) if body.cover_title else None
    db.commit()


def _find_coupon(db: Session, code: str) -> Coupon:
    coupon = db.get(Coupon, code.strip().upper())
    expired = coupon and coupon.valid_until and coupon.valid_until.replace(tzinfo=coupon.valid_until.tzinfo or UTC) < datetime.now(UTC)
    if not coupon or not coupon.active or expired:
        raise HTTPException(422, "This coupon is not valid")
    return coupon


def set_delivery(db: Session, order: Order, body: DeliveryIn) -> None:
    today = datetime.now(UTC).astimezone(slots.IST).date()
    if not (today <= body.slot_date <= today + timedelta(days=MAX_SLOT_DAYS_AHEAD)):
        raise HTTPException(422, "Choose a date within the next week")
    slots.require_open_slot(db, order.college_id, body.slot_id, body.slot_date)
    code = body.coupon_code.strip().upper() if body.coupon_code and body.coupon_code.strip() else None
    if code:
        _find_coupon(db, code)
    order.slot_id, order.slot_date, order.coupon_code = body.slot_id, body.slot_date, code
    db.commit()


def price_lists(db: Session, shop_id: uuid.UUID | None) -> tuple[dict, dict]:
    """(per-page rates, binding prices): the shop's own rate card, or the admin's standard prices when None."""
    if shop_id is None:
        return ({(r.paper_size, r.gsm, r.color, r.sided): r.price_per_page for r in db.scalars(select(RateCard))},
                {b.binding: b.price for b in db.scalars(select(BindingPrice))})
    rates = db.scalars(select(ShopRateCard).where(ShopRateCard.shop_id == shop_id))
    bindings = db.scalars(select(ShopBindingPrice).where(ShopBindingPrice.shop_id == shop_id))
    return ({(r.paper_size, r.gsm, r.color, r.sided): r.price_per_page for r in rates},
            {b.binding: b.price for b in bindings})


def compute_quote(db: Session, order: Order, shop_id: uuid.UUID | None = None, *, use_choice: bool = True,
                  proposal: QuotePreviewIn | None = None) -> dict:
    """Live quotation from current config and prices (the chosen shop's, else standard). Raises 422 with a
    student-friendly reason. `proposal` prices unsaved studio settings instead of the saved ones (nothing is written)."""
    cfg = db.get(PlatformConfig, 1)
    rates, binding_prices = price_lists(db, order.chosen_shop_id if use_choice and shop_id is None else shop_id)
    proposed = {p.id: p for p in proposal.documents} if proposal else {}
    docs = []
    for d in order.documents:
        p = proposed.get(d.id)
        if p is None:
            docs.append(pricing.DocInput(
                d.filename, d.page_count, d.copies, d.paper_size,
                [pricing.RuleInput(r.page_from, r.page_to, r.color, r.gsm, r.sided) for r in d.rules],
            ))
            continue
        pages = d.page_count if d.page_count_auto else (p.page_count or d.page_count)
        rules = [pricing.RuleInput(r.page_from, r.page_to, r.color, r.gsm, r.sided) for r in p.rules]
        if pages:
            try:
                pricing.validate_rules(pages, rules)
            except pricing.PricingError as e:
                raise HTTPException(422, f"{d.filename}: {e}") from None
        docs.append(pricing.DocInput(d.filename, pages, p.copies, p.paper_size, rules))
    binding = proposal.binding if proposal else order.binding
    cover_page = proposal.cover_page if proposal else order.cover_page
    pct = flat = None
    if order.coupon_code:
        coupon = _find_coupon(db, order.coupon_code)
        pct, flat = coupon.percent_off, coupon.flat_off
    try:
        return pricing.quote(docs, binding, cover_page, rates, binding_prices,
                             cfg.cover_page_fee, cfg.delivery_fee, pct, flat)
    except pricing.PricingError as e:
        raise HTTPException(422, str(e)) from None


def lock_quotation(db: Session, order: Order) -> OrderQuotation:
    """Validates the order is complete and snapshots the price. Called at checkout."""
    if not order.slot_id or not order.slot_date:
        raise HTTPException(422, "Choose a delivery slot")
    if order.cover_page and not (order.subject_name and order.subject_code):
        raise HTTPException(422, "Subject name and code are needed for the cover page")
    slots.require_open_slot(db, order.college_id, order.slot_id, order.slot_date)
    q = compute_quote(db, order)
    if order.quotation:
        db.delete(order.quotation)
        db.flush()
    order.quotation = OrderQuotation(**q)
    return order.quotation


def timeline(order: Order) -> list[dict]:
    rank = next((i for i, (_, _, sts) in enumerate(STEPS) if order.status in sts), -1)
    out = []
    for i, (key, label, sts) in enumerate(STEPS):
        at = next((e.created_at for e in order.events if e.type in {s.value for s in sts}), None)
        out.append({"key": key, "label": label, "done": i <= rank, "at": at})
    return out


def cancel(db: Session, order: Order) -> Order:
    if order.status not in PRE_PRINT:
        raise HTTPException(409, "Printing has already started. Please report an issue instead.")
    paid = order.payment_status == PaymentStatus.paid
    set_status(db, order, OrderStatus.cancelled, actor_id=order.student_id, note="cancelled by student")
    if paid:
        payment = db.scalar(
            select(Payment).where(Payment.order_id == order.id, Payment.status == GatewayStatus.captured)
        )
        db.add(Refund(order_id=order.id, payment_id=payment.id, amount=payment.amount,
                      reason="Cancelled by student before printing started"))
        order.payment_status = PaymentStatus.refund_pending
        notify(db, order.student_id, "refund_update", "Refund requested",
               f"Your refund for {order.code} is awaiting approval.", order.id)
    notify(db, order.student_id, "order_cancelled", "Order cancelled", f"{order.code} was cancelled.", order.id)
    db.commit()
    return order


def collect(db: Session, order: Order) -> Order:
    if order.status != OrderStatus.delivered:
        raise HTTPException(409, "Your packet isn't at the security cabin yet")
    set_status(db, order, OrderStatus.collected, actor_id=order.student_id)
    # Final link in the chain of custody (the packet leaves the security cabin with the student; no OTP by design).
    batch_id = db.scalar(select(CustodyEvent.batch_id).where(CustodyEvent.order_id == order.id, CustodyEvent.type == "delivered")
                         .order_by(CustodyEvent.created_at.desc()).limit(1))
    db.add(CustodyEvent(order_id=order.id, batch_id=batch_id, type="collected", actor_id=order.student_id))
    db.commit()
    return order


def shelf_photo_url(db: Session, order: Order) -> str | None:
    if order.status not in (OrderStatus.delivered, OrderStatus.collected):
        return None
    from app.modules.delivery.models import BatchOrder, BatchOrderStatus, ShelfPhoto

    photo = db.scalar(
        select(ShelfPhoto).join(BatchOrder, BatchOrder.batch_id == ShelfPhoto.batch_id)
        .where(BatchOrder.order_id == order.id, BatchOrder.status == BatchOrderStatus.picked_up)
        .order_by(ShelfPhoto.created_at.desc())
    )
    return storage.presign_get(photo.storage_key) if photo else None


def detail(db: Session, order: Order) -> dict:
    slot = None
    if order.slot_id and order.slot_date:
        from app.modules.colleges.models import CollegeSlot  # local: avoids import-order coupling

        slot = slots.slot_view(db, db.get(CollegeSlot, order.slot_id), order.slot_date, datetime.now(UTC))
    return {
        "id": order.id, "code": order.code, "status": order.status, "payment_status": order.payment_status,
        "created_at": order.created_at, "college": db.get(College, order.college_id), "slot": slot,
        "binding": order.binding, "cover_page": order.cover_page, "subject_name": order.subject_name,
        "subject_code": order.subject_code, "coupon_code": order.coupon_code, "documents": order.documents,
        "cover_template": order.cover_template, "cover_color": order.cover_color, "cover_title": order.cover_title,
        "quotation": order.quotation, "timeline": timeline(order),
        "chosen_shop": _shop_brief(db, order.chosen_shop_id),
        "can_cancel": order.status in PRE_PRINT and order.status != OrderStatus.draft,
        "can_collect": order.status == OrderStatus.delivered,
        "shelf_photo_url": shelf_photo_url(db, order),
    }


def _shop_brief(db: Session, shop_id: uuid.UUID | None) -> dict | None:
    shop = db.get(ShopProfile, shop_id) if shop_id else None
    return {"id": shop.id, "shop_name": shop.shop_name, "area": shop.area} if shop else None


def summary(order: Order) -> dict:
    return {
        "id": order.id, "code": order.code, "status": order.status, "payment_status": order.payment_status,
        "created_at": order.created_at, "slot_date": order.slot_date, "document_count": len(order.documents),
        "total": order.quotation.total if order.quotation else None,
    }
