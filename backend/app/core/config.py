from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "development"
    secret_key: str = "change-me"
    cors_origins: list[str] = ["http://localhost:5173"]

    access_token_minutes: int = 30
    refresh_token_days: int = 30
    # Wrong passwords in a row before an account is locked, and for how long
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    # Failed logins from one IP address (any accounts) within 15 minutes before that IP is throttled
    login_ip_max_failures: int = 30
    # Password reset links (emailed). FRONTEND_URL builds the link, e.g. https://app.upload.in
    password_reset_minutes: int = 30
    frontend_url: str = "http://localhost:5173"
    # Outgoing email. Empty SMTP_HOST = not configured: development shows the reset link in the API response
    # (labelled DEV MOCK); any other environment refuses rather than pretend an email was sent.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "UpLOAD <no-reply@upload.local>"
    smtp_starttls: bool = True

    # Placeholder only: the real URL (with password) comes from DATABASE_URL in .env
    database_url: str = "postgresql+psycopg://UPLOAD_USER:UPLOAD_PASSWORD@localhost:5432/upload_db"
    redis_url: str = "redis://localhost:6379/0"

    # Initial administrator, created by `python -m app.modules.auth.cli` (never automatically)
    admin_mobile: str = ""
    admin_name: str = ""
    admin_email: str = ""

    # DEVELOPMENT ONLY demo accounts (`python -m app.modules.auth.demo`): one ready-to-use account per portal.
    # Empty DEMO_PASSWORD = disabled. Refused outside APP_ENV=development.
    demo_password: str = ""
    demo_student_mobile: str = "9000000101"
    demo_student_email: str = "student@demo.upload"
    demo_student_name: str = "Demo Student"
    demo_shop_mobile: str = "9000000102"
    demo_shop_email: str = "shop@demo.upload"
    demo_shop_name: str = "Demo Print Shop"
    demo_rider_mobile: str = "9000000103"
    demo_rider_email: str = "rider@demo.upload"
    demo_rider_name: str = "Demo Rider"
    demo_admin_mobile: str = "9000000104"
    demo_admin_email: str = "admin@demo.upload"
    demo_admin_name: str = "Demo Admin"

    # "s3" (MinIO / S3 / R2) or "local" (files on disk, DEVELOPMENT ONLY: lets you run without Docker)
    storage_backend: str = "s3"
    local_storage_dir: str = ".local-storage"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "upload-private"
    s3_region: str = "us-east-1"

    # LibreOffice for DOCX/PPTX -> PDF conversion (background worker). Empty = auto-detect `soffice` on PATH.
    soffice_path: str = ""
    # Scheduled jobs (app/workers): unpaid drafts older than this are cleaned up (files deleted)
    draft_retention_days: int = 30
    collection_reminder_hours: int = 2

    # Razorpay: empty keys mean payments are NOT configured (no mock success).
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


def assert_safe_config(s: Settings) -> None:
    if s.storage_backend not in ("s3", "local"):
        raise RuntimeError("STORAGE_BACKEND must be 's3' or 'local'")
    if s.storage_backend == "local" and s.app_env != "development":
        raise RuntimeError("STORAGE_BACKEND=local is for development only; use S3/R2 outside development")
    if s.app_env != "development" and (s.secret_key == "change-me" or len(s.secret_key) < 32):
        raise RuntimeError("SECRET_KEY must be set to a random value of 32+ characters")
