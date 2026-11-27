import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.db.types import JsonB, enum_col
from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided


class PlatformConfig(Base):
    """Single-row admin-editable settings (id is always 1)."""

    __tablename__ = "platform_config"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("commission_percent BETWEEN 0 AND 100 AND gateway_fee_percent BETWEEN 0 AND 100 "
                        "AND late_refund_percent BETWEEN 0 AND 100", name="percents"),
        CheckConstraint("delivery_fee >= 0 AND cover_page_fee >= 0 AND rider_base_fee >= 0 AND rider_extra_shop_fee >= 0 "
                        "AND rider_packet_bonus >= 0 AND rider_min_guarantee >= 0", name="fees_non_negative"),
        CheckConstraint("max_upload_mb > 0 AND slot_hold_minutes > 0 AND no_wait_minutes >= 0", name="limits"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    cover_page_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    commission_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    max_upload_mb: Mapped[int] = mapped_column(Integer, default=25)
    # Orders awaiting payment hold their slot for this long.
    slot_hold_minutes: Mapped[int] = mapped_column(Integer, default=15)
    # Rider payout structure (per trip)
    rider_base_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, server_default="0")
    rider_extra_shop_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, server_default="0")
    rider_packet_bonus: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, server_default="0")
    rider_min_guarantee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, server_default="0")
    # Rider waits this long at a shop before they may mark its orders "not ready"
    no_wait_minutes: Mapped[int] = mapped_column(Integer, default=4, server_default="4")
    # Estimated gateway fee (actual fees come from Razorpay settlement reports); % of the amount paid
    gateway_fee_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default="0")
    # Suggested refund % when a shop delivers late (admin still decides each refund)
    late_refund_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default="0")


class RateCard(Base):
    """Customer price per printed page, per (paper size, GSM, colour, sidedness)."""

    __tablename__ = "rate_cards"
    __table_args__ = (
        UniqueConstraint("paper_size", "gsm", "color", "sided"),
        CheckConstraint("gsm IN (70, 80, 100)", name="gsm_allowed"),
        CheckConstraint("price_per_page >= 0", name="price_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    paper_size: Mapped[PaperSize] = mapped_column(enum_col(PaperSize))
    gsm: Mapped[int] = mapped_column(Integer)
    color: Mapped[ColorMode] = mapped_column(enum_col(ColorMode))
    sided: Mapped[Sided] = mapped_column(enum_col(Sided))
    price_per_page: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class BindingPrice(Base):
    """Price per bound copy of a document."""

    __tablename__ = "binding_prices"
    __table_args__ = (CheckConstraint("price >= 0", name="price_non_negative"),)

    binding: Mapped[Binding] = mapped_column(enum_col(Binding), primary_key=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class Coupon(Base):
    __tablename__ = "coupons"
    __table_args__ = (
        CheckConstraint("(percent_off IS NULL) <> (flat_off IS NULL)", name="one_discount_kind"),
        CheckConstraint("percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)", name="percent_range"),
        CheckConstraint("flat_off IS NULL OR flat_off > 0", name="flat_positive"),
    )

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    percent_off: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    flat_off: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LedgerType(str, enum.Enum):
    # money in / revenue breakdown
    gross_revenue = "gross_revenue"  # everything the customer paid
    printing_charges = "printing_charges"  # printing + binding + cover (before discount)
    delivery_fee = "delivery_fee"
    discount = "discount"  # coupon value borne by the platform
    # money out / costs
    shop_entitlement = "shop_entitlement"
    rider_payout = "rider_payout"
    gateway_fee = "gateway_fee"
    refund = "refund"  # returned to customers
    shop_refund_recovery = "shop_refund_recovery"  # recovered from a shop for a validated defect
    # informational split of printing_charges
    platform_commission = "platform_commission"


class LedgerEntry(Base):
    """Append-only financial record. `ref` makes every posting idempotent (never double-counted)."""

    __tablename__ = "ledger_entries"
    __table_args__ = (CheckConstraint("amount >= 0", name="amount_non_negative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ref: Mapped[str] = mapped_column(String(120), unique=True)
    type: Mapped[LedgerType] = mapped_column(enum_col(LedgerType), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # always >= 0; the type gives the direction
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"), index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("delivery_batches.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AuditLog(Base):
    """Who changed what. Written for every admin mutation and financial action."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(60))
    data: Mapped[dict | None] = mapped_column(JsonB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
