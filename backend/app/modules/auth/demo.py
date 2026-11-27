"""DEVELOPMENT ONLY: demo accounts for all four portals, ready to use.

    python -m app.modules.auth.demo

Creates (or repairs) one account per portal from the DEMO_* settings in .env, all with DEMO_PASSWORD:
  student  profile at the first active college (the sample college is created if there is none)
  shop     registered with the default rate card, approved, assigned to that college and open
  rider    KYC approved (labelled placeholder documents), primary rider for that college and online
  admin    with an admin profile
Safe to re-run: existing demo accounts are completed and their password reset to DEMO_PASSWORD. A mobile number
or email already used by a different role is left untouched. Refuses to run unless APP_ENV=development.
"""
import sys
from decimal import Decimal
from io import BytesIO

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core import storage
from app.core.config import get_settings
from app.modules.auth.models import AdminProfile, Role, User
from app.modules.colleges.models import College
from app.modules.finance.seed import seed_defaults, seed_sample_college
from app.modules.orders.service import random_code
from app.modules.riders.models import KycStatus, RiderCollege, RiderProfile
from app.modules.shops import service as shops
from app.modules.shops.models import ShopCollege, ShopProfile, ShopStatus
from app.modules.shops.schemas import ShopRegisterIn
from app.modules.students.models import StudentProfile


class DemoError(RuntimeError):
    pass


def demo_accounts() -> list[dict]:
    """The demo accounts from settings (no password)."""
    s = get_settings()
    return [
        {"role": r, "mobile": getattr(s, f"demo_{r}_mobile"), "email": getattr(s, f"demo_{r}_email").lower(),
         "name": getattr(s, f"demo_{r}_name")}
        for r in ("student", "shop", "rider", "admin")
    ]


def demo_enabled() -> bool:
    s = get_settings()
    return s.app_env == "development" and bool(s.demo_password)


def _placeholder_document(label: str) -> bytes:
    """A small PNG that plainly says it is a demo placeholder (never a real KYC document)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (640, 400), (237, 228, 255))
    d = ImageDraw.Draw(img)
    d.rectangle((8, 8, 631, 391), outline=(109, 40, 217), width=6)
    d.text((40, 170), f"DEMO PLACEHOLDER - {label}\nNot a real document (development only)", fill=(20, 15, 60))
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _user(db: Session, acc: dict, password_hash: str, report: list[str]) -> User | None:
    role = Role(acc["role"])
    user = db.scalar(select(User).where(or_(User.mobile == acc["mobile"], User.email == acc["email"])))
    if user and user.role != role:
        report.append(f"SKIPPED {acc['role']}: {acc['mobile']} / {acc['email']} already belongs to a {user.role.value} account")
        return None
    if not user:
        user = User(mobile=acc["mobile"], email=acc["email"], role=role)
        db.add(user)
    user.full_name = acc["name"]
    user.password_hash = password_hash
    user.is_active, user.failed_logins, user.locked_until = True, 0, None
    db.flush()
    return user


def seed_demo(db: Session) -> list[str]:
    """Creates/repairs the four demo accounts. Returns a human-readable report (no passwords)."""
    s = get_settings()
    if s.app_env != "development":
        raise DemoError("Demo accounts are only allowed when APP_ENV=development")
    if not s.demo_password or len(s.demo_password) < 8:
        raise DemoError("Set DEMO_PASSWORD (8+ characters) in .env to create demo accounts")

    seed_defaults(db)
    college = db.scalar(select(College).where(College.active.is_(True)).order_by(College.name))
    if not college:
        seed_sample_college(db)
        college = db.scalar(select(College).where(College.active.is_(True)))
    db.commit()

    password_hash = sec.hash_password(s.demo_password)
    acc = {a["role"]: a for a in demo_accounts()}
    report: list[str] = []

    # Admin
    if admin := _user(db, acc["admin"], password_hash, report):
        if not db.scalar(select(AdminProfile).where(AdminProfile.user_id == admin.id)):
            db.add(AdminProfile(user_id=admin.id, full_name=acc["admin"]["name"], email=acc["admin"]["email"]))
        report.append(f"admin    {acc['admin']['mobile']}  {acc['admin']['email']}")

    # Student
    if student := _user(db, acc["student"], password_hash, report):
        if not db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id)):
            code = random_code(8)
            while db.scalar(select(StudentProfile.id).where(StudentProfile.referral_code == code)):
                code = random_code(8)
            db.add(StudentProfile(user_id=student.id, full_name=acc["student"]["name"], college_id=college.id,
                                  department="Computer Science", year=3, register_number="DEMO001", referral_code=code))
        report.append(f"student  {acc['student']['mobile']}  {acc['student']['email']}  ({college.name})")
    db.commit()

    # Shop: registered through the normal service (gets the default rate card), then approved, zoned and opened.
    if owner := _user(db, acc["shop"], password_hash, report):
        shop = db.scalar(select(ShopProfile).where(ShopProfile.user_id == owner.id))
        if not shop:
            db.commit()
            shop = shops.register(db, owner, ShopRegisterIn(
                shop_name=acc["shop"]["name"], owner_name=acc["shop"]["name"],
                latitude=(college.latitude or Decimal("13.0827")) + Decimal("0.004"),
                longitude=(college.longitude or Decimal("80.2707")) + Decimal("0.004"),
                area=college.city or "Campus area", landmark="Demo shop near the campus", upi_id="demoshop@okbank",
                accept_terms=True,
            ))
        shop.status, shop.rejection_reason, shop.is_open = ShopStatus.approved, None, True
        if not db.scalar(select(ShopCollege).where(ShopCollege.shop_id == shop.id, ShopCollege.college_id == college.id)):
            db.add(ShopCollege(shop_id=shop.id, college_id=college.id))
        db.commit()
        shops.assign_waiting_orders(db, shop)
        report.append(f"shop     {acc['shop']['mobile']}  {acc['shop']['email']}  (approved, open)")

    # Rider: KYC approved with clearly labelled placeholder documents, primary for the college, online.
    if rider_user := _user(db, acc["rider"], password_hash, report):
        rider = db.scalar(select(RiderProfile).where(RiderProfile.user_id == rider_user.id))
        if not rider:
            rider = RiderProfile(user_id=rider_user.id, full_name=acc["rider"]["name"], base_area=college.city or "Campus area",
                                 vehicle_number="TN00DEMO01", upi_id="demorider@okbank")
            db.add(rider)
            db.flush()
        for kind in ("dl", "rc"):
            if not getattr(rider, f"{kind}_key"):
                key = f"riders/{rider.id}/{kind}-demo-placeholder.png"
                storage.put_object(key, _placeholder_document("Driving licence" if kind == "dl" else "Vehicle RC"), "image/png")
                setattr(rider, f"{kind}_key", key)
        rider.kyc_status, rider.kyc_note, rider.is_online = KycStatus.approved, None, True
        if not db.scalar(select(RiderCollege).where(RiderCollege.rider_id == rider.id, RiderCollege.college_id == college.id)):
            db.add(RiderCollege(rider_id=rider.id, college_id=college.id, is_backup=False))
        db.commit()
        report.append(f"rider    {acc['rider']['mobile']}  {acc['rider']['email']}  (KYC approved, online)")
    return report


def main() -> None:
    from app.db.session import SessionLocal

    try:
        with SessionLocal() as db:
            report = seed_demo(db)
    except DemoError as e:
        sys.exit(str(e))
    print("Demo accounts ready (password = DEMO_PASSWORD in .env). Sign in at http://localhost:5173/<role>/login")
    for line in report:
        print("  " + line)


if __name__ == "__main__":
    main()
