import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, event,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.types import enum_col
from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided


class ShopStatus(str, enum.Enum):
    pending = "pending"  # registered, awaiting admin approval
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class ShopProfile(Base):
    __tablename__ = "shop_profiles"
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="coordinates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    shop_name: Mapped[str] = mapped_column(String(160))
    owner_name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    area: Mapped[str] = mapped_column(String(160))
    landmark: Mapped[str | None] = mapped_column(String(160))
    upi_id: Mapped[str | None] = mapped_column(String(80))
    bank_account_name: Mapped[str | None] = mapped_column(String(120))
    bank_account_number: Mapped[str | None] = mapped_column(String(30))
    bank_ifsc: Mapped[str | None] = mapped_column(String(11))
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[ShopStatus] = mapped_column(enum_col(ShopStatus), default=ShopStatus.pending)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    is_open: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    offered: Mapped[list["ShopService"]] = relationship(cascade="all, delete-orphan", lazy="selectin")

    @property
    def services(self) -> list[str]:
        return sorted(s.service_code for s in self.offered)


class ShopCollege(Base):
    """Which colleges a shop serves (assigned by admin)."""

    __tablename__ = "shop_colleges"

    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), primary_key=True)
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), primary_key=True, index=True)


def print_service(paper_size: PaperSize, color: ColorMode) -> str:
    return f"print_{paper_size.value.lower()}_{color.value}"


def binding_service(binding: Binding) -> str:
    return f"binding_{binding.value}"


SERVICES = {
    **{print_service(p, c): ("print", f"{p.value} {'colour' if c == ColorMode.color else 'black & white'} printing")
       for p in PaperSize for c in ColorMode},
    **{binding_service(b): ("binding", f"{b.value.capitalize()} binding") for b in Binding if b != Binding.none},
}


class Service(Base):
    """Catalogue of services a shop can offer (reference data)."""

    __tablename__ = "services"
    __table_args__ = (CheckConstraint("category IN ('print', 'binding')", name="category"),)

    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(80))


@event.listens_for(Service.__table__, "after_create")
def _seed_services(table, connection, **_) -> None:
    connection.execute(table.insert(), [{"code": k, "category": c, "label": l} for k, (c, l) in SERVICES.items()])


class ShopService(Base):
    """Services a shop offers; orders are only assigned to shops offering everything the order needs."""

    __tablename__ = "shop_services"

    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), primary_key=True)
    service_code: Mapped[str] = mapped_column(ForeignKey("services.code"), primary_key=True, index=True)


class OrderRejection(Base):
    """A shop declined an order; it is never offered to that shop again."""

    __tablename__ = "order_rejections"
    __table_args__ = (UniqueConstraint("order_id", "shop_id", name="uq_order_rejections_order_id_shop_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HandoverOtp(Base):
    """Four-digit code the shop gives the rider at pickup (the rider verifies it in Phase 5)."""

    __tablename__ = "handover_otps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SettlementStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"


class Settlement(Base):
    """Weekly payout to a shop. Created and paid by admin (Phase 6); shops read them here."""

    __tablename__ = "settlements"
    __table_args__ = (
        UniqueConstraint("shop_id", "period_start", "period_end"),
        CheckConstraint("period_end >= period_start", name="period"),
        CheckConstraint("order_count >= 0 AND gross_amount >= 0 AND refund_deductions >= 0", name="amounts_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    order_count: Mapped[int] = mapped_column(Integer)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    refund_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[SettlementStatus] = mapped_column(enum_col(SettlementStatus), default=SettlementStatus.pending)
    upi_reference: Mapped[str | None] = mapped_column(String(80))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShopRateCard(Base):
    """A shop's own customer price per printed page; students compare shops on these prices."""

    __tablename__ = "shop_rate_cards"
    __table_args__ = (
        UniqueConstraint("shop_id", "paper_size", "gsm", "color", "sided", name="uq_shop_rate_cards_shop_item"),
        CheckConstraint("gsm IN (70, 80, 100)", name="gsm_allowed"),
        CheckConstraint("price_per_page >= 0", name="price_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), index=True)
    paper_size: Mapped[PaperSize] = mapped_column(enum_col(PaperSize))
    gsm: Mapped[int] = mapped_column(Integer)
    color: Mapped[ColorMode] = mapped_column(enum_col(ColorMode))
    sided: Mapped[Sided] = mapped_column(enum_col(Sided))
    price_per_page: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class ShopBindingPrice(Base):
    """A shop's own customer price per bound copy."""

    __tablename__ = "shop_binding_prices"
    __table_args__ = (
        CheckConstraint("binding <> 'none'", name="binding_not_none"),
        CheckConstraint("price >= 0", name="price_non_negative"),
    )

    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), primary_key=True)
    binding: Mapped[Binding] = mapped_column(enum_col(Binding), primary_key=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
