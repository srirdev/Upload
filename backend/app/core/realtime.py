"""Realtime events over FastAPI WebSockets.

Services call `emit(db, topics, type, **ids)`; events are queued on the DB session and only published after the
transaction commits (a rolled-back action never broadcasts). Messages carry ids, never data: clients refetch through
the normal, permission-checked REST API.

Topics: "admin", "user:<user_id>", "shop:<shop_profile_id>", "rider:<rider_profile_id>".
The hub is in-process: run a single API process, or add a Redis pub/sub fan-out before scaling out.
"""
import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock

from sqlalchemy import event
from sqlalchemy.orm import Session

_PENDING = "realtime_pending"


@dataclass(eq=False)
class Connection:
    topics: set[str]
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=200))


class Hub:
    def __init__(self) -> None:
        self._conns: set[Connection] = set()
        self._lock = Lock()

    def connect(self, topics: set[str]) -> Connection:
        conn = Connection(topics=topics, loop=asyncio.get_running_loop())
        with self._lock:
            self._conns.add(conn)
        return conn

    def disconnect(self, conn: Connection) -> None:
        with self._lock:
            self._conns.discard(conn)

    def publish(self, topics: set[str], message: dict) -> None:
        """Thread-safe: sync endpoints run in a worker thread, each connection lives on its event loop."""
        with self._lock:
            targets = [c for c in self._conns if c.topics & topics]
        for c in targets:
            c.loop.call_soon_threadsafe(_offer, c.queue, message)


def _offer(queue: asyncio.Queue, message: dict) -> None:
    if not queue.full():  # a stalled client drops events rather than blocking everyone
        queue.put_nowait(message)


hub = Hub()


def emit(db: Session, topics: set[str], type_: str, **ids: uuid.UUID | str | None) -> None:
    """Queue an event; it is published only if the surrounding transaction commits."""
    if not db.in_transaction():
        db.begin()  # tie the event to a transaction so a rollback always discards it
    message = {"type": type_, "at": datetime.now(UTC).isoformat(),
               **{k: str(v) for k, v in ids.items() if v is not None}}
    db.info.setdefault(_PENDING, []).append(({t for t in topics if t}, message))


@event.listens_for(Session, "after_commit")
def _publish(session: Session) -> None:
    for topics, message in session.info.pop(_PENDING, []):
        hub.publish(topics, message)


@event.listens_for(Session, "after_soft_rollback")
def _discard(session: Session, previous_transaction) -> None:
    session.info.pop(_PENDING, None)


def order_topics(order) -> set[str]:
    """Everyone following an order: its student, its shop and the admin operations centre."""
    return {"admin", f"user:{order.student_id}", f"shop:{order.shop_id}" if order.shop_id else ""}
