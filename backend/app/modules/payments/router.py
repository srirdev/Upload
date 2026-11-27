from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from app.modules.orders import service as orders
from app.modules.orders.schemas import OrderDetail
from app.modules.payments import service

router = APIRouter(prefix="/payments", tags=["payments"])


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/verify", response_model=OrderDetail)
def verify(body: VerifyIn, user: User = Depends(require_roles(Role.student)), db: Session = Depends(get_db)):
    order = service.verify_checkout(db, user, body.razorpay_order_id, body.razorpay_payment_id,
                                    body.razorpay_signature)
    return orders.detail(db, order)


@router.post("/webhook")
async def webhook(request: Request, x_razorpay_signature: str | None = Header(default=None),
                  x_razorpay_event_id: str | None = Header(default=None), db: Session = Depends(get_db)):
    return service.handle_webhook(db, await request.body(), x_razorpay_signature, x_razorpay_event_id)
