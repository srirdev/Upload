"""Printing-shop and delivery-partner management for admins."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.auth.models import AdminProfile, User
from app.modules.colleges.models import College
from app.modules.delivery import service as delivery
from app.modules.delivery.models import BatchOrder, BatchOrderStatus, BatchStatus, DeliveryBatch
from app.modules.finance.ledger import audit
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.riders.models import KycStatus, RiderCollege, RiderProfile
from app.modules.shops import service
from app.modules.shops.models import OrderRejection, ShopCollege, ShopProfile, ShopStatus
from app.modules.shops.schemas import RejectIn, ShopOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/me")
def me(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = db.scalar(select(AdminProfile).where(AdminProfile.user_id == admin.id))
    return {"mobile": admin.mobile, "full_name": p.full_name if p else None, "email": p.email if p else None}


class CollegesIn(BaseModel):
    college_ids: list[uuid.UUID]


class AssignIn(BaseModel):
    shop_id: uuid.UUID


class LocationIn(BaseModel):
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)


def _shop(db: Session, shop_id: uuid.UUID) -> ShopProfile:
    shop = db.get(ShopProfile, shop_id)
    if not shop:
        raise HTTPException(404, "Shop not found")
    return shop


# ---- shops ------------------------------------------------------------------------------------


@router.get("/shops")
def list_shops(status: ShopStatus | None = Query(None), _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(ShopProfile).order_by(ShopProfile.created_at.desc())
    if status:
        q = q.where(ShopProfile.status == status)
    out = []
    for s in db.scalars(q).all():
        colleges = db.scalars(select(College.name).join(ShopCollege, ShopCollege.college_id == College.id)
                              .where(ShopCollege.shop_id == s.id)).all()
        out.append({**ShopOut.model_validate(s).model_dump(), "colleges": colleges,
                    "bank_account_number": s.bank_account_number, "bank_ifsc": s.bank_ifsc,
                    "bank_account_name": s.bank_account_name, "created_at": s.created_at})
    return out


@router.post("/shops/{shop_id}/approve", response_model=ShopOut)
def approve(shop_id: uuid.UUID, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    shop.status, shop.rejection_reason = ShopStatus.approved, None
    audit(db, admin.id, "shop.approve", "shop", shop.id)
    db.commit()
    return shop


@router.post("/shops/{shop_id}/reject", response_model=ShopOut)
def reject(shop_id: uuid.UUID, body: RejectIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    shop.status, shop.rejection_reason, shop.is_open = ShopStatus.rejected, body.reason, False
    audit(db, admin.id, "shop.reject", "shop", shop.id, {"reason": body.reason})
    db.commit()
    return shop


@router.post("/shops/{shop_id}/suspend", response_model=ShopOut)
def suspend(shop_id: uuid.UUID, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    shop.status, shop.is_open = ShopStatus.suspended, False
    audit(db, admin.id, "shop.suspend", "shop", shop.id)
    db.commit()
    return shop


@router.put("/shops/{shop_id}/location", response_model=ShopOut)
def set_location(shop_id: uuid.UUID, body: LocationIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    audit(db, admin.id, "shop.location", "shop", shop.id,
          {"from": [str(shop.latitude), str(shop.longitude)], "to": [str(body.latitude), str(body.longitude)]})
    shop.latitude, shop.longitude = body.latitude, body.longitude
    db.commit()
    return shop


@router.put("/shops/{shop_id}/colleges", status_code=204)
def set_colleges(shop_id: uuid.UUID, body: CollegesIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    ids = set(body.college_ids)
    if len(db.scalars(select(College.id).where(College.id.in_(ids))).all()) != len(ids):
        raise HTTPException(422, "Unknown college")
    db.execute(delete(ShopCollege).where(ShopCollege.shop_id == shop.id))
    db.add_all(ShopCollege(shop_id=shop.id, college_id=c) for c in ids)
    audit(db, admin.id, "shop.colleges", "shop", shop.id, {"colleges": [str(c) for c in ids]})
    db.commit()
    if shop.status == ShopStatus.approved and shop.is_open:
        service.assign_waiting_orders(db, shop)


@router.get("/shops/{shop_id}/performance")
def shop_performance(shop_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    shop = _shop(db, shop_id)
    count = lambda *w: db.scalar(select(func.count()).select_from(Order).where(Order.shop_id == shop.id, *w))  # noqa: E731
    assigned = count()
    rejected = db.scalar(select(func.count()).select_from(OrderRejection).where(OrderRejection.shop_id == shop.id))
    skipped = db.scalar(select(func.count()).select_from(BatchOrder).where(
        BatchOrder.shop_id == shop.id, BatchOrder.status == BatchOrderStatus.skipped))
    done = count(Order.status.in_((OrderStatus.handover_verified, OrderStatus.out_for_delivery, OrderStatus.delivered, OrderStatus.collected)))
    return {"orders_assigned": assigned, "orders_completed": done, "rejections": rejected,
            "not_ready_skips": skipped, "rejection_rate": round(rejected / (assigned + rejected), 3) if assigned + rejected else 0,
            "total_entitlement": db.scalar(select(func.coalesce(func.sum(Order.shop_entitlement), 0)).where(
                Order.shop_id == shop.id, Order.status.in_((OrderStatus.handover_verified, OrderStatus.out_for_delivery, OrderStatus.delivered, OrderStatus.collected))))}


@router.post("/orders/{order_id}/assign-shop", status_code=204)
def assign_order(order_id: uuid.UUID, body: AssignIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Assign or re-assign an order that hasn't been accepted yet."""
    order, shop = db.get(Order, order_id), _shop(db, body.shop_id)
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.placed:
        raise HTTPException(409, "Only orders that haven't been accepted can be assigned")
    if shop.status != ShopStatus.approved:
        raise HTTPException(409, "Shop is not approved")
    if missing := service.required_services(order) - set(shop.services):
        raise HTTPException(409, f"Shop doesn't offer: {', '.join(sorted(missing))}")
    service.assign(db, order, shop, actor_id=admin.id)
    audit(db, admin.id, "order.assign_shop", "order", order.id, {"shop_id": str(shop.id)})
    db.commit()


# ---- riders -----------------------------------------------------------------------------------


class RiderCollegesIn(BaseModel):
    primary: list[uuid.UUID] = []
    backup: list[uuid.UUID] = []


class AssignRiderIn(BaseModel):
    rider_id: uuid.UUID


def _rider(db: Session, rider_id: uuid.UUID) -> RiderProfile:
    r = db.get(RiderProfile, rider_id)
    if not r:
        raise HTTPException(404, "Rider not found")
    return r


@router.get("/riders")
def list_riders(kyc: KycStatus | None = Query(None), _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(RiderProfile).order_by(RiderProfile.created_at.desc())
    if kyc:
        q = q.where(RiderProfile.kyc_status == kyc)
    out = []
    for r in db.scalars(q).all():
        zones = db.execute(select(College.name, RiderCollege.is_backup).join(RiderCollege, RiderCollege.college_id == College.id)
                           .where(RiderCollege.rider_id == r.id)).all()
        out.append({"id": r.id, "full_name": r.full_name, "base_area": r.base_area, "vehicle_number": r.vehicle_number,
                    "upi_id": r.upi_id, "kyc_status": r.kyc_status, "kyc_note": r.kyc_note,
                    "has_dl": bool(r.dl_key), "has_rc": bool(r.rc_key), "is_online": r.is_online,
                    "primary_colleges": [n for n, b in zones if not b], "backup_colleges": [n for n, b in zones if b]})
    return out


@router.get("/riders/{rider_id}/documents")
def rider_documents(rider_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _rider(db, rider_id)
    return {"dl_url": storage.presign_get(r.dl_key) if r.dl_key else None,
            "rc_url": storage.presign_get(r.rc_key) if r.rc_key else None}


@router.post("/riders/{rider_id}/approve")
def approve_rider(rider_id: uuid.UUID, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _rider(db, rider_id)
    if not (r.dl_key and r.rc_key):
        raise HTTPException(409, "Driving licence and RC must both be uploaded before approval")
    r.kyc_status, r.kyc_note = KycStatus.approved, None
    audit(db, admin.id, "rider.approve", "rider", r.id)
    db.commit()
    delivery.offer_waiting_batches(db, r)
    return {"id": r.id, "kyc_status": r.kyc_status}


@router.post("/riders/{rider_id}/reject")
def reject_rider(rider_id: uuid.UUID, body: RejectIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _rider(db, rider_id)
    r.kyc_status, r.kyc_note = KycStatus.rejected, body.reason
    audit(db, admin.id, "rider.reject", "rider", r.id, {"reason": body.reason})
    db.commit()
    return {"id": r.id, "kyc_status": r.kyc_status}


@router.put("/riders/{rider_id}/colleges", status_code=204)
def set_rider_colleges(rider_id: uuid.UUID, body: RiderCollegesIn, admin: User = Depends(admin_only),
                       db: Session = Depends(get_db)):
    r = _rider(db, rider_id)
    both = set(body.primary) | set(body.backup)
    if len(db.scalars(select(College.id).where(College.id.in_(both))).all()) != len(both):
        raise HTTPException(422, "Unknown college")
    db.execute(delete(RiderCollege).where(RiderCollege.rider_id == r.id))
    db.add_all(RiderCollege(rider_id=r.id, college_id=c, is_backup=False) for c in set(body.primary))
    db.add_all(RiderCollege(rider_id=r.id, college_id=c, is_backup=True) for c in set(body.backup) - set(body.primary))
    audit(db, admin.id, "rider.zones", "rider", r.id, {"primary": [str(c) for c in body.primary], "backup": [str(c) for c in body.backup]})
    db.commit()
    if r.kyc_status == KycStatus.approved:
        delivery.offer_waiting_batches(db, r)


@router.get("/riders/{rider_id}/performance")
def rider_performance(rider_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _rider(db, rider_id)
    done = db.scalars(select(DeliveryBatch).where(DeliveryBatch.rider_id == r.id, DeliveryBatch.status == BatchStatus.completed)).all()
    skipped = db.scalar(select(func.count()).select_from(BatchOrder).join(DeliveryBatch, DeliveryBatch.id == BatchOrder.batch_id)
                        .where(DeliveryBatch.rider_id == r.id, BatchOrder.status == BatchOrderStatus.skipped))
    return {"runs_completed": len(done),
            "packets_delivered": db.scalar(select(func.count()).select_from(BatchOrder).join(DeliveryBatch, DeliveryBatch.id == BatchOrder.batch_id)
                                           .where(DeliveryBatch.rider_id == r.id, BatchOrder.status == BatchOrderStatus.picked_up,
                                                  DeliveryBatch.status == BatchStatus.completed)),
            "packets_skipped": skipped, "total_payout": sum((b.payout_total or Decimal(0)) for b in done)}


@router.post("/batches/{batch_id}/assign-rider", status_code=204)
def assign_rider(batch_id: uuid.UUID, body: AssignRiderIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Assign (or replace with) a specific rider, e.g. a backup rider. Only before the trip departs."""
    batch, rider = db.get(DeliveryBatch, batch_id), _rider(db, body.rider_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.status not in (BatchStatus.unassigned, BatchStatus.offered, BatchStatus.accepted):
        raise HTTPException(409, "This run can no longer be reassigned")
    if rider.kyc_status != KycStatus.approved:
        raise HTTPException(409, "Rider is not approved")
    if batch.rider_id == rider.id and batch.status != BatchStatus.unassigned:
        return
    batch.rider_id, batch.status, batch.offered_at, batch.accepted_at = rider.id, BatchStatus.offered, datetime.now(UTC), None
    audit(db, admin.id, "batch.assign_rider", "batch", batch.id, {"rider_id": str(rider.id)})
    db.commit()
