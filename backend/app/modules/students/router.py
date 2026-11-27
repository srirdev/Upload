import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from app.modules.colleges.models import College
from app.modules.notifications.models import notify
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order
from app.modules.orders.service import random_code
from app.modules.payments.models import Refund
from app.modules.students.models import Complaint, ComplaintAttachment, ComplaintCategory, StudentProfile
from app.modules.students.schemas import ComplaintOut, ProfileIn, ProfileName, ProfileOut

router = APIRouter(prefix="/students", tags=["students"])
student_only = require_roles(Role.student)
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTOS = 3


def _profile(db: Session, user: User) -> StudentProfile:
    p = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not p:
        raise HTTPException(404, "Profile not set up")
    return p


def _profile_out(db: Session, p: StudentProfile) -> ProfileOut:
    return ProfileOut(**{c: getattr(p, c) for c in ("full_name", "college_id", "department", "year",
                                                    "register_number", "referral_code")},
                      college_name=db.get(College, p.college_id).name)


@router.get("/me/profile", response_model=ProfileOut)
def get_profile(user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _profile_out(db, _profile(db, user))


@router.post("/me/profile", response_model=ProfileOut, status_code=201)
def create_profile(body: ProfileIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    """One-time academic setup. Academic fields are locked afterwards (admin can correct them)."""
    if db.scalar(select(StudentProfile.id).where(StudentProfile.user_id == user.id)):
        raise HTTPException(409, "Profile already set up")
    college = db.get(College, body.college_id)
    if not college or not college.active:
        raise HTTPException(422, "Choose a valid college")
    code = random_code(8)
    while db.scalar(select(StudentProfile.id).where(StudentProfile.referral_code == code)):
        code = random_code(8)
    p = StudentProfile(user_id=user.id, referral_code=code, **body.model_dump())
    db.add(p)
    db.commit()
    return _profile_out(db, p)


@router.patch("/me/profile", response_model=ProfileOut)
def rename(body: ProfileName, user: User = Depends(student_only), db: Session = Depends(get_db)):
    p = _profile(db, user)
    p.full_name = body.full_name
    db.commit()
    return _profile_out(db, p)


def _complaint_out(db: Session, c: Complaint) -> ComplaintOut:
    order = db.get(Order, c.order_id)
    refund = db.scalar(select(Refund).where(Refund.order_id == c.order_id).order_by(Refund.created_at.desc()))
    return ComplaintOut(
        id=c.id, order_id=c.order_id, order_code=order.code, category=c.category, description=c.description,
        photo_urls=[storage.presign_get(a.storage_key) for a in c.attachments], status=c.status,
        admin_response=c.admin_response, refund_status=refund.status.value if refund else None,
        created_at=c.created_at,
    )


@router.post("/complaints", response_model=ComplaintOut, status_code=201)
def create_complaint(order_id: uuid.UUID = Form(...), category: ComplaintCategory = Form(...),
                     description: str = Form(..., min_length=5, max_length=2000),
                     photos: list[UploadFile] = File(default=[]),
                     user: User = Depends(student_only), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order or order.student_id != user.id:
        raise HTTPException(404, "Order not found")
    if order.status in (OrderStatus.draft, OrderStatus.awaiting_payment):
        raise HTTPException(409, "You can only report an issue on a placed order")
    photos = [p for p in photos if p.filename]
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(422, f"Attach at most {MAX_PHOTOS} photos")
    files = []
    for photo in photos:  # validate everything before storing anything
        data = photo.file.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Photo is too large (max 5 MB)")
        if data.startswith(b"\xff\xd8\xff"):
            files.append((data, "image/jpeg", "jpg"))
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            files.append((data, "image/png", "png"))
        else:
            raise HTTPException(415, "Photos must be JPG or PNG")
    complaint = Complaint(id=uuid.uuid4(), order_id=order.id, student_id=user.id, category=category,
                          description=description.strip())
    for data, ctype, ext in files:
        key = f"complaints/{complaint.id}/{uuid.uuid4().hex}.{ext}"
        storage.put_object(key, data, ctype)
        complaint.attachments.append(ComplaintAttachment(storage_key=key, content_type=ctype, size_bytes=len(data),
                                                         uploaded_by=user.id))
    db.add(complaint)
    notify(db, user.id, "complaint_update", "Complaint received",
           f"We'll look into your issue with {order.code}.", order.id)
    db.commit()
    return _complaint_out(db, complaint)


@router.get("/complaints", response_model=list[ComplaintOut])
def list_complaints(user: User = Depends(student_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Complaint).where(Complaint.student_id == user.id)
                      .order_by(Complaint.created_at.desc()).limit(100)).all()
    return [_complaint_out(db, c) for c in rows]
