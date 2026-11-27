import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Numeric, String, Text, UniqueConstraint, Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.db.types import enum_col


class GatewayStatus(str, enum.Enum):
    created = "created"
    captured = "captured"
    failed = "failed"


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("id", "order_id", name="uq_payments_id_order_id"),  # target of refunds' (payment_id, order_id) FK
        CheckConstraint("amount > 0", name="amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    provider_order_id: Mapped[str] = mapped_column(String(80), unique=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(80))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)  # False once a newer checkout supersedes it
    status: Mapped[GatewayStatus] = mapped_column(enum_col(GatewayStatus), default=GatewayStatus.created, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEvent(Base):
    """Processed webhook ids, for idempotency."""

    __tablename__ = "webhook_events"

    event_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefundStatus(str, enum.Enum):
    requested = "requested"
    approved = "approved"
    rejected = "rejected"
    processed = "processed"


class Refund(Base):
    """Refunds are requested automatically on eligible cancellations; admin approves/rejects (Phase 6)."""

    __tablename__ = "refunds"
    # order_id is kept for per-order queries; the composite FK guarantees it matches the payment's order.
    __table_args__ = (
        ForeignKeyConstraint(["payment_id", "order_id"], ["payments.id", "payments.order_id"],
                             name="fk_refunds_payment_order"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("shop_deduction >= 0 AND shop_deduction <= amount", name="shop_deduction_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[RefundStatus] = mapped_column(enum_col(RefundStatus), default=RefundStatus.requested, index=True)
    reason: Mapped[str | None] = mapped_column(Text)
    provider_ref: Mapped[str | None] = mapped_column(String(80))
    complaint_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("complaints.id"), index=True)
    shop_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)  # recovered from the shop's next payout
    shop_settlement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("settlements.id"), index=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
