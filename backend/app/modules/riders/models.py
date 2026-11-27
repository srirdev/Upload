import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.db.types import enum_col


class KycStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class RiderProfile(Base):
    __tablename__ = "rider_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    base_area: Mapped[str] = mapped_column(String(160))
    vehicle_number: Mapped[str] = mapped_column(String(20))
    upi_id: Mapped[str] = mapped_column(String(80))
    dl_key: Mapped[str | None] = mapped_column(String(400))  # driving licence (private storage)
    rc_key: Mapped[str | None] = mapped_column(String(400))  # vehicle RC (private storage)
    kyc_status: Mapped[KycStatus] = mapped_column(enum_col(KycStatus), default=KycStatus.pending, index=True)
    kyc_note: Mapped[str | None] = mapped_column(Text)
    # ONLINE/OFFLINE toggle: batches are only offered to online riders.
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RiderCollege(Base):
    """Zones a rider serves. Backup riders are only offered batches when no primary rider is available."""

    __tablename__ = "rider_colleges"

    rider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rider_profiles.id"), primary_key=True)
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), primary_key=True, index=True)
    is_backup: Mapped[bool] = mapped_column(Boolean, default=False)


class RiderSettlementStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"


class RiderSettlement(Base):
    """Twice-weekly payout. Created and paid by admin; the unique key prevents duplicate payouts."""

    __tablename__ = "rider_settlements"
    __table_args__ = (
        UniqueConstraint("rider_id", "period_start", "period_end"),
        CheckConstraint("period_end >= period_start", name="period"),
        CheckConstraint("batch_count >= 0 AND amount >= 0", name="amounts_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    rider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rider_profiles.id"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    batch_count: Mapped[int] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[RiderSettlementStatus] = mapped_column(enum_col(RiderSettlementStatus), default=RiderSettlementStatus.pending)
    upi_reference: Mapped[str | None] = mapped_column(String(80))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
