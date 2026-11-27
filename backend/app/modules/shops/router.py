import uuid
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from app.modules.colleges.models import College
from app.modules.delivery import service as delivery
from app.modules.orders.service import get_document
from app.modules.shops import documents as pdfs
from app.modules.shops import service
from app.modules.shops.schemas import (
    AccountingOut, DashboardOut, OpenIn, OtpOut, RateCardIn, RateCardOut, RejectIn, ServiceOut, ServicesIn, ShopOrderOut,
    ShopOut, ShopRegisterIn,
)
from app.modules.shops.models import Service
from app.modules.students.models import StudentProfile
from fastapi import HTTPException

router = APIRouter(prefix="/shops", tags=["shops"])
shop_only = require_roles(Role.shop)


@router.post("/me", response_model=ShopOut, status_code=201)
def register(body: ShopRegisterIn, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.register(db, user, body)


@router.get("/services", response_model=list[ServiceOut])
def services(_: User = Depends(shop_only), db: Session = Depends(get_db)):
    """Catalogue of services a shop can offer."""
    return db.scalars(select(Service).order_by(Service.category.desc(), Service.code)).all()


@router.put("/me/services", response_model=ShopOut)
def set_services(body: ServicesIn, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.set_services(db, service.get_shop(db, user), body.services)


@router.get("/me/rate-card", response_model=RateCardOut)
def get_rate_card(user: User = Depends(shop_only), db: Session = Depends(get_db)):
    """The shop's own customer prices (students compare shops on these)."""
    return service.rate_card(db, service.get_shop(db, user))


@router.put("/me/rate-card", response_model=RateCardOut)
def set_rate_card(body: RateCardIn, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.set_rate_card(db, service.get_shop(db, user), body)


@router.get("/me", response_model=ShopOut)
def me(user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.get_shop(db, user)


@router.put("/me/open", response_model=ShopOut)
def set_open(body: OpenIn, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.set_open(db, service.get_approved_shop(db, user), body.is_open)


@router.get("/me/dashboard", response_model=DashboardOut)
def dashboard(user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.dashboard(db, service.get_approved_shop(db, user))


@router.get("/me/accounting", response_model=AccountingOut)
def accounting(user: User = Depends(shop_only), db: Session = Depends(get_db)):
    return service.accounting(db, service.get_approved_shop(db, user))


@router.get("/me/orders", response_model=list[ShopOrderOut])
def list_orders(tab: str = Query("new", pattern="^(new|pending|finished)$"), user: User = Depends(shop_only),
                db: Session = Depends(get_db)):
    shop = service.get_approved_shop(db, user)
    return [service.order_view(db, o) for o in service.list_orders(db, shop, tab)]


def _owned(db: Session, user: User, order_id: uuid.UUID):
    shop = service.get_approved_shop(db, user)
    return shop, service.get_order(db, shop, order_id)


@router.post("/me/orders/{order_id}/accept", response_model=ShopOrderOut)
def accept(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    shop, order = _owned(db, user, order_id)
    return service.order_view(db, service.accept(db, user, shop, order))


@router.post("/me/orders/{order_id}/reject", status_code=204)
def reject(order_id: uuid.UUID, body: RejectIn, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    shop, order = _owned(db, user, order_id)
    service.reject(db, user, shop, order, body.reason.strip())


@router.post("/me/orders/{order_id}/printing-done", response_model=ShopOrderOut)
def printing_done(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    _, order = _owned(db, user, order_id)
    return service.order_view(db, service.printing_done(db, user, order))


@router.post("/me/orders/{order_id}/packing-done", response_model=ShopOrderOut)
def packing_done(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    _, order = _owned(db, user, order_id)
    return service.order_view(db, service.packing_done(db, user, order))


@router.post("/me/orders/{order_id}/handover-otp", response_model=OtpOut)
def handover_otp(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    _, order = _owned(db, user, order_id)
    return OtpOut(code=service.generate_otp(db, user, order))


@router.get("/me/orders/{order_id}/documents/{doc_id}/url")
def document_url(order_id: uuid.UUID, doc_id: uuid.UUID, user: User = Depends(shop_only),
                 db: Session = Depends(get_db)) -> dict[str, str]:
    _, order = _owned(db, user, order_id)
    service.file_access(order)
    return {"url": storage.presign_get(get_document(order, doc_id).storage_key, expires=300)}


def _pdf(data: bytes, name: str) -> Response:
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{name}"'})


@router.get("/me/orders/{order_id}/cover.pdf")
def cover(order_id: uuid.UUID, document_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    _, order = _owned(db, user, order_id)
    service.file_access(order)
    if not order.cover_page:
        raise HTTPException(404, "This order has no cover page")
    student = db.scalar(select(StudentProfile).where(StudentProfile.user_id == order.student_id))
    return _pdf(pdfs.cover_pdf(order, student, db.get(College, order.college_id), get_document(order, document_id)),
                f"{order.code}-cover.pdf")


@router.get("/me/orders/{order_id}/label.pdf")
def label(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)):
    _, order = _owned(db, user, order_id)
    service.file_access(order)
    student = db.scalar(select(StudentProfile).where(StudentProfile.user_id == order.student_id))
    return _pdf(pdfs.label_pdf(order, student, db.get(College, order.college_id)), f"{order.code}-label.pdf")


@router.post("/me/orders/{order_id}/direct-delivery")
def direct_delivery(order_id: uuid.UUID, user: User = Depends(shop_only), db: Session = Depends(get_db)) -> dict[str, str]:
    """Deliver this packed order to the college cabin yourself. Finish with the shelf-photo + complete calls."""
    shop, order = _owned(db, user, order_id)
    batch = delivery.direct_delivery(db, user, shop, order)
    return {"batch_id": str(batch.id)}
