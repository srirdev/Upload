import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm import Session

from app.core import realtime
from app.db.session import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_unread", "user_id", "read"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # e.g. order_placed, refund_update
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str | None] = mapped_column(Text)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"), index=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def notify(db: Session, user_id: uuid.UUID, kind: str, title: str, body: str | None = None,
           order_id: uuid.UUID | None = None) -> None:
    """Queue an in-app notification (committed with the caller's transaction)."""
    db.add(Notification(user_id=user_id, kind=kind, title=title, body=body, order_id=order_id))
    realtime.emit(db, {f"user:{user_id}"}, "notification", kind=kind, order_id=order_id)
