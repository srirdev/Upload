"""password login replaces OTP login

Adds `users.email` (optional, unique, lower-case), `users.password_hash` and a failed-login lockout
(`failed_logins`, `locked_until`). Drops `otp_codes` (login OTPs are gone; shop->rider handover OTPs live in
`handover_otps` and are unaffected). Existing users have no password yet: set one with
`python -m app.modules.auth.cli set-password <mobile>`.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(254), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("failed_logins", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    # Admins already have an email on their profile: make it a login identifier too.
    op.execute("""
        UPDATE users SET email = lower(a.email) FROM admin_profiles a
        WHERE a.user_id = users.id AND a.email IS NOT NULL
    """)

    op.drop_index("ix_otp_codes_mobile", table_name="otp_codes")
    op.drop_table("otp_codes")


def downgrade() -> None:
    op.create_table(
        "otp_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mobile", sa.String(10), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_otp_codes"),
    )
    op.create_index("ix_otp_codes_mobile", "otp_codes", ["mobile"])

    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_logins")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")
