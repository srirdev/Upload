import hmac
import hashlib
import json
import logging
from datetime import UTC, datetime

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.finance import ledger
from app.modules.notifications.models import notify
from app.modules.orders import service as orders
from app.modules.orders.enums import OrderStatus, PaymentStatus
from app.modules.orders.models import Order
from app.modules.orders.schemas import CheckoutOut
from app.modules.payments.models import GatewayStatus, Payment, Refund, WebhookEvent
from app.modules.shops.service import assign_shop

log = logging.getLogger(__name__)
RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"


def _require_keys() -> tuple[str, str]:
    s = get_settings()
    if not (s.razorpay_key_id and s.razorpay_key_secret):
        raise HTTPException(503, "Online payments are not configured yet")
    return s.razorpay_key_id, s.razorpay_key_secret


def create_gateway_order(amount_paise: int, receipt: str) -> str:
    """Creates a Razorpay order via their REST API. Tests replace this function."""
    key_id, secret = _require_keys()
    try:
        res = httpx.post(
            RAZORPAY_ORDERS_URL, auth=(key_id, secret), timeout=15,
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt, "payment_capture": 1},
        )
        res.raise_for_status()
        return res.json()["id"]
    except (httpx.HTTPError, KeyError, ValueError):
        log.exception("Razorpay order creation failed")
        raise HTTPException(502, "Payment provider is unavailable. Please try again.") from None


def start_checkout(db: Session, order: Order) -> CheckoutOut:
    if order.status not in orders.EDITABLE:
        raise HTTPException(409, "This order has already been placed")
    key_id, _ = _require_keys()
    quotation = orders.lock_quotation(db, order)  # server-side price; client never supplies an amount
    amount_paise = int(quotation.total * 100)
    if amount_paise <= 0:
        raise HTTPException(422, "Order total must be greater than zero")
    gateway_order_id = create_gateway_order(amount_paise, order.code)

    db.execute(update(Payment).where(Payment.order_id == order.id).values(is_current=False))
    db.add(Payment(order_id=order.id, provider_order_id=gateway_order_id, amount=quotation.total))
    order.checkout_at = datetime.now(UTC)
    order.payment_status = PaymentStatus.pending
    if order.status != OrderStatus.awaiting_payment:
        orders.set_status(db, order, OrderStatus.awaiting_payment, actor_id=order.student_id)
    db.commit()
    return CheckoutOut(razorpay_key_id=key_id, razorpay_order_id=gateway_order_id,
                       amount_paise=amount_paise, currency="INR")


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def mark_paid(db: Session, payment: Payment, provider_payment_id: str) -> Order:
    """Idempotent: safe to call from both the browser verify call and the webhook."""
    payment = db.scalar(select(Payment).where(Payment.id == payment.id).with_for_update())
    order = db.get(Order, payment.order_id)
    if payment.status == GatewayStatus.captured:
        return order
    payment.status = GatewayStatus.captured
    payment.provider_payment_id = provider_payment_id
    payment.captured_at = datetime.now(UTC)

    if order.status == OrderStatus.awaiting_payment and payment.is_current:
        order.payment_status = PaymentStatus.paid
        orders.set_status(db, order, OrderStatus.placed, note="payment verified")
        notify(db, order.student_id, "order_placed", "Order confirmed",
               f"{order.code} is confirmed. We'll let you know when printing starts.", order.id)
        ledger.record_payment(db, order, payment.amount, payment.provider_order_id, applied=True)
        assign_shop(db, order)  # may stay unassigned (no open shop yet); assigned when one opens or admin acts
    else:
        ledger.record_payment(db, order, payment.amount, payment.provider_order_id, applied=False)
        # Money arrived for an order that can't use it (superseded checkout, edited or cancelled order).
        db.add(Refund(order_id=order.id, payment_id=payment.id, amount=payment.amount,
                      reason="Payment received for an order that was no longer awaiting payment"))
        if order.payment_status != PaymentStatus.paid:
            order.payment_status = PaymentStatus.refund_pending
        notify(db, order.student_id, "refund_update", "Refund requested",
               "A payment could not be applied to your order and will be refunded.", order.id)
    return order


def verify_checkout(db: Session, user: User, razorpay_order_id: str, razorpay_payment_id: str,
                    signature: str) -> Order:
    _, secret = _require_keys()
    payment = db.scalar(select(Payment).where(Payment.provider_order_id == razorpay_order_id))
    order = db.get(Order, payment.order_id) if payment else None
    if not payment or order.student_id != user.id:
        raise HTTPException(404, "Payment not found")
    expected = _sign(secret, f"{razorpay_order_id}|{razorpay_payment_id}".encode())
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Payment verification failed")
    order = mark_paid(db, payment, razorpay_payment_id)
    db.commit()
    return order


def handle_webhook(db: Session, raw_body: bytes, signature: str | None, event_id: str | None) -> dict:
    secret = get_settings().razorpay_webhook_secret
    if not secret:
        raise HTTPException(503, "Webhook secret is not configured")
    if not signature or not hmac.compare_digest(_sign(secret, raw_body), signature):
        raise HTTPException(400, "Invalid signature")
    if not event_id:
        raise HTTPException(400, "Missing event id")
    try:
        event = json.loads(raw_body)
        entity = event["payload"]["payment"]["entity"]
    except (ValueError, KeyError, TypeError):
        return {"status": "ignored"}  # an event type we don't use; acknowledge so Razorpay stops retrying

    if db.get(WebhookEvent, event_id):
        return {"status": "duplicate"}
    db.add(WebhookEvent(event_id=event_id))
    try:
        db.flush()
    except IntegrityError:  # concurrent delivery of the same event
        db.rollback()
        return {"status": "duplicate"}

    payment = db.scalar(select(Payment).where(Payment.provider_order_id == entity.get("order_id")))
    if payment:
        if event.get("event") == "payment.captured":
            if entity.get("amount") != int(payment.amount * 100):
                log.error("Webhook amount mismatch for %s", payment.provider_order_id)
            else:
                mark_paid(db, payment, entity["id"])
        elif event.get("event") == "payment.failed" and payment.status == GatewayStatus.created:
            payment.status = GatewayStatus.failed
    db.commit()
    return {"status": "ok"}
