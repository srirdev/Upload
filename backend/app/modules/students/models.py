import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, Text, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.types import enum_col


class StudentProfile(Base):
    __tablename__ = "student_profiles"
    __table_args__ = (CheckConstraint("year BETWEEN 1 AND 6", name="year_range"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    college_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("colleges.id"), index=True)
    department: Mapped[str] = mapped_column(String(120))
    year: Mapped[int] = mapped_column(Integer)
    register_number: Mapped[str] = mapped_column(String(40))
    referral_code: Mapped[str] = mapped_column(String(12), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplaintCategory(str, enum.Enum):
    damaged_binding = "damaged_binding"
    missing_pages = "missing_pages"
    not_on_shelf = "not_on_shelf"
    late_delivery = "late_delivery"


class ComplaintStatus(str, enum.Enum):
    open = "open"
    in_review = "in_review"
    resolved = "resolved"
    rejected = "rejected"


class Complaint(Base):
    __tablename__ = "complaints"
    # student_id is kept for fast "my complaints" lookups; the composite FK guarantees it is the order's owner.
    __table_args__ = (ForeignKeyConstraint(["order_id", "student_id"], ["orders.id", "orders.student_id"],
                                           name="fk_complaints_order_owner"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[ComplaintCategory] = mapped_column(enum_col(ComplaintCategory))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[ComplaintStatus] = mapped_column(enum_col(ComplaintStatus), default=ComplaintStatus.open, index=True)
    admin_response: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attachments: Mapped[list["ComplaintAttachment"]] = relationship(
        order_by="ComplaintAttachment.created_at", cascade="all, delete-orphan", lazy="selectin"
    )


class ComplaintAttachment(Base):
    """Evidence photo metadata; the file itself is in private object storage."""

    __tablename__ = "complaint_attachments"
    __table_args__ = (CheckConstraint("size_bytes IS NULL OR size_bytes > 0", name="size_positive"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    complaint_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("complaints.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(400), unique=True)
    content_type: Mapped[str] = mapped_column(String(60))
    size_bytes: Mapped[int | None] = mapped_column(Integer)  # NULL only for photos migrated from before 0006
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), server_default=func.now()
    )
