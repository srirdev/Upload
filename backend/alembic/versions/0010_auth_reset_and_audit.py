"""auth: full name, password reset links, login audit log

Adds `users.full_name` (set at sign-up), `password_reset_tokens` (single-use, expiring, only the HMAC stored) and
`login_audit_logs` (every sign-in attempt and password event; drives per-IP throttling). Password hashing moves
to Argon2id in code; existing scrypt hashes keep working and are upgraded on the next sign-in.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(120), nullable=True))

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_password_reset_tokens_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_password_reset_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])

    op.create_table(
        "login_audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("identifier", sa.String(254), nullable=False),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column("event", sa.String(40), nullable=False),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_login_audit_logs_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_login_audit_logs"),
    )
    op.create_index("ix_login_audit_logs_user_id", "login_audit_logs", ["user_id"])
    op.create_index("ix_login_audit_logs_ip", "login_audit_logs", ["ip"])
    op.create_index("ix_login_audit_logs_created_at", "login_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_login_audit_logs_created_at", "login_audit_logs")
    op.drop_index("ix_login_audit_logs_ip", "login_audit_logs")
    op.drop_index("ix_login_audit_logs_user_id", "login_audit_logs")
    op.drop_table("login_audit_logs")
    op.drop_index("ix_password_reset_tokens_user_id", "password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "full_name")
