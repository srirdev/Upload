"""Finance & ledger views and the admin-editable pricing/commission configuration."""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.admin.ops import ledger_totals
from app.modules.auth.models import User
from app.modules.finance.ledger import audit
from app.modules.finance.models import AuditLog, BindingPrice, Coupon, LedgerEntry, LedgerType, PlatformConfig, RateCard
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided
from app.modules.orders.pricing import ALLOWED_GSM

router = APIRouter(prefix="/admin", tags=["admin"])
Money = Field(ge=0, le=100_000, decimal_places=2)


class ConfigIn(BaseModel):
    delivery_fee: Decimal = Money
    cover_page_fee: Decimal = Money
    commission_percent: Decimal = Field(ge=0, le=100, decimal_places=2)
    max_upload_mb: int = Field(ge=1, le=200)
    slot_hold_minutes: int = Field(ge=1, le=240)
    rider_base_fee: Decimal = Money
    rider_extra_shop_fee: Decimal = Money
    rider_packet_bonus: Decimal = Money
    rider_min_guarantee: Decimal = Money
    no_wait_minutes: int = Field(ge=1, le=30)
    gateway_fee_percent: Decimal = Field(ge=0, le=100, decimal_places=2)
    late_refund_percent: Decimal = Field(ge=0, le=100, decimal_places=2)


class RateIn(BaseModel):
    paper_size: PaperSize
    gsm: int
    color: ColorMode
    sided: Sided
    price_per_page: Decimal = Field(ge=0, le=10_000, decimal_places=2)


class BindingIn(BaseModel):
    binding: Binding
    price: Decimal = Field(ge=0, le=100_000, decimal_places=2)


class CouponIn(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    percent_off: Decimal | None = Field(default=None, gt=0, le=100)
    flat_off: Decimal | None = Field(default=None, gt=0, le=100_000)
    active: bool = True
    valid_until: datetime | None = None


def _config(db: Session) -> PlatformConfig:
    cfg = db.get(PlatformConfig, 1)
    if not cfg:
        raise HTTPException(409, "Platform configuration has not been initialised (run the seed command)")
    return cfg


@router.get("/config")
def get_config(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    cfg = _config(db)
    return {k: getattr(cfg, k) for k in ConfigIn.model_fields}


@router.put("/config")
def put_config(body: ConfigIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    cfg = _config(db)
    before = {k: str(getattr(cfg, k)) for k in ConfigIn.model_fields}
    for k, v in body.model_dump().items():
        setattr(cfg, k, v)
    audit(db, admin.id, "config.update", "platform_config", 1, {"before": before, "after": body.model_dump(mode="json")})
    db.commit()
    return {k: getattr(cfg, k) for k in ConfigIn.model_fields}


@router.get("/config/rates")
def get_rates(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    rates = db.scalars(select(RateCard).order_by(RateCard.paper_size, RateCard.color, RateCard.sided, RateCard.gsm)).all()
    return {"rates": [{"paper_size": r.paper_size, "gsm": r.gsm, "color": r.color, "sided": r.sided,
                       "price_per_page": r.price_per_page} for r in rates],
            "binding": [{"binding": b.binding, "price": b.price} for b in db.scalars(select(BindingPrice)).all()]}


@router.put("/config/rates")
def put_rates(rates: list[RateIn], admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Upsert price-per-page rows. Existing orders keep their locked quotations."""
    for r in rates:
        if r.gsm not in ALLOWED_GSM:
            raise HTTPException(422, f"GSM must be one of {ALLOWED_GSM}")
        row = db.scalar(select(RateCard).where(RateCard.paper_size == r.paper_size, RateCard.gsm == r.gsm,
                                               RateCard.color == r.color, RateCard.sided == r.sided))
        if row:
            row.price_per_page = r.price_per_page
        else:
            db.add(RateCard(**r.model_dump()))
    audit(db, admin.id, "rates.update", "rate_card", None, {"rows": [r.model_dump(mode="json") for r in rates]})
    db.commit()
    return {"updated": len(rates)}


@router.put("/config/binding")
def put_binding(prices: list[BindingIn], admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    for p in prices:
        if p.binding == Binding.none:
            raise HTTPException(422, "'none' has no price")
        row = db.get(BindingPrice, p.binding)
        if row:
            row.price = p.price
        else:
            db.add(BindingPrice(binding=p.binding, price=p.price))
    audit(db, admin.id, "binding.update", "binding_price", None, {"rows": [p.model_dump(mode="json") for p in prices]})
    db.commit()
    return {"updated": len(prices)}


def _coupon_out(c: Coupon) -> dict:
    return {"code": c.code, "percent_off": c.percent_off, "flat_off": c.flat_off, "active": c.active, "valid_until": c.valid_until}


@router.get("/coupons")
def list_coupons(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_coupon_out(c) for c in db.scalars(select(Coupon).order_by(Coupon.created_at.desc())).all()]


@router.put("/coupons")
def upsert_coupon(body: CouponIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if (body.percent_off is None) == (body.flat_off is None):
        raise HTTPException(422, "Set either a percentage or a flat amount")
    code = body.code.upper()
    c = db.get(Coupon, code)
    data = {**body.model_dump(), "code": code}
    if c:
        for k, v in data.items():
            setattr(c, k, v)
    else:
        c = Coupon(**data)
        db.add(c)
    audit(db, admin.id, "coupon.upsert", "coupon", code, body.model_dump(mode="json"))
    db.commit()
    return _coupon_out(c)


# ---- ledger -----------------------------------------------------------------------------------


def _range(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    lo = datetime.combine(start, time.min, tzinfo=slot_utils.IST) if start else None
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=slot_utils.IST) if end else None
    return lo, hi


@router.get("/finance/summary")
def finance_summary(start: date | None = None, end: date | None = None, _: User = Depends(admin_only),
                    db: Session = Depends(get_db)):
    lo, hi = _range(start, end)
    return ledger_totals(db, lo, hi)


@router.get("/finance/ledger")
def ledger(type: LedgerType | None = None, order_id: uuid.UUID | None = None, start: date | None = None,
           end: date | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
           _: User = Depends(admin_only), db: Session = Depends(get_db)):
    lo, hi = _range(start, end)
    q = select(LedgerEntry).order_by(LedgerEntry.created_at.desc(), LedgerEntry.id)
    if type:
        q = q.where(LedgerEntry.type == type)
    if order_id:
        q = q.where(LedgerEntry.order_id == order_id)
    if lo:
        q = q.where(LedgerEntry.created_at >= lo)
    if hi:
        q = q.where(LedgerEntry.created_at < hi)
    return [{"id": e.id, "type": e.type, "amount": e.amount, "order_id": e.order_id, "batch_id": e.batch_id,
             "note": e.note, "created_at": e.created_at} for e in db.scalars(q.limit(limit).offset(offset)).all()]


@router.get("/audit")
def audit_log(entity: str | None = None, limit: int = Query(100, ge=1, le=500), _: User = Depends(admin_only),
              db: Session = Depends(get_db)):
    q = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity:
        q = q.where(AuditLog.entity == entity)
    return [{"id": a.id, "actor_id": a.actor_id, "action": a.action, "entity": a.entity, "entity_id": a.entity_id,
             "data": a.data, "created_at": a.created_at} for a in db.scalars(q.limit(limit)).all()]
