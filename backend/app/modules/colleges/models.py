import uuid
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class College(Base):
    __tablename__ = "colleges"
    __table_args__ = (
        CheckConstraint("(latitude IS NULL OR latitude BETWEEN -90 AND 90) "
                        "AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)", name="coordinates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    city: Mapped[str | None] = mapped_column(String(100))
    security_cabin: Mapped[str] = mapped_column(String(200))  # e.g. "Main gate security cabin"
    drop_instructions: Mapped[str | None] = mapped_column(Text)  # for riders/shops
    collection_instructions: Mapped[str | None] = mapped_column(Text)  # shown to students
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CollegeSlot(Base):
    """A recurring daily delivery slot. Orders pick a concrete date for it."""

    __tablename__ = "college_slots"
    __table_args__ = (CheckConstraint("cutoff_minutes >= 0 AND capacity >= 0", name="limits"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), index=True)
    label: Mapped[str] = mapped_column(String(60))
    delivery_time: Mapped[time] = mapped_column(Time)  # local (IST) time of delivery
    cutoff_minutes: Mapped[int] = mapped_column(Integer)  # order cut-off, minutes before delivery_time
    capacity: Mapped[int] = mapped_column(Integer)  # max orders per date
    active: Mapped[bool] = mapped_column(Boolean, default=True)
