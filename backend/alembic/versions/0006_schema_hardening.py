"""schema hardening: roles, admin profiles, shop services, complaint attachments, status history, constraints

Adds the RBAC role catalogue, admin profiles, the shop service catalogue, multi-photo complaint evidence,
from/to status on order events and rider availability. Converts JSON columns to JSONB, adds missing
foreign-key indexes, composite FKs that keep intentionally repeated keys consistent, and CHECK constraints
for every enum, money amount and range. Existing rows are preserved (complaint photos move to
complaint_attachments). PostgreSQL runs this in one transaction: any violating row aborts it untouched.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

ROLES = [
    ("student", "Uploads documents, pays and collects packets"),
    ("rider", "Delivery partner: collects packets from shops and delivers to the security cabin"),
    ("shop", "Printing shop owner: prints, binds and packs orders"),
    ("admin", "Operations centre: approvals, colleges, complaints, refunds and finance"),
]
SERVICES = [
    ("print_a4_bw", "print", "A4 black & white printing"),
    ("print_a4_color", "print", "A4 colour printing"),
    ("print_a3_bw", "print", "A3 black & white printing"),
    ("print_a3_color", "print", "A3 colour printing"),
    ("binding_spiral", "binding", "Spiral binding"),
    ("binding_calico", "binding", "Calico binding"),
    ("binding_soft", "binding", "Soft binding"),
    ("binding_hard", "binding", "Hard binding"),
]
ORDER_STATUSES = ("draft", "awaiting_payment", "placed", "accepted", "printing", "packing", "handover_verified",
                  "out_for_delivery", "delivered", "collected", "cancelled", "rejected")


def _in(column: str, values) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


# CHECK constraints on tables that already existed (Alembic autogenerate does not detect CHECKs).
# Names are final: wrap them in op.f() so the "ck" naming convention is not applied a second time.
CHECKS = [
    ("binding_prices", "ck_binding_prices_binding", _in("binding", ("none", "spiral", "calico", "soft", "hard"))),
    ("binding_prices", "ck_binding_prices_price_non_negative", "price >= 0"),
    ("colleges", "ck_colleges_coordinates", "(latitude IS NULL OR latitude BETWEEN -90 AND 90) "
                                             "AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)"),
    ("coupons", "ck_coupons_flat_positive", "flat_off IS NULL OR flat_off > 0"),
    ("coupons", "ck_coupons_one_discount_kind", "(percent_off IS NULL) <> (flat_off IS NULL)"),
    ("coupons", "ck_coupons_percent_range", "percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)"),
    ("platform_config", "ck_platform_config_fees_non_negative",
     "delivery_fee >= 0 AND cover_page_fee >= 0 AND rider_base_fee >= 0 AND rider_extra_shop_fee >= 0 "
     "AND rider_packet_bonus >= 0 AND rider_min_guarantee >= 0"),
    ("platform_config", "ck_platform_config_limits", "max_upload_mb > 0 AND slot_hold_minutes > 0 AND no_wait_minutes >= 0"),
    ("platform_config", "ck_platform_config_percents", "commission_percent BETWEEN 0 AND 100 "
                                                        "AND gateway_fee_percent BETWEEN 0 AND 100 "
                                                        "AND late_refund_percent BETWEEN 0 AND 100"),
    ("platform_config", "ck_platform_config_single_row", "id = 1"),
    ("rate_cards", "ck_rate_cards_colormode", _in("color", ("bw", "color"))),
    ("rate_cards", "ck_rate_cards_gsm_allowed", "gsm IN (70, 80, 100)"),
    ("rate_cards", "ck_rate_cards_papersize", _in("paper_size", ("A4", "A3"))),
    ("rate_cards", "ck_rate_cards_price_non_negative", "price_per_page >= 0"),
    ("rate_cards", "ck_rate_cards_sided", _in("sided", ("single", "double"))),
    ("college_slots", "ck_college_slots_limits", "cutoff_minutes >= 0 AND capacity >= 0"),
    ("rider_profiles", "ck_rider_profiles_kycstatus", _in("kyc_status", ("pending", "approved", "rejected"))),
    ("shop_profiles", "ck_shop_profiles_coordinates", "latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180"),
    ("shop_profiles", "ck_shop_profiles_shopstatus", _in("status", ("pending", "approved", "rejected", "suspended"))),
    ("student_profiles", "ck_student_profiles_year_range", "year BETWEEN 1 AND 6"),
    ("rider_settlements", "ck_rider_settlements_amounts_non_negative", "batch_count >= 0 AND amount >= 0"),
    ("rider_settlements", "ck_rider_settlements_period", "period_end >= period_start"),
    ("rider_settlements", "ck_rider_settlements_ridersettlementstatus", _in("status", ("pending", "paid"))),
    ("settlements", "ck_settlements_amounts_non_negative", "order_count >= 0 AND gross_amount >= 0 AND refund_deductions >= 0"),
    ("settlements", "ck_settlements_period", "period_end >= period_start"),
    ("settlements", "ck_settlements_settlementstatus", _in("status", ("pending", "paid"))),
    ("delivery_batches", "ck_delivery_batches_batchmode", _in("mode", ("consolidated", "direct"))),
    ("delivery_batches", "ck_delivery_batches_batchstatus",
     _in("status", ("unassigned", "offered", "accepted", "out_for_delivery", "completed", "cancelled"))),
    ("delivery_batches", "ck_delivery_batches_direct_has_shop", "mode = 'consolidated' OR shop_id IS NOT NULL"),
    ("delivery_batches", "ck_delivery_batches_payout_non_negative", "payout_total IS NULL OR payout_total >= 0"),
    ("orders", "ck_orders_binding", _in("binding", ("none", "spiral", "calico", "soft", "hard"))),
    ("orders", "ck_orders_commission_percent_range", "commission_percent BETWEEN 0 AND 100"),
    ("orders", "ck_orders_orderstatus", _in("status", ORDER_STATUSES)),
    ("orders", "ck_orders_paymentstatus",
     _in("payment_status", ("unpaid", "pending", "paid", "failed", "refund_pending", "refunded"))),
    ("orders", "ck_orders_split_non_negative", "commission_amount >= 0 AND shop_entitlement >= 0"),
    ("batch_orders", "ck_batch_orders_batchorderstatus", _in("status", ("pending", "picked_up", "skipped", "removed"))),
    ("complaints", "ck_complaints_complaintcategory",
     _in("category", ("damaged_binding", "missing_pages", "not_on_shelf", "late_delivery"))),
    ("complaints", "ck_complaints_complaintstatus", _in("status", ("open", "in_review", "resolved", "rejected"))),
    ("ledger_entries", "ck_ledger_entries_amount_non_negative", "amount >= 0"),
    ("ledger_entries", "ck_ledger_entries_ledgertype",
     _in("type", ("gross_revenue", "printing_charges", "delivery_fee", "discount", "shop_entitlement", "rider_payout",
                  "gateway_fee", "refund", "shop_refund_recovery", "platform_commission"))),
    ("order_documents", "ck_order_documents_copies_positive", "copies >= 1"),
    ("order_documents", "ck_order_documents_page_count_positive", "page_count IS NULL OR page_count >= 1"),
    ("order_documents", "ck_order_documents_papersize", _in("paper_size", ("A4", "A3"))),
    ("order_documents", "ck_order_documents_size_positive", "size_bytes > 0"),
    ("order_events", "ck_order_events_from_status", _in("from_status", ORDER_STATUSES)),
    ("order_events", "ck_order_events_to_status", _in("to_status", ORDER_STATUSES)),
    ("order_quotations", "ck_order_quotations_amounts_non_negative",
     "printing_amount >= 0 AND binding_amount >= 0 AND cover_amount >= 0 AND delivery_fee >= 0 "
     "AND discount >= 0 AND total >= 0"),
    ("payments", "ck_payments_amount_positive", "amount > 0"),
    ("payments", "ck_payments_gatewaystatus", _in("status", ("created", "captured", "failed"))),
    ("print_rules", "ck_print_rules_colormode", _in("color", ("bw", "color"))),
    ("print_rules", "ck_print_rules_gsm_allowed", "gsm IN (70, 80, 100)"),
    ("print_rules", "ck_print_rules_page_range", "page_from >= 1 AND page_to >= page_from"),
    ("print_rules", "ck_print_rules_sided", _in("sided", ("single", "double"))),
    ("refunds", "ck_refunds_amount_positive", "amount > 0"),
    ("refunds", "ck_refunds_refundstatus", _in("status", ("requested", "approved", "rejected", "processed"))),
    ("refunds", "ck_refunds_shop_deduction_range", "shop_deduction >= 0 AND shop_deduction <= amount"),
]

# (table, column) foreign-key / filter columns that had no index.
INDEXES = [
    ("audit_logs", "actor_id"), ("audit_logs", "created_at"), ("batch_declines", "rider_id"),
    ("batch_orders", "shop_id"), ("batch_shop_arrivals", "shop_id"), ("complaints", "status"),
    ("custody_events", "actor_id"), ("custody_events", "batch_id"), ("delivery_batches", "settlement_id"),
    ("delivery_batches", "shop_id"), ("delivery_batches", "slot_id"), ("ledger_entries", "batch_id"),
    ("notifications", "order_id"), ("order_events", "actor_id"), ("order_rejections", "shop_id"),
    ("orders", "payment_status"), ("orders", "settlement_id"), ("orders", "slot_id"), ("payments", "status"),
    ("refunds", "complaint_id"), ("refunds", "decided_by"), ("refunds", "payment_id"),
    ("refunds", "shop_settlement_id"), ("refunds", "status"), ("rider_colleges", "college_id"),
    ("rider_profiles", "kyc_status"), ("shelf_photos", "uploaded_by"), ("shop_colleges", "college_id"),
    ("student_profiles", "college_id"), ("users", "role"),
]


def upgrade() -> None:
    # --- Identity & RBAC ------------------------------------------------------------------------
    roles = op.create_table(
        "roles",
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("name", name="pk_roles"),
    )
    op.bulk_insert(roles, [{"name": n, "description": d} for n, d in ROLES])
    op.create_foreign_key("fk_users_role_roles", "users", "roles", ["role"], ["name"])

    op.create_table(
        "admin_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_admin_profiles_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_admin_profiles"),
        sa.UniqueConstraint("email", name="uq_admin_profiles_email"),
        sa.UniqueConstraint("user_id", name="uq_admin_profiles_user_id"),
    )

    # --- Shop services --------------------------------------------------------------------------
    services = op.create_table(
        "services",
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.CheckConstraint("category IN ('print', 'binding')", name=op.f("ck_services_category")),
        sa.PrimaryKeyConstraint("code", name="pk_services"),
    )
    op.bulk_insert(services, [{"code": c, "category": k, "label": l} for c, k, l in SERVICES])
    op.create_table(
        "shop_services",
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("service_code", sa.String(30), nullable=False),
        sa.ForeignKeyConstraint(["service_code"], ["services.code"], name="fk_shop_services_service_code_services"),
        sa.ForeignKeyConstraint(["shop_id"], ["shop_profiles.id"], name="fk_shop_services_shop_id_shop_profiles"),
        sa.PrimaryKeyConstraint("shop_id", "service_code", name="pk_shop_services"),
    )
    op.create_index("ix_shop_services_service_code", "shop_services", ["service_code"])
    # Shops registered before services existed keep working: they are recorded as offering every service.
    op.execute("INSERT INTO shop_services (shop_id, service_code) SELECT s.id, v.code FROM shop_profiles s CROSS JOIN services v")

    # --- Complaints: resolution + multi-photo evidence --------------------------------------------
    op.create_table(
        "complaint_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("complaint_id", sa.Uuid(), nullable=False),
        sa.Column("storage_key", sa.String(400), nullable=False),
        sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("size_bytes IS NULL OR size_bytes > 0", name=op.f("ck_complaint_attachments_size_positive")),
        sa.ForeignKeyConstraint(["complaint_id"], ["complaints.id"], name="fk_complaint_attachments_complaint_id_complaints"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], name="fk_complaint_attachments_uploaded_by_users"),
        sa.PrimaryKeyConstraint("id", name="pk_complaint_attachments"),
        sa.UniqueConstraint("storage_key", name="uq_complaint_attachments_storage_key"),
    )
    op.create_index("ix_complaint_attachments_complaint_id", "complaint_attachments", ["complaint_id"])
    op.create_index("ix_complaint_attachments_uploaded_by", "complaint_attachments", ["uploaded_by"])
    op.execute("""
        INSERT INTO complaint_attachments (id, complaint_id, storage_key, content_type, size_bytes, uploaded_by, created_at)
        SELECT gen_random_uuid(), id, photo_key,
               CASE WHEN photo_key LIKE '%.png' THEN 'image/png' ELSE 'image/jpeg' END, NULL, student_id, created_at
        FROM complaints WHERE photo_key IS NOT NULL
    """)
    op.drop_column("complaints", "photo_key")
    op.add_column("complaints", sa.Column("resolved_by", sa.Uuid(), nullable=True))
    op.add_column("complaints", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_complaints_resolved_by_users", "complaints", "users", ["resolved_by"], ["id"])
    op.create_index("ix_complaints_resolved_by", "complaints", ["resolved_by"])

    # --- Order status history, rider availability --------------------------------------------------
    op.add_column("order_events", sa.Column("from_status", sa.String(30), nullable=True))
    op.add_column("order_events", sa.Column("to_status", sa.String(30), nullable=True))
    # Earlier status events stored the new status in `type`; backfill to_status for them.
    op.execute(f"UPDATE order_events SET to_status = type WHERE {_in('type', ORDER_STATUSES)}")
    op.add_column("rider_profiles", sa.Column("is_online", sa.Boolean(), server_default=sa.false(), nullable=False))

    # --- Integrity: composite keys, uniqueness, JSONB, indexes, CHECKs ------------------------------
    op.create_unique_constraint("uq_orders_id_student_id", "orders", ["id", "student_id"])
    op.create_foreign_key("fk_complaints_order_owner", "complaints", "orders",
                          ["order_id", "student_id"], ["id", "student_id"])
    op.create_unique_constraint("uq_payments_id_order_id", "payments", ["id", "order_id"])
    op.create_foreign_key("fk_refunds_payment_order", "refunds", "payments",
                          ["payment_id", "order_id"], ["id", "order_id"])
    op.create_unique_constraint("uq_order_rejections_order_id_shop_id", "order_rejections", ["order_id", "shop_id"])
    op.create_unique_constraint("uq_order_documents_storage_key", "order_documents", ["storage_key"])
    op.create_unique_constraint("uq_shelf_photos_storage_key", "shelf_photos", ["storage_key"])

    for table, column in (("audit_logs", "data"), ("order_quotations", "lines")):
        op.alter_column(table, column, type_=postgresql.JSONB(), postgresql_using=f"{column}::jsonb")

    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "read"])

    for table, name, condition in CHECKS:
        op.create_check_constraint(op.f(name), table, sa.text(condition))


def downgrade() -> None:
    for table, name, _ in reversed(CHECKS):
        op.drop_constraint(op.f(name), table, type_="check")
    op.drop_index("ix_notifications_user_unread", "notifications")
    for table, column in reversed(INDEXES):
        op.drop_index(f"ix_{table}_{column}", table)
    for table, column in (("audit_logs", "data"), ("order_quotations", "lines")):
        op.alter_column(table, column, type_=postgresql.JSON(), postgresql_using=f"{column}::json")

    op.drop_constraint("uq_shelf_photos_storage_key", "shelf_photos", type_="unique")
    op.drop_constraint("uq_order_documents_storage_key", "order_documents", type_="unique")
    op.drop_constraint("uq_order_rejections_order_id_shop_id", "order_rejections", type_="unique")
    op.drop_constraint("fk_refunds_payment_order", "refunds", type_="foreignkey")
    op.drop_constraint("uq_payments_id_order_id", "payments", type_="unique")
    op.drop_constraint("fk_complaints_order_owner", "complaints", type_="foreignkey")
    op.drop_constraint("uq_orders_id_student_id", "orders", type_="unique")

    op.drop_column("rider_profiles", "is_online")
    op.drop_column("order_events", "to_status")
    op.drop_column("order_events", "from_status")

    op.drop_index("ix_complaints_resolved_by", "complaints")
    op.drop_constraint("fk_complaints_resolved_by_users", "complaints", type_="foreignkey")
    op.drop_column("complaints", "resolved_at")
    op.drop_column("complaints", "resolved_by")
    op.add_column("complaints", sa.Column("photo_key", sa.String(300), nullable=True))
    op.execute("""
        UPDATE complaints c SET photo_key = (
            SELECT a.storage_key FROM complaint_attachments a WHERE a.complaint_id = c.id ORDER BY a.created_at LIMIT 1)
    """)
    op.drop_table("complaint_attachments")

    op.drop_table("shop_services")
    op.drop_table("services")
    op.drop_table("admin_profiles")
    op.drop_constraint("fk_users_role_roles", "users", type_="foreignkey")
    op.drop_table("roles")
