"""Colleges, security-cabin details and delivery slots."""
import uuid
from datetime import time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.auth.models import User
from app.modules.colleges.models import College, CollegeSlot
from app.modules.finance.ledger import audit

router = APIRouter(prefix="/admin", tags=["admin"])


class CollegeIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    security_cabin: str = Field(min_length=2, max_length=200)
    drop_instructions: str | None = Field(default=None, max_length=2000)
    collection_instructions: str | None = Field(default=None, max_length=2000)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    active: bool = True


class SlotIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    delivery_time: time
    cutoff_minutes: int = Field(ge=0, le=24 * 60)
    capacity: int = Field(ge=1, le=10_000)
    active: bool = True


def _slot_out(s: CollegeSlot) -> dict:
    return {"id": s.id, "label": s.label, "delivery_time": s.delivery_time.strftime("%H:%M"),
            "cutoff_minutes": s.cutoff_minutes, "capacity": s.capacity, "active": s.active}


def _college_out(db: Session, c: College) -> dict:
    slots = db.scalars(select(CollegeSlot).where(CollegeSlot.college_id == c.id).order_by(CollegeSlot.delivery_time)).all()
    return {"id": c.id, "name": c.name, "city": c.city, "security_cabin": c.security_cabin,
            "drop_instructions": c.drop_instructions, "collection_instructions": c.collection_instructions,
            "latitude": c.latitude, "longitude": c.longitude, "active": c.active, "slots": [_slot_out(s) for s in slots]}


@router.get("/colleges")
def list_colleges(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_college_out(db, c) for c in db.scalars(select(College).order_by(College.name)).all()]


@router.post("/colleges", status_code=201)
def create_college(body: CollegeIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.scalar(select(College.id).where(College.name == body.name)):
        raise HTTPException(409, "A college with this name already exists")
    c = College(**body.model_dump())
    db.add(c)
    db.flush()
    audit(db, admin.id, "college.create", "college", c.id, {"name": c.name})
    db.commit()
    return _college_out(db, c)


@router.put("/colleges/{college_id}")
def update_college(college_id: uuid.UUID, body: CollegeIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(College, college_id)
    if not c:
        raise HTTPException(404, "College not found")
    clash = db.scalar(select(College.id).where(College.name == body.name, College.id != c.id))
    if clash:
        raise HTTPException(409, "A college with this name already exists")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    audit(db, admin.id, "college.update", "college", c.id, body.model_dump(mode="json"))
    db.commit()
    return _college_out(db, c)


@router.post("/colleges/{college_id}/slots", status_code=201)
def create_slot(college_id: uuid.UUID, body: SlotIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if not db.get(College, college_id):
        raise HTTPException(404, "College not found")
    s = CollegeSlot(college_id=college_id, **body.model_dump())
    db.add(s)
    db.flush()
    audit(db, admin.id, "slot.create", "slot", s.id, body.model_dump(mode="json"))
    db.commit()
    return _slot_out(s)


@router.put("/slots/{slot_id}")
def update_slot(slot_id: uuid.UUID, body: SlotIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Slots are deactivated rather than deleted, because existing orders reference them."""
    s = db.get(CollegeSlot, slot_id)
    if not s:
        raise HTTPException(404, "Slot not found")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    audit(db, admin.id, "slot.update", "slot", s.id, body.model_dump(mode="json"))
    db.commit()
    return _slot_out(s)
