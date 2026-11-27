import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from app.modules.delivery import service
from app.modules.delivery.schemas import AvailabilityIn, EarningsOut, HistoryItem, RiderOut, RiderRegisterIn, RunOut
from app.modules.orders.documents import inspect_upload
from app.modules.riders.models import KycStatus, RiderProfile

router = APIRouter(prefix="/riders", tags=["riders"])
rider_only = require_roles(Role.rider)
KYC_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_KYC_BYTES = 5 * 1024 * 1024


def rider_out(r: RiderProfile) -> RiderOut:
    return RiderOut(id=r.id, full_name=r.full_name, base_area=r.base_area, vehicle_number=r.vehicle_number,
                    upi_id=r.upi_id, kyc_status=r.kyc_status, kyc_note=r.kyc_note,
                    has_dl=bool(r.dl_key), has_rc=bool(r.rc_key), is_online=r.is_online)


@router.post("/me", response_model=RiderOut, status_code=201)
def register(body: RiderRegisterIn, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    if db.scalar(select(RiderProfile.id).where(RiderProfile.user_id == user.id)):
        raise HTTPException(409, "You have already registered")
    rider = RiderProfile(user_id=user.id, **body.model_dump())
    db.add(rider)
    db.commit()
    return rider_out(rider)


@router.get("/me", response_model=RiderOut)
def me(user: User = Depends(rider_only), db: Session = Depends(get_db)):
    return rider_out(service.get_rider(db, user))


@router.post("/me/documents/{kind}", response_model=RiderOut)
def upload_kyc(kind: str, file: UploadFile = File(...), user: User = Depends(rider_only), db: Session = Depends(get_db)):
    if kind not in ("dl", "rc"):
        raise HTTPException(404, "Unknown document")
    rider = service.get_rider(db, user)
    data = file.file.read(MAX_KYC_BYTES + 1)
    if len(data) > MAX_KYC_BYTES:
        raise HTTPException(413, "File is too large (max 5 MB)")
    ctype, _ = inspect_upload(file.filename or "", data)
    if ctype not in KYC_TYPES:
        raise HTTPException(415, "Upload a PDF, JPG or PNG")
    key = f"kyc/{rider.id}/{kind}-{uuid.uuid4()}"
    storage.put_object(key, data, ctype)
    old = rider.dl_key if kind == "dl" else rider.rc_key
    setattr(rider, f"{kind}_key", key)
    if rider.kyc_status == KycStatus.rejected:  # re-submission goes back into review
        rider.kyc_status, rider.kyc_note = KycStatus.pending, None
    db.commit()
    if old:
        try:
            storage.delete_object(old)
        except Exception:
            pass
    return rider_out(rider)


@router.put("/me/availability", response_model=RiderOut)
def availability(body: AvailabilityIn, user: User = Depends(rider_only), db: Session = Depends(get_db)):
    return rider_out(service.set_online(db, service.get_approved_rider(db, user), body.is_online))


@router.get("/me/run", response_model=RunOut | None)
def active_run(user: User = Depends(rider_only), db: Session = Depends(get_db)):
    rider = service.get_approved_rider(db, user)
    batch = service.current_run(db, rider)
    return service.run_view(db, batch) if batch else None


@router.get("/me/history", response_model=list[HistoryItem])
def history(user: User = Depends(rider_only), db: Session = Depends(get_db)):
    return service.history(db, service.get_approved_rider(db, user))


@router.get("/me/earnings", response_model=EarningsOut)
def earnings(user: User = Depends(rider_only), db: Session = Depends(get_db)):
    return service.earnings(db, service.get_approved_rider(db, user))
