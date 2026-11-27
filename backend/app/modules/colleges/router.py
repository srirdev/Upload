import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from app.modules.colleges.models import College
from app.modules.colleges.schemas import CollegeOut
from app.modules.orders import slots
from app.modules.orders.schemas import SlotOut

router = APIRouter(prefix="/colleges", tags=["colleges"])


@router.get("", response_model=list[CollegeOut])
def list_colleges(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(College).where(College.active.is_(True)).order_by(College.name)).all()


@router.get("/{college_id}/slots", response_model=list[SlotOut])
def college_slots(college_id: uuid.UUID, days: int = Query(3, ge=1, le=7), _: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    if not db.get(College, college_id):
        raise HTTPException(404, "College not found")
    return slots.list_slots(db, college_id, days)
