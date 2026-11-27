"""Delivery batches: grouping accepted orders per (college, slot, date), rider offers, custody and payout."""
import math
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core import realtime, storage
from app.modules.auth.models import User
from app.modules.colleges.models import College, CollegeSlot
from app.modules.delivery.models import (
    ACTIVE_BATCH, OPEN_BATCH, BatchDecline, BatchMode, BatchOrder, BatchOrderStatus, BatchShopArrival,
    BatchStatus, CustodyEvent, DeliveryBatch, ShelfPhoto,
)
from app.modules.finance import ledger
from app.modules.finance.models import LedgerType, PlatformConfig
from app.modules.notifications.models import notify
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.orders.pricing import money
from app.modules.orders.service import random_code, set_status
from app.modules.riders.models import KycStatus, RiderCollege, RiderProfile
from app.modules.shops.models import HandoverOtp, ShopProfile

MAX_OTP_ATTEMPTS = 5
MAX_PHOTO_BYTES = 8 * 1024 * 1024


def log(db: Session, order: Order, type_: str, batch: DeliveryBatch | None = None, actor: User | None = None,
        note: str | None = None) -> None:
    db.add(CustodyEvent(order_id=order.id, batch_id=batch.id if batch else None, type=type_,
                        actor_id=actor.id if actor else None, note=note))
    rider = {f"rider:{batch.rider_id}"} if batch and batch.rider_id else set()
    realtime.emit(db, realtime.order_topics(order) | rider, "order.custody", order_id=order.id,
                  batch_id=batch.id if batch else None, event=type_)


def batch_event(db: Session, batch: DeliveryBatch, rider_id: uuid.UUID | None = None) -> None:
    """Tell the rider (and admin) that a batch changed; rider_id also notifies a rider who just lost an offer."""
    riders = {f"rider:{r}" for r in (batch.rider_id, rider_id) if r}
    realtime.emit(db, {"admin"} | riders, "batch.updated", batch_id=batch.id, status=batch.status.value)


# ---- money & geometry -------------------------------------------------------------------------


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (la1, lo1), (la2, lo2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def payout(cfg: PlatformConfig, shops: int, packets: int) -> dict[str, Decimal]:
    """Base trip fee + fee per additional shop + per-packet bonus, never below the minimum guarantee."""
    base = cfg.rider_base_fee
    extra = cfg.rider_extra_shop_fee * max(shops - 1, 0)
    bonus = cfg.rider_packet_bonus * packets
    total = max(base + extra + bonus, cfg.rider_min_guarantee)
    return {"base": money(base), "extra_shops": money(extra), "packet_bonus": money(bonus), "total": money(total)}


def maps_link(lat, lng) -> str | None:
    return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}" if lat is not None and lng is not None else None


def route_distance_km(db: Session, batch: DeliveryBatch) -> Decimal | None:
    """Nearest-neighbour path through the shops that still have packets, ending at the college."""
    shop_ids = {bo.shop_id for bo in _orders(db, batch) if bo.status != BatchOrderStatus.removed}
    shops = [(float(s.latitude), float(s.longitude)) for s in db.scalars(select(ShopProfile).where(ShopProfile.id.in_(shop_ids)))] if shop_ids else []
    college = db.get(College, batch.college_id)
    if not shops or college.latitude is None:
        return None
    pts, cur, total = shops[:], shops[0], 0.0
    pts.remove(cur)
    while pts:
        nxt = min(pts, key=lambda p: haversine_km(cur, p))
        total += haversine_km(cur, nxt)
        pts.remove(nxt)
        cur = nxt
    total += haversine_km(cur, (float(college.latitude), float(college.longitude)))
    return Decimal(str(round(total, 2)))


# ---- batches ----------------------------------------------------------------------------------


def _orders(db: Session, batch: DeliveryBatch) -> list[BatchOrder]:
    return list(db.scalars(select(BatchOrder).where(BatchOrder.batch_id == batch.id)).all())


def attach_order(db: Session, order: Order) -> DeliveryBatch:
    """Put an accepted order into the open consolidated batch for its (college, slot, date)."""
    batch = db.scalar(
        select(DeliveryBatch).where(
            DeliveryBatch.mode == BatchMode.consolidated, DeliveryBatch.college_id == order.college_id,
            DeliveryBatch.slot_id == order.slot_id, DeliveryBatch.slot_date == order.slot_date,
            DeliveryBatch.status.in_(OPEN_BATCH),
        ).order_by(DeliveryBatch.created_at)
    )
    if not batch:
        batch = DeliveryBatch(code=f"DB-{random_code(6)}", college_id=order.college_id, slot_id=order.slot_id,
                              slot_date=order.slot_date)
        db.add(batch)
        db.flush()
    db.add(BatchOrder(batch_id=batch.id, order_id=order.id, shop_id=order.shop_id))
    log(db, order, "accepted_by_shop", batch)
    db.flush()
    if batch.status == BatchStatus.unassigned:
        offer_batch(db, batch)
    return batch


def eligible_riders(db: Session, batch: DeliveryBatch) -> list[RiderProfile]:
    declined = select(BatchDecline.rider_id).where(BatchDecline.batch_id == batch.id)
    busy = select(DeliveryBatch.rider_id).where(DeliveryBatch.status.in_(ACTIVE_BATCH), DeliveryBatch.rider_id.is_not(None))
    load = (select(func.count()).select_from(DeliveryBatch)
            .where(DeliveryBatch.rider_id == RiderProfile.id, DeliveryBatch.status.in_(ACTIVE_BATCH))
            .correlate(RiderProfile).scalar_subquery())
    base = (
        select(RiderProfile).join(RiderCollege, RiderCollege.rider_id == RiderProfile.id)
        .where(RiderCollege.college_id == batch.college_id, RiderProfile.kyc_status == KycStatus.approved,
               RiderProfile.is_online.is_(True), RiderProfile.id.not_in(declined), RiderProfile.id.not_in(busy))
        .order_by(load, RiderProfile.created_at)
    )
    primary = db.scalars(base.where(RiderCollege.is_backup.is_(False))).all()
    return list(primary or db.scalars(base.where(RiderCollege.is_backup.is_(True))).all())


def offer_batch(db: Session, batch: DeliveryBatch) -> RiderProfile | None:
    riders = eligible_riders(db, batch)
    if not riders:
        previous = batch.rider_id
        batch.status, batch.rider_id = BatchStatus.unassigned, None
        batch_event(db, batch, previous)
        return None
    previous = batch.rider_id
    batch.rider_id, batch.status, batch.offered_at = riders[0].id, BatchStatus.offered, datetime.now(UTC)
    batch_event(db, batch, previous)
    return riders[0]


def offer_waiting_batches(db: Session, rider: RiderProfile) -> None:
    colleges = select(RiderCollege.college_id).where(RiderCollege.rider_id == rider.id)
    for b in db.scalars(select(DeliveryBatch).where(DeliveryBatch.status == BatchStatus.unassigned,
                                                    DeliveryBatch.college_id.in_(colleges))).all():
        offer_batch(db, b)
    db.commit()


def set_online(db: Session, rider: RiderProfile, is_online: bool) -> RiderProfile:
    """ONLINE: receive waiting batch offers. OFFLINE: pending offers move on; not allowed mid-run."""
    if not is_online:
        if db.scalar(select(DeliveryBatch.id).where(DeliveryBatch.rider_id == rider.id, DeliveryBatch.status.in_(
                (BatchStatus.accepted, BatchStatus.out_for_delivery)))):
            raise HTTPException(409, "Finish your current run before going offline")
        rider.is_online = False
        db.flush()
        for b in db.scalars(select(DeliveryBatch).where(DeliveryBatch.rider_id == rider.id,
                                                        DeliveryBatch.status == BatchStatus.offered)).all():
            offer_batch(db, b)
        db.commit()
        return rider
    rider.is_online = True
    db.flush()
    offer_waiting_batches(db, rider)  # commits
    return rider


def get_rider(db: Session, user: User) -> RiderProfile:
    rider = db.scalar(select(RiderProfile).where(RiderProfile.user_id == user.id))
    if not rider:
        raise HTTPException(404, "Rider not registered")
    return rider


def get_approved_rider(db: Session, user: User) -> RiderProfile:
    rider = get_rider(db, user)
    if rider.kyc_status != KycStatus.approved:
        raise HTTPException(403, "Your KYC has not been approved yet")
    return rider


def rider_batch(db: Session, user: User, batch_id: uuid.UUID) -> tuple[RiderProfile, DeliveryBatch]:
    rider = get_approved_rider(db, user)
    batch = db.get(DeliveryBatch, batch_id)
    if not batch or batch.rider_id != rider.id:
        raise HTTPException(404, "Batch not found")
    return rider, batch


def actor_batch(db: Session, user: User, batch_id: uuid.UUID) -> DeliveryBatch:
    """The rider on a batch, or the owning shop for a direct-delivery batch."""
    batch = db.get(DeliveryBatch, batch_id)
    if user.role.value == "rider":
        rider = get_approved_rider(db, user)
        if batch and batch.rider_id == rider.id:
            return batch
    elif user.role.value == "shop":
        shop = db.scalar(select(ShopProfile).where(ShopProfile.user_id == user.id))
        if batch and shop and batch.mode == BatchMode.direct and batch.shop_id == shop.id:
            return batch
    else:
        raise HTTPException(403, "Forbidden")
    raise HTTPException(404, "Batch not found")


def _require(batch: DeliveryBatch, *statuses: BatchStatus) -> None:
    if batch.status not in statuses:
        raise HTTPException(409, f"This run is {batch.status.value.replace('_', ' ')}")


def accept(db: Session, batch: DeliveryBatch) -> DeliveryBatch:
    _require(batch, BatchStatus.offered)
    batch.status, batch.accepted_at = BatchStatus.accepted, datetime.now(UTC)
    batch_event(db, batch)
    db.commit()
    return batch


def decline(db: Session, rider: RiderProfile, batch: DeliveryBatch) -> None:
    _require(batch, BatchStatus.offered)
    db.add(BatchDecline(batch_id=batch.id, rider_id=rider.id))
    db.flush()
    offer_batch(db, batch)  # next eligible rider, or back to unassigned for admin
    db.commit()


def arrive(db: Session, batch: DeliveryBatch, shop_id: uuid.UUID) -> BatchShopArrival:
    _require(batch, BatchStatus.accepted)
    if not any(bo.shop_id == shop_id for bo in _orders(db, batch)):
        raise HTTPException(404, "Shop is not part of this run")
    arrival = db.get(BatchShopArrival, (batch.id, shop_id))
    if not arrival:
        arrival = BatchShopArrival(batch_id=batch.id, shop_id=shop_id, arrived_at=datetime.now(UTC))
        db.add(arrival)
        db.commit()
    return arrival


def verify_pickup(db: Session, user: User, batch: DeliveryBatch, order_id: uuid.UUID, code: str) -> BatchOrder:
    _require(batch, BatchStatus.accepted)
    bo = db.scalar(select(BatchOrder).where(BatchOrder.batch_id == batch.id, BatchOrder.order_id == order_id))
    if not bo or bo.status != BatchOrderStatus.pending:
        raise HTTPException(404, "Packet is not waiting for pickup")
    order = db.get(Order, order_id)
    otp = db.scalar(select(HandoverOtp).where(HandoverOtp.order_id == order.id))
    if not otp or otp.used:
        raise HTTPException(409, "The shop hasn't generated a handover code for this packet")
    if otp.attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(423, "Too many wrong codes. Ask the shop to generate a new one.")
    otp.attempts += 1
    if not secrets.compare_digest(otp.code_hash, sec.hash_otp(str(order.id), code)):
        db.commit()
        raise HTTPException(400, "Incorrect code")
    otp.used = True
    bo.status, bo.picked_up_at = BatchOrderStatus.picked_up, datetime.now(UTC)
    set_status(db, order, OrderStatus.handover_verified, actor_id=user.id, note="OTP verified")
    ledger.record_shop_earning(db, order)
    log(db, order, "handover_verified", batch, user)
    notify(db, order.student_id, "rider_pickup", "Packet picked up",
           f"{order.code} has been collected from the shop.", order.id)
    db.commit()
    return bo


def next_slot(db: Session, order: Order) -> tuple[CollegeSlot, date] | None:
    current = db.get(CollegeSlot, order.slot_id)
    now_dt = datetime.combine(order.slot_date, current.delivery_time, tzinfo=slot_utils.IST)
    best = None
    for d in range(0, 4):
        day = order.slot_date + timedelta(days=d)
        for s in db.scalars(select(CollegeSlot).where(CollegeSlot.college_id == order.college_id, CollegeSlot.active.is_(True))):
            dt = datetime.combine(day, s.delivery_time, tzinfo=slot_utils.IST)
            if dt > now_dt and (best is None or dt < best[0]):
                best = (dt, s, day)
    return (best[1], best[2]) if best else None


def not_ready(db: Session, user: User, batch: DeliveryBatch, shop_id: uuid.UUID) -> list[Order]:
    """No-wait rule: after `no_wait_minutes` at a shop, its unhanded packets are skipped and roll to the next slot."""
    _require(batch, BatchStatus.accepted)
    arrival = db.get(BatchShopArrival, (batch.id, shop_id))
    if not arrival:
        raise HTTPException(409, "Mark that you've arrived at the shop first")
    wait = db.get(PlatformConfig, 1).no_wait_minutes
    ready_at = sec.aware(arrival.arrived_at) + timedelta(minutes=wait)
    if datetime.now(UTC) < ready_at:
        raise HTTPException(409, f"Wait {wait} minutes at the shop before skipping")
    pending = [bo for bo in _orders(db, batch) if bo.shop_id == shop_id and bo.status == BatchOrderStatus.pending]
    if not pending:
        raise HTTPException(409, "Nothing left to skip at this shop")
    skipped: list[Order] = []
    for bo in pending:
        order = db.get(Order, bo.order_id)
        bo.status, bo.note = BatchOrderStatus.skipped, "shop not ready"
        log(db, order, "skipped_not_ready", batch, user)
        nxt = next_slot(db, order)
        if nxt:
            order.slot_id, order.slot_date = nxt[0].id, nxt[1]
            order.events.append(OrderEvent(type="rolled_over", actor_id=user.id, note=f"moved to {nxt[0].label} on {nxt[1]}"))
            attach_order(db, order)
            notify(db, order.student_id, "order_delayed", "Delivery moved to the next slot",
                   f"{order.code} wasn't ready in time and will arrive in {nxt[0].label} on {nxt[1]:%d %b}.", order.id)
        skipped.append(order)
    db.commit()
    return skipped


def depart(db: Session, user: User, batch: DeliveryBatch) -> DeliveryBatch:
    _require(batch, BatchStatus.accepted)
    bos = _orders(db, batch)
    if any(bo.status == BatchOrderStatus.pending for bo in bos):
        raise HTTPException(409, "Pick up or skip every packet before heading to the college")
    picked = [bo for bo in bos if bo.status == BatchOrderStatus.picked_up]
    if not picked:
        raise HTTPException(409, "No packets to deliver")
    for bo in picked:
        order = db.get(Order, bo.order_id)
        set_status(db, order, OrderStatus.out_for_delivery, actor_id=user.id)
        log(db, order, "departed", batch, user)
        notify(db, order.student_id, "out_for_delivery", "Out for delivery",
               f"{order.code} is on its way to your security cabin.", order.id)
    batch.status, batch.departed_at = BatchStatus.out_for_delivery, datetime.now(UTC)
    batch_event(db, batch)
    db.commit()
    return batch


def close_empty(db: Session, batch: DeliveryBatch) -> DeliveryBatch:
    """Every packet was skipped: end the trip. The minimum guarantee still applies if the rider reached a shop."""
    _require(batch, BatchStatus.accepted)
    bos = _orders(db, batch)
    if any(bo.status in (BatchOrderStatus.pending, BatchOrderStatus.picked_up) for bo in bos):
        raise HTTPException(409, "This run still has packets")
    visited = db.scalar(select(func.count()).select_from(BatchShopArrival).where(BatchShopArrival.batch_id == batch.id))
    batch.status, batch.completed_at = BatchStatus.cancelled, datetime.now(UTC)
    if visited:
        batch.payout_base = batch.payout_extra_shops = batch.payout_packet_bonus = Decimal("0")
        batch.payout_total = money(db.get(PlatformConfig, 1).rider_min_guarantee)
        ledger.post(db, LedgerType.rider_payout, batch.payout_total, f"rider:{batch.id}", batch_id=batch.id,
                    note="minimum guarantee, empty run")
    db.commit()
    return batch


def upload_shelf_photo(db: Session, user: User, batch: DeliveryBatch, filename: str, data: bytes) -> ShelfPhoto:
    _require(batch, BatchStatus.out_for_delivery)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo is too large (max 8 MB)")
    if data.startswith(b"\xff\xd8\xff"):
        ctype, ext = "image/jpeg", "jpg"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        ctype, ext = "image/png", "png"
    else:
        raise HTTPException(415, "Photo must be a JPG or PNG")
    photo_id = uuid.uuid4()
    key = f"shelf/{batch.id}/{photo_id}.{ext}"
    storage.put_object(key, data, ctype)
    if not storage.object_exists(key):  # confirm it really landed in private storage
        raise HTTPException(502, "Photo upload could not be verified. Please try again.")
    photo = ShelfPhoto(id=photo_id, batch_id=batch.id, storage_key=key, uploaded_by=user.id)
    db.add(photo)
    db.commit()
    return photo


def complete(db: Session, user: User, batch: DeliveryBatch) -> DeliveryBatch:
    _require(batch, BatchStatus.out_for_delivery)
    photos = db.scalars(select(ShelfPhoto).where(ShelfPhoto.batch_id == batch.id)).all()
    if not photos or not all(storage.object_exists(p.storage_key) for p in photos):
        raise HTTPException(409, "Take a photo of the shelf before completing the delivery")
    picked = [bo for bo in _orders(db, batch) if bo.status == BatchOrderStatus.picked_up]
    for bo in picked:
        order = db.get(Order, bo.order_id)
        set_status(db, order, OrderStatus.delivered, actor_id=user.id)
        log(db, order, "delivered", batch, user)
        notify(db, order.student_id, "delivered", "Delivered to your security cabin",
               f"{order.code} is on the shelf. Show your order ID to collect it.", order.id)
        notify(db, order.student_id, "shelf_photo", "Shelf photo available",
               "See exactly where your packet was placed.", order.id)
    batch.status, batch.completed_at = BatchStatus.completed, datetime.now(UTC)
    batch_event(db, batch)
    if batch.mode == BatchMode.consolidated:
        shops = len({bo.shop_id for bo in picked})
        p = payout(db.get(PlatformConfig, 1), shops, len(picked))
        batch.payout_base, batch.payout_extra_shops = p["base"], p["extra_shops"]
        batch.payout_packet_bonus, batch.payout_total = p["packet_bonus"], p["total"]
        ledger.post(db, LedgerType.rider_payout, batch.payout_total, f"rider:{batch.id}", batch_id=batch.id)
    db.commit()
    return batch


def _cancel_if_empty(db: Session, batch: DeliveryBatch) -> None:
    """A run left with no packets (all moved elsewhere) shouldn't linger in a rider's queue."""
    if batch.status in OPEN_BATCH and all(bo.status == BatchOrderStatus.removed for bo in _orders(db, batch)):
        batch.status, batch.completed_at = BatchStatus.cancelled, datetime.now(UTC)


# ---- direct shop delivery ---------------------------------------------------------------------


def direct_delivery(db: Session, user: User, shop: ShopProfile, order: Order) -> DeliveryBatch:
    """The shop delivers its own packed order to the cabin instead of waiting for a delivery partner."""
    if order.status != OrderStatus.packing or not order.packed_at:
        raise HTTPException(409, "Mark binding and packing done first")
    old = db.scalar(select(BatchOrder).where(BatchOrder.order_id == order.id, BatchOrder.status == BatchOrderStatus.pending))
    if old:
        old.status, old.note = BatchOrderStatus.removed, "shop delivering directly"
        db.flush()
        _cancel_if_empty(db, db.get(DeliveryBatch, old.batch_id))
    otp = db.scalar(select(HandoverOtp).where(HandoverOtp.order_id == order.id))
    if otp:
        otp.used = True
    batch = DeliveryBatch(code=f"DB-{random_code(6)}", mode=BatchMode.direct, college_id=order.college_id,
                          slot_id=order.slot_id, slot_date=order.slot_date, shop_id=shop.id,
                          status=BatchStatus.out_for_delivery, accepted_at=datetime.now(UTC), departed_at=datetime.now(UTC))
    db.add(batch)
    db.flush()
    db.add(BatchOrder(batch_id=batch.id, order_id=order.id, shop_id=shop.id, status=BatchOrderStatus.picked_up,
                      picked_up_at=datetime.now(UTC)))
    set_status(db, order, OrderStatus.handover_verified, actor_id=user.id, note="direct shop delivery")
    ledger.record_shop_earning(db, order)
    set_status(db, order, OrderStatus.out_for_delivery, actor_id=user.id)
    log(db, order, "direct_dispatch", batch, user)
    notify(db, order.student_id, "out_for_delivery", "Out for delivery",
           f"{order.code} is on its way to your security cabin.", order.id)
    db.commit()
    return batch


# ---- views ------------------------------------------------------------------------------------


def run_view(db: Session, batch: DeliveryBatch) -> dict:
    cfg = db.get(PlatformConfig, 1)
    college = db.get(College, batch.college_id)
    slot = db.get(CollegeSlot, batch.slot_id)
    sv = slot_utils.slot_view(db, slot, batch.slot_date, datetime.now(UTC))
    bos = [bo for bo in _orders(db, batch) if bo.status != BatchOrderStatus.removed]
    live = [bo for bo in bos if bo.status != BatchOrderStatus.skipped]
    shops_by_id = {s.id: s for s in db.scalars(select(ShopProfile).where(ShopProfile.id.in_({bo.shop_id for bo in bos})))} if bos else {}
    shop_rows = []
    for sid, shop in shops_by_id.items():
        arrival = db.get(BatchShopArrival, (batch.id, sid))
        mine = [bo for bo in bos if bo.shop_id == sid]
        arrived_at = sec.aware(arrival.arrived_at) if arrival else None
        ready_at = arrived_at + timedelta(minutes=cfg.no_wait_minutes) if arrived_at else None
        has_pending = any(bo.status == BatchOrderStatus.pending for bo in mine)
        orders = []
        for bo in mine:
            o = db.get(Order, bo.order_id)
            orders.append({"order_id": o.id, "code": o.code, "status": bo.status.value,
                           "packed": bool(o.packed_at), "code_ready": db.scalar(select(func.count()).select_from(HandoverOtp).where(HandoverOtp.order_id == o.id, HandoverOtp.used.is_(False))) > 0})
        shop_rows.append({
            "shop_id": sid, "shop_name": shop.shop_name, "area": shop.area, "landmark": shop.landmark,
            "maps_url": maps_link(shop.latitude, shop.longitude), "arrived_at": arrived_at,
            "latitude": shop.latitude, "longitude": shop.longitude,
            "not_ready_available_at": ready_at,
            "can_mark_not_ready": bool(has_pending and ready_at and datetime.now(UTC) >= ready_at),
            "orders": orders,
        })
    p = payout(cfg, len({bo.shop_id for bo in live}), len(live)) if batch.payout_total is None else None
    pending = any(bo.status == BatchOrderStatus.pending for bo in bos)
    picked = any(bo.status == BatchOrderStatus.picked_up for bo in bos)
    return {
        "id": batch.id, "code": batch.code, "mode": batch.mode, "status": batch.status,
        "college": {"name": college.name, "security_cabin": college.security_cabin,
                    "drop_instructions": college.drop_instructions,
                    "maps_url": maps_link(college.latitude, college.longitude),
                    "latitude": college.latitude, "longitude": college.longitude},
        "slot": {"label": slot.label, "delivery_at": sv["delivery_at"]},
        "shop_count": len({bo.shop_id for bo in live}), "packet_count": len(live),
        "route_distance_km": route_distance_km(db, batch),
        "guaranteed_payout": batch.payout_total if batch.payout_total is not None else p["total"],
        "shops": shop_rows,
        "can_depart": batch.status == BatchStatus.accepted and picked and not pending,
        "can_close_empty": batch.status == BatchStatus.accepted and bos and not pending and not picked,
        "shelf_photo_count": db.scalar(select(func.count()).select_from(ShelfPhoto).where(ShelfPhoto.batch_id == batch.id)),
    }


def current_run(db: Session, rider: RiderProfile) -> DeliveryBatch | None:
    return db.scalar(select(DeliveryBatch).where(DeliveryBatch.rider_id == rider.id, DeliveryBatch.status.in_(ACTIVE_BATCH))
                     .order_by(DeliveryBatch.created_at))


def history(db: Session, rider: RiderProfile) -> list[dict]:
    batches = db.scalars(select(DeliveryBatch).where(DeliveryBatch.rider_id == rider.id,
                                                     DeliveryBatch.status.in_((BatchStatus.completed, BatchStatus.cancelled)))
                         .order_by(DeliveryBatch.completed_at.desc()).limit(100)).all()
    out = []
    for b in batches:
        photo = db.scalar(select(ShelfPhoto).where(ShelfPhoto.batch_id == b.id).order_by(ShelfPhoto.created_at.desc()))
        picked = [bo for bo in _orders(db, b) if bo.status == BatchOrderStatus.picked_up]
        out.append({"id": b.id, "code": b.code, "completed_at": b.completed_at, "status": b.status,
                    "packet_count": len(picked), "payout": b.payout_total,
                    "shelf_photo_url": storage.presign_get(photo.storage_key) if photo else None,
                    "settled": b.settlement_id is not None})
    return out


def _week_start() -> datetime:
    now = datetime.now(UTC).astimezone(slot_utils.IST)
    return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def earnings(db: Session, rider: RiderProfile) -> dict:
    from app.modules.riders.models import RiderSettlement

    done = (DeliveryBatch.rider_id == rider.id, DeliveryBatch.payout_total.is_not(None))
    total = lambda *extra: db.scalar(select(func.coalesce(func.sum(DeliveryBatch.payout_total), 0)).where(*done, *extra))  # noqa: E731
    today = datetime.now(UTC).astimezone(slot_utils.IST).replace(hour=0, minute=0, second=0, microsecond=0)
    last = db.scalar(select(DeliveryBatch).where(*done).order_by(DeliveryBatch.completed_at.desc()))
    return {
        "today": total(DeliveryBatch.completed_at >= today),
        "this_week": total(DeliveryBatch.completed_at >= _week_start()),
        "unsettled": total(DeliveryBatch.settlement_id.is_(None)),
        "last_trip": None if not last else {
            "base_fee": last.payout_base, "extra_shop_fees": last.payout_extra_shops,
            "packet_bonus": last.payout_packet_bonus, "total": last.payout_total},
        "payouts": db.scalars(select(RiderSettlement).where(RiderSettlement.rider_id == rider.id)
                              .order_by(RiderSettlement.period_start.desc()).limit(52)).all(),
    }
