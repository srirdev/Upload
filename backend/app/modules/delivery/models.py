import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.db.types import enum_col


class BatchMode(str, enum.Enum):
    consolidated = "consolidated"  # a delivery partner collects from several shops
    direct = "direct"  # the shop delivers its own order to the cabin


class BatchStatus(str, enum.Enum):
    unassigned = "unassigned"  # no eligible rider yet
    offered = "offered"
    accepted = "accepted"
    out_for_delivery = "out_for_delivery"
    completed = "completed"
    cancelled = "cancelled"


OPEN_BATCH = (BatchStatus.unassigned, BatchStatus.offered, BatchStatus.accepted)
ACTIVE_BATCH = (BatchStatus.offered, BatchStatus.accepted, BatchStatus.out_for_delivery)


class DeliveryBatch(Base):
    __tablename__ = "delivery_batches"
    __table_args__ = (
        CheckConstraint("mode = 'consolidated' OR shop_id IS NOT NULL", name="direct_has_shop"),
        CheckConstraint("payout_total IS NULL OR payout_total >= 0", name="payout_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True)
    mode: Mapped[BatchMode] = mapped_column(enum_col(BatchMode), default=BatchMode.consolidated)
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), index=True)
    slot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("college_slots.id"), index=True)
    slot_date: Mapped[date] = mapped_column(Date)
    rider_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rider_profiles.id"), index=True)
    shop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop_profiles.id"), index=True)  # direct mode only
    status: Mapped[BatchStatus] = mapped_column(enum_col(BatchStatus), default=BatchStatus.unassigned, index=True)
    offered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    departed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Rider payout snapshot, written once when the trip finishes
    payout_base: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    payout_extra_shops: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    payout_packet_bonus: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    payout_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    settlement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rider_settlements.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BatchOrderStatus(str, enum.Enum):
    pending = "pending"
    picked_up = "picked_up"
    skipped = "skipped"  # shop wasn't ready within the no-wait window
    removed = "removed"  # moved to another batch / direct delivery


class BatchOrder(Base):
    __tablename__ = "batch_orders"
    __table_args__ = (UniqueConstraint("batch_id", "order_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_batches.id"), index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), index=True)  # pickup point
    status: Mapped[BatchOrderStatus] = mapped_column(enum_col(BatchOrderStatus), default=BatchOrderStatus.pending)
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)


class BatchShopArrival(Base):
    """When the rider reported arriving at a shop (starts the no-wait clock)."""

    __tablename__ = "batch_shop_arrivals"

    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_batches.id"), primary_key=True)
    shop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_profiles.id"), primary_key=True, index=True)
    arrived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BatchDecline(Base):
    __tablename__ = "batch_declines"

    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_batches.id"), primary_key=True)
    rider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rider_profiles.id"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustodyEvent(Base):
    """Append-only chain of custody for a packet."""

    __tablename__ = "custody_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("delivery_batches.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShelfPhoto(Base):
    __tablename__ = "shelf_photos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_batches.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(400), unique=True)  # private object storage
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
