import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from app.modules.orders import service
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order
from app.modules.orders.schemas import (
    BindingIn, CheckoutOut, DeliveryIn, DocConfigIn, DocumentOut, OrderDetail, OrderSummary, QuotationOut, QuotePreviewIn,
    ShopChoiceIn,
    ShopOption,
)
from app.modules.payments import service as payments
from app.modules.shops import service as shops

router = APIRouter(prefix="/orders", tags=["orders"])
student_only = require_roles(Role.student)


def _detail(db: Session, order: Order) -> dict:
    return service.detail(db, order)


@router.post("", response_model=OrderDetail, status_code=201)
def create_order(user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _detail(db, service.create_draft(db, user))


@router.get("", response_model=list[OrderSummary])
def list_orders(user: User = Depends(student_only), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Order).where(Order.student_id == user.id, Order.status != OrderStatus.draft)
        .order_by(Order.created_at.desc()).limit(100)
    ).all()
    return [service.summary(o) for o in rows]


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _detail(db, service.get_order(db, user, order_id))


@router.post("/{order_id}/documents", response_model=DocumentOut, status_code=201)
def upload_document(order_id: uuid.UUID, file: UploadFile = File(...), user: User = Depends(student_only),
                    db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    # Read at most limit+1 bytes so oversized uploads are rejected without buffering everything.
    from app.modules.finance.models import PlatformConfig

    limit = db.get(PlatformConfig, 1).max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    return service.add_document(db, order, file.filename or "document", data)


@router.delete("/{order_id}/documents/{doc_id}", status_code=204)
def delete_document(order_id: uuid.UUID, doc_id: uuid.UUID, user: User = Depends(student_only),
                    db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    service.remove_document(db, order, service.get_document(order, doc_id))


@router.get("/{order_id}/documents/{doc_id}/url")
def document_url(order_id: uuid.UUID, doc_id: uuid.UUID, preview: bool = False, user: User = Depends(student_only),
                 db: Session = Depends(get_db)) -> dict[str, str]:
    """Short-lived signed URL for the original, or (preview=true) the PDF converted from a DOCX/PPTX."""
    doc = service.get_document(service.get_order(db, user, order_id), doc_id)
    if preview and not doc.preview_key:
        raise HTTPException(404, "No preview yet")
    return {"url": storage.presign_get(doc.preview_key if preview else doc.storage_key, expires=300)}


@router.get("/{order_id}/documents/{doc_id}/file")
def document_file(order_id: uuid.UUID, doc_id: uuid.UUID, preview: bool = False, user: User = Depends(student_only),
                  db: Session = Depends(get_db)) -> Response:
    """The document's bytes through the API (same origin), for the in-browser Print Preview Studio renderer.

    `preview=true` returns the PDF converted from a DOCX/PPTX. Only the owner can read it; never cached publicly.
    """
    doc = service.get_document(service.get_order(db, user, order_id), doc_id)
    if preview and not doc.preview_key:
        raise HTTPException(404, "No preview yet")
    data = storage.get_object(doc.preview_key if preview else doc.storage_key)
    return Response(
        content=data,
        media_type="application/pdf" if preview else doc.content_type,
        headers={"Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff"},
    )


@router.put("/{order_id}/documents/{doc_id}/config", response_model=DocumentOut)
def configure_document(order_id: uuid.UUID, doc_id: uuid.UUID, body: DocConfigIn,
                       user: User = Depends(student_only), db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    return service.set_document_config(db, service.get_document(order, doc_id), body)


@router.put("/{order_id}/binding", response_model=OrderDetail)
def set_binding(order_id: uuid.UUID, body: BindingIn, user: User = Depends(student_only),
                db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    service.set_binding(db, order, body)
    return _detail(db, order)


@router.put("/{order_id}/delivery", response_model=OrderDetail)
def set_delivery(order_id: uuid.UUID, body: DeliveryIn, user: User = Depends(student_only),
                 db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    service.set_delivery(db, order, body)
    return _detail(db, order)


@router.get("/{order_id}/quotation", response_model=QuotationOut)
def get_quotation(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    order = service.get_order(db, user, order_id)
    if order.quotation and order.status not in service.EDITABLE:
        return order.quotation
    return service.compute_quote(db, order)


@router.post("/{order_id}/quotation/preview", response_model=QuotationOut)
def preview_quotation(order_id: uuid.UUID, body: QuotePreviewIn, user: User = Depends(student_only),
                      db: Session = Depends(get_db)):
    """Prices unsaved studio settings so the total updates live. Read-only: the order is never changed here."""
    order = service.get_editable(db, user, order_id)
    return service.compute_quote(db, order, proposal=body)


@router.get("/{order_id}/shop-options", response_model=list[ShopOption])
def shop_options(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    """Compare prices: each eligible shop's quote on its own rate card, plus the standard price."""
    return shops.shop_options(db, service.get_order(db, user, order_id))


@router.put("/{order_id}/shop", response_model=OrderDetail)
def choose_shop(order_id: uuid.UUID, body: ShopChoiceIn, user: User = Depends(student_only),
                db: Session = Depends(get_db)):
    order = service.get_editable(db, user, order_id)
    shops.choose_shop(db, order, body.shop_id)
    return _detail(db, order)


@router.post("/{order_id}/checkout", response_model=CheckoutOut)
def checkout(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    order = service.get_order(db, user, order_id)
    if order.status in service.EDITABLE:
        shops.require_chosen_shop_available(db, order)
    return payments.start_checkout(db, order)


@router.post("/{order_id}/cancel", response_model=OrderDetail)
def cancel_order(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _detail(db, service.cancel(db, service.get_order(db, user, order_id)))


@router.post("/{order_id}/collect", response_model=OrderDetail)
def collect_order(order_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _detail(db, service.collect(db, service.get_order(db, user, order_id)))
