"""WebSocket endpoint for realtime events (see app/core/realtime.py)."""
import asyncio
import uuid

import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import realtime
from app.core.security import decode_access_token
from app.db.session import get_db
from app.modules.auth.models import Role, User
from app.modules.riders.models import RiderProfile
from app.modules.shops.models import ShopProfile

router = APIRouter(tags=["realtime"])


def _topics(db: Session, token: str) -> set[str] | None:
    """Topics this access token may subscribe to, or None if the token is invalid."""
    try:
        user_id = uuid.UUID(decode_access_token(token)["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    try:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            return None
        topics = {f"user:{user.id}"}
        if user.role == Role.admin:
            topics.add("admin")
        elif user.role == Role.shop:
            shop_id = db.scalar(select(ShopProfile.id).where(ShopProfile.user_id == user.id))
            topics |= {f"shop:{shop_id}"} if shop_id else set()
        elif user.role == Role.rider:
            rider_id = db.scalar(select(RiderProfile.id).where(RiderProfile.user_id == user.id))
            topics |= {f"rider:{rider_id}"} if rider_id else set()
        return topics
    finally:
        db.commit()  # ends the read transaction so the socket doesn't hold a pooled connection


@router.websocket("/ws")
async def events(websocket: WebSocket, token: str = "", db: Session = Depends(get_db)):
    """Browsers can't set headers on WebSockets, so the short-lived access token comes as ?token=.
    Messages are {"type": ..., "at": ..., <ids>}; clients refetch the affected data over REST."""
    topics = await asyncio.to_thread(_topics, db, token)
    if topics is None:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    conn = realtime.hub.connect(topics)

    async def pump() -> None:
        while True:
            await websocket.send_json(await conn.queue.get())

    sender = asyncio.create_task(pump())
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            await websocket.receive_text()  # client pings; also detects disconnects
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        realtime.hub.disconnect(conn)
