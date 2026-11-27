import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.deps import get_current_user, require_roles
from app.modules.auth.models import Role, User
from app.modules.delivery import service
from app.modules.delivery.schemas import ArriveIn, NotReadyOut, PickupIn, RunOut

router = APIRouter(prefix="/delivery", tags=["delivery"])
rider_only = require_roles(Role.rider)


def _view(db: Session, batch) -> dict:
    return service.run_view(db, batch)


@router.post("/batches/{batch_id}/accept", response_model=RunOut)
def accept(batch_id: uuid.UUID, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    return _view(db, service.accept(db, batch))


@router.post("/batches/{batch_id}/decline", status_code=204)
def decline(batch_id: uuid.UUID, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    rider, batch = service.rider_batch(db, user, batch_id)
    service.decline(db, rider, batch)


@router.post("/batches/{batch_id}/arrive", response_model=RunOut)
def arrive(batch_id: uuid.UUID, body: ArriveIn, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    service.arrive(db, batch, body.shop_id)
    return _view(db, batch)


@router.post("/batches/{batch_id}/pickup", response_model=RunOut)
def pickup(batch_id: uuid.UUID, body: PickupIn, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    service.verify_pickup(db, user, batch, body.order_id, body.code)
    return _view(db, batch)


@router.post("/batches/{batch_id}/not-ready", response_model=NotReadyOut)
def not_ready(batch_id: uuid.UUID, body: ArriveIn, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    return NotReadyOut(skipped=[o.code for o in service.not_ready(db, user, batch, body.shop_id)])


@router.post("/batches/{batch_id}/depart", response_model=RunOut)
def depart(batch_id: uuid.UUID, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    return _view(db, service.depart(db, user, batch))


@router.post("/batches/{batch_id}/close-empty", response_model=RunOut)
def close_empty(batch_id: uuid.UUID, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    _, batch = service.rider_batch(db, user, batch_id)
    return _view(db, service.close_empty(db, batch))


@router.post("/batches/{batch_id}/shelf-photo", response_model=RunOut)
def shelf_photo(batch_id: uuid.UUID, file: UploadFile = File(...), user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    batch = service.actor_batch(db, user, batch_id)
    service.upload_shelf_photo(db, user, batch, file.filename or "photo", file.file.read(service.MAX_PHOTO_BYTES + 1))
    return _view(db, batch)


@router.post("/batches/{batch_id}/complete", response_model=RunOut)
def complete(batch_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    batch = service.actor_batch(db, user, batch_id)
    return _view(db, service.complete(db, user, batch))
