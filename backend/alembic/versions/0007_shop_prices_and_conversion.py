"""shop price comparison and document conversion

Adds each shop's own rate card (`shop_rate_cards`, `shop_binding_prices`) so students can compare shop prices,
`orders.chosen_shop_id` (the shop a student picked), and DOCX/PPTX conversion tracking on `order_documents`
(`conversion_status`, `preview_key`). Existing shops start with a copy of the admin's default rate card.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _in(column: str, values) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "shop_rate_cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("paper_size", sa.String(30), nullable=False),
        sa.Column("gsm", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(30), nullable=False),
        sa.Column("sided", sa.String(30), nullable=False),
        sa.Column("price_per_page", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint(_in("paper_size", ("A4", "A3")), name=op.f("ck_shop_rate_cards_papersize")),
        sa.CheckConstraint(_in("color", ("bw", "color")), name=op.f("ck_shop_rate_cards_colormode")),
        sa.CheckConstraint(_in("sided", ("single", "double")), name=op.f("ck_shop_rate_cards_sided")),
        sa.CheckConstraint("gsm IN (70, 80, 100)", name=op.f("ck_shop_rate_cards_gsm_allowed")),
        sa.CheckConstraint("price_per_page >= 0", name=op.f("ck_shop_rate_cards_price_non_negative")),
        sa.ForeignKeyConstraint(["shop_id"], ["shop_profiles.id"], name="fk_shop_rate_cards_shop_id_shop_profiles"),
        sa.PrimaryKeyConstraint("id", name="pk_shop_rate_cards"),
        sa.UniqueConstraint("shop_id", "paper_size", "gsm", "color", "sided", name="uq_shop_rate_cards_shop_item"),
    )
    op.create_index("ix_shop_rate_cards_shop_id", "shop_rate_cards", ["shop_id"])
    op.create_table(
        "shop_binding_prices",
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("binding", sa.String(30), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint(_in("binding", ("none", "spiral", "calico", "soft", "hard")), name=op.f("ck_shop_binding_prices_binding")),
        sa.CheckConstraint("binding <> 'none'", name=op.f("ck_shop_binding_prices_binding_not_none")),
        sa.CheckConstraint("price >= 0", name=op.f("ck_shop_binding_prices_price_non_negative")),
        sa.ForeignKeyConstraint(["shop_id"], ["shop_profiles.id"], name="fk_shop_binding_prices_shop_id_shop_profiles"),
        sa.PrimaryKeyConstraint("shop_id", "binding", name="pk_shop_binding_prices"),
    )
    # Existing shops start from the admin's default prices (they can change them in the shop portal).
    op.execute("""
        INSERT INTO shop_rate_cards (id, shop_id, paper_size, gsm, color, sided, price_per_page)
        SELECT gen_random_uuid(), s.id, r.paper_size, r.gsm, r.color, r.sided, r.price_per_page
        FROM shop_profiles s CROSS JOIN rate_cards r
    """)
    op.execute("""
        INSERT INTO shop_binding_prices (shop_id, binding, price)
        SELECT s.id, b.binding, b.price FROM shop_profiles s CROSS JOIN binding_prices b WHERE b.binding <> 'none'
    """)

    op.add_column("orders", sa.Column("chosen_shop_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_orders_chosen_shop_id_shop_profiles", "orders", "shop_profiles", ["chosen_shop_id"], ["id"])
    op.create_index("ix_orders_chosen_shop_id", "orders", ["chosen_shop_id"])

    op.add_column("order_documents", sa.Column("conversion_status", sa.String(30), server_default="not_needed", nullable=False))
    op.add_column("order_documents", sa.Column("preview_key", sa.String(400), nullable=True))
    op.create_unique_constraint("uq_order_documents_preview_key", "order_documents", ["preview_key"])
    op.execute("UPDATE order_documents SET conversion_status = 'pending' WHERE content_type LIKE 'application/vnd.openxmlformats%'")
    op.create_check_constraint(op.f("ck_order_documents_conversionstatus"), "order_documents",
                               sa.text(_in("conversion_status", ("not_needed", "pending", "done", "failed"))))


def downgrade() -> None:
    op.drop_constraint(op.f("ck_order_documents_conversionstatus"), "order_documents", type_="check")
    op.drop_constraint("uq_order_documents_preview_key", "order_documents", type_="unique")
    op.drop_column("order_documents", "preview_key")
    op.drop_column("order_documents", "conversion_status")
    op.drop_index("ix_orders_chosen_shop_id", "orders")
    op.drop_constraint("fk_orders_chosen_shop_id_shop_profiles", "orders", type_="foreignkey")
    op.drop_column("orders", "chosen_shop_id")
    op.drop_table("shop_binding_prices")
    op.drop_index("ix_shop_rate_cards_shop_id", "shop_rate_cards")
    op.drop_table("shop_rate_cards")
