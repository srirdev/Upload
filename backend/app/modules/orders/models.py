import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.types import JsonB, enum_col
from app.modules.orders.enums import (
    Binding, ColorMode, ConversionStatus, CoverColor, CoverTemplate, Orientation, OrderStatus, PaperSize, PaymentStatus, Sided,
)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("id", "student_id", name="uq_orders_id_student_id"),  # target of complaints' (order_id, student_id) owner FK
        CheckConstraint("commission_percent BETWEEN 0 AND 100", name="commission_percent_range"),
        CheckConstraint("commission_amount >= 0 AND shop_entitlement >= 0", name="split_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True)  # human-friendly, e.g. UP-7K2M9Q
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), index=True)
    slot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("college_slots.id"), index=True)
    slot_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[OrderStatus] = mapped_column(enum_col(OrderStatus), default=OrderStatus.draft, index=True)
    payment_status: Mapped[PaymentStatus] = mapped_column(enum_col(PaymentStatus), default=PaymentStatus.unpaid, index=True)
    binding: Mapped[Binding] = mapped_column(enum_col(Binding), default=Binding.none)
    cover_page: Mapped[bool] = mapped_column(Boolean, default=False)
    subject_name: Mapped[str | None] = mapped_column(String(120))
    subject_code: Mapped[str | None] = mapped_column(String(40))
    # Cover page design (Print Preview Studio); the shop's cover PDF is generated from these.
    cover_template: Mapped[CoverTemplate] = mapped_column(
        enum_col(CoverTemplate), default=CoverTemplate.classic, server_default="classic"
    )
    cover_color: Mapped[CoverColor] = mapped_column(enum_col(CoverColor), default=CoverColor.navy, server_default="navy")
    cover_title: Mapped[str | None] = mapped_column(String(160))  # project / assignment title (optional)
    coupon_code: Mapped[str | None] = mapped_column(String(40))
    # Shop the student picked after comparing prices (NULL = standard price, auto-assigned). Frozen at checkout.
    chosen_shop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop_profiles.id"), index=True)
    checkout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Shop assignment and its money split (snapshotted at assignment so later config changes don't rewrite history)
    shop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop_profiles.id"), index=True)
    shop_assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    commission_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    commission_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    shop_entitlement: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    packed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settlement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("settlements.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["OrderDocument"]] = relationship(
        order_by="OrderDocument.position", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list["OrderEvent"]] = relationship(
        order_by="OrderEvent.created_at", cascade="all, delete-orphan", lazy="selectin"
    )
    quotation: Mapped["OrderQuotation | None"] = relationship(
        cascade="all, delete-orphan", lazy="selectin", uselist=False
    )


class OrderDocument(Base):
    __tablename__ = "order_documents"
    __table_args__ = (
        CheckConstraint("copies >= 1", name="copies_positive"),
        CheckConstraint("page_count IS NULL OR page_count >= 1", name="page_count_positive"),
        CheckConstraint("size_bytes > 0", name="size_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(400), unique=True)  # private object storage; never a public URL
    page_count: Mapped[int | None] = mapped_column(Integer)
    page_count_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    copies: Mapped[int] = mapped_column(Integer, default=1)
    paper_size: Mapped[PaperSize] = mapped_column(enum_col(PaperSize), default=PaperSize.A4)
    orientation: Mapped[Orientation] = mapped_column(enum_col(Orientation), default=Orientation.auto, server_default="auto")
    conversion_status: Mapped[ConversionStatus] = mapped_column(
        enum_col(ConversionStatus), default=ConversionStatus.not_needed, server_default="not_needed"
    )
    preview_key: Mapped[str | None] = mapped_column(String(400), unique=True)  # converted PDF (private storage)

    @property
    def has_preview(self) -> bool:
        return self.preview_key is not None

    rules: Mapped[list["PrintRule"]] = relationship(
        order_by="PrintRule.page_from", cascade="all, delete-orphan", lazy="selectin"
    )


class PrintRule(Base):
    """Page-level print settings: pages page_from..page_to (inclusive, 1-based)."""

    __tablename__ = "print_rules"
    __table_args__ = (
        CheckConstraint("page_from >= 1 AND page_to >= page_from", name="page_range"),
        CheckConstraint("gsm IN (70, 80, 100)", name="gsm_allowed"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("order_documents.id"), index=True)
    page_from: Mapped[int] = mapped_column(Integer)
    page_to: Mapped[int] = mapped_column(Integer)
    color: Mapped[ColorMode] = mapped_column(enum_col(ColorMode))
    gsm: Mapped[int] = mapped_column(Integer)
    sided: Mapped[Sided] = mapped_column(enum_col(Sided))


class OrderQuotation(Base):
    """Immutable price snapshot taken at checkout; the payment amount is derived from it."""

    __tablename__ = "order_quotations"
    __table_args__ = (
        CheckConstraint("printing_amount >= 0 AND binding_amount >= 0 AND cover_amount >= 0 AND delivery_fee >= 0 "
                        "AND discount >= 0 AND total >= 0", name="amounts_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    printing_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    binding_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cover_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    lines: Mapped[list] = mapped_column(JsonB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrderEvent(Base):
    """Append-only order history. Status changes record from_status -> to_status; other events leave them NULL."""

    __tablename__ = "order_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))  # an OrderStatus value or an event name ("assigned", ...)
    from_status: Mapped[OrderStatus | None] = mapped_column(enum_col(OrderStatus, "from_status"))
    to_status: Mapped[OrderStatus | None] = mapped_column(enum_col(OrderStatus, "to_status"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
