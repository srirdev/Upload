import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import realtime
from app.core import security as sec
from app.modules.auth.models import User
from app.modules.delivery import service as delivery
from app.modules.delivery.models import BatchMode, BatchOrder, BatchStatus, DeliveryBatch
from app.modules.colleges.models import College, CollegeSlot
from app.modules.finance.models import PlatformConfig
from app.modules.notifications.models import notify
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.orders.pricing import money
from app.modules.orders.service import set_status
from app.modules.orders.enums import Binding
from app.modules.finance.models import BindingPrice, RateCard
from app.modules.orders.service import compute_quote
from app.modules.shops.models import (
    HandoverOtp, OrderRejection, Service, Settlement, ShopBindingPrice, ShopCollege, ShopProfile, ShopRateCard,
    ShopService, ShopStatus, binding_service, print_service,
)
from app.modules.shops.schemas import RateCardIn
from app.modules.shops.schemas import ShopRegisterIn

ACTIVE = (OrderStatus.placed, OrderStatus.accepted, OrderStatus.printing, OrderStatus.packing)
PENDING_TAB = (OrderStatus.accepted, OrderStatus.printing, OrderStatus.packing)
FINISHED_TAB = (OrderStatus.handover_verified, OrderStatus.out_for_delivery, OrderStatus.delivered, OrderStatus.collected)
EARNING = FINISHED_TAB  # entitlement is earned once the packet has been handed over to the rider/delivery
FILES_VISIBLE = (OrderStatus.printing, OrderStatus.packing, *FINISHED_TAB)


# ---- profile ----------------------------------------------------------------------------------


def get_shop(db: Session, user: User) -> ShopProfile:
    shop = db.scalar(select(ShopProfile).where(ShopProfile.user_id == user.id))
    if not shop:
        raise HTTPException(404, "Shop not registered")
    return shop


def get_approved_shop(db: Session, user: User) -> ShopProfile:
    shop = get_shop(db, user)
    if shop.status != ShopStatus.approved:
        raise HTTPException(403, "Your shop is not approved yet")
    return shop


def register(db: Session, user: User, body: ShopRegisterIn) -> ShopProfile:
    if db.scalar(select(ShopProfile.id).where(ShopProfile.user_id == user.id)):
        raise HTTPException(409, "You have already registered")
    data = body.model_dump(exclude={"accept_terms", "services"})
    shop = ShopProfile(user_id=user.id, terms_accepted_at=datetime.now(UTC), **data)
    _replace_services(db, shop, body.services)
    db.add(shop)
    db.flush()
    # A new shop starts from the admin's default prices and can change them in the portal.
    db.add_all([ShopRateCard(shop_id=shop.id, paper_size=r.paper_size, gsm=r.gsm, color=r.color, sided=r.sided,
                             price_per_page=r.price_per_page) for r in db.scalars(select(RateCard))])
    db.add_all([ShopBindingPrice(shop_id=shop.id, binding=b.binding, price=b.price)
                for b in db.scalars(select(BindingPrice)) if b.binding != Binding.none])
    db.commit()
    return shop


def rate_card(db: Session, shop: ShopProfile) -> dict:
    rates = db.scalars(select(ShopRateCard).where(ShopRateCard.shop_id == shop.id)
                       .order_by(ShopRateCard.paper_size, ShopRateCard.color, ShopRateCard.gsm, ShopRateCard.sided)).all()
    bindings = db.scalars(select(ShopBindingPrice).where(ShopBindingPrice.shop_id == shop.id)
                          .order_by(ShopBindingPrice.binding)).all()
    return {"rates": rates, "bindings": bindings}


def set_rate_card(db: Session, shop: ShopProfile, body: RateCardIn) -> dict:
    """Replaces the shop's prices. Only affects quotes not yet locked at checkout."""
    keys = [(r.paper_size, r.gsm, r.color, r.sided) for r in body.rates]
    if len(set(keys)) != len(keys):
        raise HTTPException(422, "Each paper/GSM/colour/sides combination can only be priced once")
    if len({b.binding for b in body.bindings}) != len(body.bindings):
        raise HTTPException(422, "Each binding type can only be priced once")
    db.execute(delete(ShopRateCard).where(ShopRateCard.shop_id == shop.id))
    db.execute(delete(ShopBindingPrice).where(ShopBindingPrice.shop_id == shop.id))
    db.add_all([ShopRateCard(shop_id=shop.id, **r.model_dump()) for r in body.rates])
    db.add_all([ShopBindingPrice(shop_id=shop.id, **b.model_dump()) for b in body.bindings])
    db.commit()
    return rate_card(db, shop)


def _replace_services(db: Session, shop: ShopProfile, codes: list[str] | None) -> None:
    catalogue = set(db.scalars(select(Service.code)).all())
    chosen = catalogue if codes is None else set(codes)
    if unknown := chosen - catalogue:
        raise HTTPException(422, f"Unknown services: {', '.join(sorted(unknown))}")
    if not any(c.startswith("print_") for c in chosen):
        raise HTTPException(422, "Offer at least one printing service")
    shop.offered = [ShopService(service_code=c) for c in sorted(chosen)]


def set_services(db: Session, shop: ShopProfile, codes: list[str]) -> ShopProfile:
    _replace_services(db, shop, codes)
    db.commit()
    if shop.status == ShopStatus.approved and shop.is_open:
        assign_waiting_orders(db, shop)  # newly offered services may make waiting orders eligible
    return shop


def set_open(db: Session, shop: ShopProfile, is_open: bool) -> ShopProfile:
    shop.is_open = is_open
    db.commit()
    if is_open:
        assign_waiting_orders(db, shop)
    return shop


# ---- assignment & money split -----------------------------------------------------------------


def _split(db: Session, order: Order) -> tuple[Decimal, Decimal, Decimal]:
    """(commission_percent, commission_amount, shop_entitlement). Discounts are borne by the platform."""
    pct = db.get(PlatformConfig, 1).commission_percent
    q = order.quotation
    base = q.printing_amount + q.binding_amount + q.cover_amount
    entitlement = money(base * (100 - pct) / 100)
    return pct, money(base - entitlement), entitlement


def required_services(order: Order) -> set[str]:
    """Service codes a shop must offer to fulfil this order."""
    needed = {print_service(d.paper_size, r.color) for d in order.documents for r in d.rules}
    if order.binding != Binding.none:
        needed.add(binding_service(order.binding))
    return needed


def _offers_all(needed: set[str]):
    """Shop ids offering every needed service (a subquery)."""
    return (select(ShopService.shop_id).where(ShopService.service_code.in_(needed))
            .group_by(ShopService.shop_id).having(func.count() == len(needed)))


def assign(db: Session, order: Order, shop: ShopProfile, actor_id: uuid.UUID | None = None) -> None:
    pct, commission, entitlement = _split(db, order)
    order.shop_id, order.shop_assigned_at = shop.id, datetime.now(UTC)
    order.commission_percent, order.commission_amount, order.shop_entitlement = pct, commission, entitlement
    order.events.append(OrderEvent(type="assigned", actor_id=actor_id, note=f"shop {shop.shop_name}"))
    realtime.emit(db, realtime.order_topics(order), "order.assigned", order_id=order.id, shop_id=shop.id)


def eligible_shops(db: Session, order: Order) -> list[ShopProfile]:
    """Open, approved shops serving the order's college that offer every needed service and haven't
    rejected it, lightest active workload first."""
    rejected = select(OrderRejection.shop_id).where(OrderRejection.order_id == order.id)
    load = (
        select(func.count()).select_from(Order)
        .where(Order.shop_id == ShopProfile.id, Order.status.in_(ACTIVE)).correlate(ShopProfile).scalar_subquery()
    )
    return list(db.scalars(
        select(ShopProfile)
        .join(ShopCollege, ShopCollege.shop_id == ShopProfile.id)
        .where(ShopCollege.college_id == order.college_id, ShopProfile.status == ShopStatus.approved,
               ShopProfile.is_open.is_(True), ShopProfile.id.not_in(rejected),
               ShopProfile.id.in_(_offers_all(required_services(order))))
        .order_by(load, ShopProfile.created_at)
    ).all())


def assign_shop(db: Session, order: Order) -> ShopProfile | None:
    """The shop the student chose if it can still take the order, else the least busy eligible shop.
    The entitlement is always computed from what the student actually paid."""
    shops = eligible_shops(db, order)
    shop = next((s for s in shops if s.id == order.chosen_shop_id), None) or (shops[0] if shops else None)
    if shop:
        assign(db, order, shop)
    return shop


# ---- price comparison (student) ---------------------------------------------------------------


def shop_options(db: Session, order: Order) -> list[dict]:
    """Quotes from every eligible shop priced on its own rate card, plus the standard price."""
    standard = compute_quote(db, order, None, use_choice=False)  # raises 422 if the order is incomplete
    college = db.get(College, order.college_id)
    options = [{"shop_id": None, "shop_name": "Any available shop", "area": None, "distance_km": None,
                "printing_amount": standard["printing_amount"], "binding_amount": standard["binding_amount"],
                "total": standard["total"], "chosen": order.chosen_shop_id is None}]
    for shop in eligible_shops(db, order):
        try:
            q = compute_quote(db, order, shop.id)
        except HTTPException:
            continue  # the shop hasn't priced something this order needs
        distance = None
        if college.latitude is not None and college.longitude is not None:
            distance = money(Decimal(str(delivery.haversine_km(
                (float(shop.latitude), float(shop.longitude)), (float(college.latitude), float(college.longitude))))))
        options.append({"shop_id": shop.id, "shop_name": shop.shop_name, "area": shop.area, "distance_km": distance,
                        "printing_amount": q["printing_amount"], "binding_amount": q["binding_amount"],
                        "total": q["total"], "chosen": order.chosen_shop_id == shop.id})
    return sorted(options, key=lambda o: (o["total"], o["shop_id"] is not None))


def choose_shop(db: Session, order: Order, shop_id: uuid.UUID | None) -> None:
    if shop_id is not None:
        if shop_id not in {s.id for s in eligible_shops(db, order)}:
            raise HTTPException(409, "That shop can't take this order right now. Choose another shop.")
        compute_quote(db, order, shop_id)  # 422 if the shop hasn't priced something the order needs
    order.chosen_shop_id = shop_id
    db.commit()


def require_chosen_shop_available(db: Session, order: Order) -> None:
    """At checkout: the chosen shop must still be able to take the order (it may have closed)."""
    if order.chosen_shop_id and order.chosen_shop_id not in {s.id for s in eligible_shops(db, order)}:
        raise HTTPException(409, "The shop you chose isn't taking orders right now. Compare prices and choose again.")


def assign_waiting_orders(db: Session, shop: ShopProfile) -> None:
    colleges = select(ShopCollege.college_id).where(ShopCollege.shop_id == shop.id)
    rejected = select(OrderRejection.order_id).where(OrderRejection.shop_id == shop.id)
    waiting = db.scalars(
        select(Order).where(Order.status == OrderStatus.placed, Order.shop_id.is_(None),
                            Order.college_id.in_(colleges), Order.id.not_in(rejected))
        .order_by(Order.created_at)
    ).all()
    for order in waiting:
        if required_services(order) <= set(shop.services):
            assign(db, order, shop)
    db.commit()


# ---- order workflow ---------------------------------------------------------------------------


def get_order(db: Session, shop: ShopProfile, order_id: uuid.UUID) -> Order:
    order = db.get(Order, order_id)
    if not order or order.shop_id != shop.id:  # 404 so other shops' order ids can't be probed
        raise HTTPException(404, "Order not found")
    return order


def _require(order: Order, *statuses: OrderStatus) -> None:
    if order.status not in statuses:
        raise HTTPException(409, f"This order is {order.status.value.replace('_', ' ')}")


def accept(db: Session, user: User, shop: ShopProfile, order: Order) -> Order:
    """Accepting commits the shop and starts printing; from here the student can no longer cancel."""
    _require(order, OrderStatus.placed)
    set_status(db, order, OrderStatus.printing, actor_id=user.id, note="accepted by shop")
    notify(db, order.student_id, "printing_started", "Printing started",
           f"{order.code} is being printed.", order.id)
    delivery.attach_order(db, order)  # joins this slot's delivery run; riders are offered it
    db.commit()
    return order


def reject(db: Session, user: User, shop: ShopProfile, order: Order, reason: str) -> None:
    _require(order, OrderStatus.placed)
    db.add(OrderRejection(order_id=order.id, shop_id=shop.id, reason=reason))
    order.shop_id = order.shop_assigned_at = None
    order.commission_percent = order.commission_amount = order.shop_entitlement = None
    order.events.append(OrderEvent(type="rejected_by_shop", actor_id=user.id, note=reason))
    db.flush()
    assign_shop(db, order)  # offer to another shop; stays unassigned for admin if none is available
    db.commit()


def printing_done(db: Session, user: User, order: Order) -> Order:
    _require(order, OrderStatus.printing)
    set_status(db, order, OrderStatus.packing, actor_id=user.id, note="printing done")
    db.commit()
    return order


def packing_done(db: Session, user: User, order: Order) -> Order:
    _require(order, OrderStatus.packing)
    if order.packed_at:
        raise HTTPException(409, "Already marked as packed")
    order.packed_at = datetime.now(UTC)
    order.events.append(OrderEvent(type="packed", actor_id=user.id))
    db.commit()
    return order


def generate_otp(db: Session, user: User, order: Order) -> str:
    _require(order, OrderStatus.packing)
    if not order.packed_at:
        raise HTTPException(409, "Mark binding and packing as done first")
    code = f"{secrets.randbelow(10_000):04d}"
    otp = db.scalar(select(HandoverOtp).where(HandoverOtp.order_id == order.id))
    if otp and otp.used:
        raise HTTPException(409, "This packet has already been handed over")
    if otp:  # regenerating invalidates the previous code
        otp.code_hash, otp.attempts = sec.hash_otp(str(order.id), code), 0
    else:
        db.add(HandoverOtp(order_id=order.id, code_hash=sec.hash_otp(str(order.id), code)))
    db.commit()
    return code


def file_access(order: Order) -> None:
    if order.status not in FILES_VISIBLE:
        raise HTTPException(409, "Accept the order to download its files")


# ---- views ------------------------------------------------------------------------------------


def next_action(order: Order, has_otp: bool) -> str | None:
    if order.status == OrderStatus.placed:
        return "accept"
    if order.status == OrderStatus.printing:
        return "printing_done"
    if order.status == OrderStatus.packing:
        return "handover_otp" if order.packed_at else "packing_done"
    return None


def order_view(db: Session, order: Order) -> dict:
    slot = db.get(CollegeSlot, order.slot_id) if order.slot_id else None
    delivery_at = slot_utils.slot_view(db, slot, order.slot_date, datetime.now(UTC))["delivery_at"] if slot else None
    otp = db.scalar(select(HandoverOtp).where(HandoverOtp.order_id == order.id))
    direct = None
    if order.status == OrderStatus.out_for_delivery:
        direct = db.scalar(
            select(DeliveryBatch.id).join(BatchOrder, BatchOrder.batch_id == DeliveryBatch.id)
            .where(BatchOrder.order_id == order.id, DeliveryBatch.mode == BatchMode.direct,
                   DeliveryBatch.status == BatchStatus.out_for_delivery)
        )
    action = "complete_delivery" if direct else next_action(order, bool(otp))
    return {
        "id": order.id, "code": order.code, "status": order.status,
        "college_name": db.get(College, order.college_id).name, "delivery_at": delivery_at,
        "documents": order.documents, "binding": order.binding, "cover_page": order.cover_page,
        "subject_name": order.subject_name, "subject_code": order.subject_code,
        "cover_template": order.cover_template, "cover_color": order.cover_color, "cover_title": order.cover_title,
        "entitlement": order.shop_entitlement, "next_action": action,
        "can_direct_delivery": order.status == OrderStatus.packing and order.packed_at is not None,
        "direct_batch_id": direct,
        "otp_generated": bool(otp), "assigned_at": order.shop_assigned_at,
    }


def list_orders(db: Session, shop: ShopProfile, tab: str) -> list[Order]:
    statuses = {"new": (OrderStatus.placed,), "pending": PENDING_TAB, "finished": FINISHED_TAB}[tab]
    return list(db.scalars(
        select(Order).where(Order.shop_id == shop.id, Order.status.in_(statuses))
        .order_by(Order.shop_assigned_at.desc()).limit(200)
    ).all())


def _week_start() -> datetime:
    now = datetime.now(UTC).astimezone(slot_utils.IST)
    return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def dashboard(db: Session, shop: ShopProfile) -> dict:
    today = datetime.now(UTC).astimezone(slot_utils.IST).replace(hour=0, minute=0, second=0, microsecond=0)
    count = lambda *where: db.scalar(select(func.count()).select_from(Order).where(Order.shop_id == shop.id, *where))  # noqa: E731
    earned = (
        select(func.coalesce(func.sum(Order.shop_entitlement), 0))
        .where(Order.shop_id == shop.id, Order.status.in_(EARNING))
    )
    weekly = (
        select(func.coalesce(func.sum(Order.shop_entitlement), 0))
        .select_from(Order).join(OrderEvent, OrderEvent.order_id == Order.id)
        .where(Order.shop_id == shop.id, Order.status.in_(EARNING),
               OrderEvent.type == OrderStatus.handover_verified.value, OrderEvent.created_at >= _week_start())
    )
    return {
        "is_open": shop.is_open,
        "orders_today": count(Order.shop_assigned_at >= today),
        "new_orders": count(Order.status == OrderStatus.placed),
        "pending_orders": count(Order.status.in_(PENDING_TAB)),
        "weekly_earnings": db.scalar(weekly),
        "total_earnings": db.scalar(earned),
    }


def accounting(db: Session, shop: ShopProfile) -> dict:
    unsettled = (Order.shop_id == shop.id, Order.status.in_(EARNING), Order.settlement_id.is_(None))
    return {
        "unsettled_orders": db.scalar(select(func.count()).select_from(Order).where(*unsettled)),
        "unsettled_amount": db.scalar(select(func.coalesce(func.sum(Order.shop_entitlement), 0)).where(*unsettled)),
        "settlements": db.scalars(
            select(Settlement).where(Settlement.shop_id == shop.id).order_by(Settlement.period_start.desc()).limit(52)
        ).all(),
    }
