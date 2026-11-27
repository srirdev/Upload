"""TEST TOOLING ONLY: an isolated API server for the Playwright end-to-end tests.

Never use for real data. It runs the real FastAPI app against a throwaway SQLite database and a temporary file
store, seeded with the sample college and an E2E admin. The only stand-in is Razorpay's *order creation* call
(network); payment signatures are still verified by the real backend code with a test secret, exactly like the
pytest suite does.

Run (from backend/):  .venv/Scripts/python scripts/e2e_server.py   -> http://127.0.0.1:8100
"""
import os
import sys
import tempfile
from itertools import count
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TMP = Path(tempfile.mkdtemp(prefix="upload-e2e-"))
E2E_ADMIN = {"mobile": "9000000001", "password": "e2e-admin-pass", "name": "E2E Admin", "email": "admin@e2e.upload"}

# Configure before the app (and its settings cache) is imported. Explicit env wins over .env files.
os.environ.update({
    "APP_ENV": "development",
    "DATABASE_URL": f"sqlite:///{(TMP / 'e2e.db').as_posix()}",
    "STORAGE_BACKEND": "local",
    "LOCAL_STORAGE_DIR": str(TMP / "files"),
    "SECRET_KEY": "e2e-secret-key-not-for-production-0123456789",
    "RAZORPAY_KEY_ID": "rzp_test_e2e",
    "RAZORPAY_KEY_SECRET": "e2e_secret",
    "RAZORPAY_WEBHOOK_SECRET": "e2e_whsec",
    "FRONTEND_URL": os.environ.get("E2E_FRONTEND_URL", "http://localhost:5174"),
    "CORS_ORIGINS": '["http://localhost:5174","http://127.0.0.1:5174"]',
    "SMTP_HOST": "",
})


def main() -> None:
    import uvicorn
    from sqlalchemy import event

    from app.core import security as sec
    from app.db import models  # noqa: F401  (registers every table)
    from app.db.session import Base, SessionLocal, engine
    from app.modules.auth.models import AdminProfile, Role, User
    from app.modules.finance.seed import seed_defaults, seed_sample_college
    from app.modules.payments import service as payments

    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_defaults(db)
        seed_sample_college(db)
        admin = User(mobile=E2E_ADMIN["mobile"], email=E2E_ADMIN["email"], full_name=E2E_ADMIN["name"], role=Role.admin,
                     password_hash=sec.hash_password(E2E_ADMIN["password"]))
        db.add(admin)
        db.flush()
        db.add(AdminProfile(user_id=admin.id, full_name=E2E_ADMIN["name"], email=E2E_ADMIN["email"]))
        db.commit()

    n = count(1)
    payments.create_gateway_order = lambda amount_paise, receipt: f"order_e2e_{next(n)}"  # no network in tests

    from app.main import app
    print(f"E2E API on http://127.0.0.1:8100 (data in {TMP})", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8100, log_level="warning")


if __name__ == "__main__":
    main()
