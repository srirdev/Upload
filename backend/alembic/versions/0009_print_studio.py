"""print preview studio: orientation and cover design

Adds `order_documents.orientation` (auto / portrait / landscape) and the cover design on `orders`
(`cover_template`, `cover_color`, `cover_title`). Defaults keep every existing order unchanged
(auto orientation, classic navy cover, no title). None of these affect the price.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def _in(column: str, values) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.add_column("order_documents", sa.Column("orientation", sa.String(30), server_default="auto", nullable=False))
    op.create_check_constraint(op.f("ck_order_documents_orientation"), "order_documents",
                               sa.text(_in("orientation", ("auto", "portrait", "landscape"))))

    op.add_column("orders", sa.Column("cover_template", sa.String(30), server_default="classic", nullable=False))
    op.add_column("orders", sa.Column("cover_color", sa.String(30), server_default="navy", nullable=False))
    op.add_column("orders", sa.Column("cover_title", sa.String(160), nullable=True))
    op.create_check_constraint(op.f("ck_orders_covertemplate"), "orders",
                               sa.text(_in("cover_template", ("classic", "modern", "minimal"))))
    op.create_check_constraint(op.f("ck_orders_covercolor"), "orders",
                               sa.text(_in("cover_color", ("navy", "maroon", "forest", "royal", "charcoal", "violet"))))


def downgrade() -> None:
    op.drop_constraint(op.f("ck_orders_covercolor"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_covertemplate"), "orders", type_="check")
    op.drop_column("orders", "cover_title")
    op.drop_column("orders", "cover_color")
    op.drop_column("orders", "cover_template")
    op.drop_constraint(op.f("ck_order_documents_orientation"), "order_documents", type_="check")
    op.drop_column("order_documents", "orientation")
