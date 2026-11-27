"""Generates docs/database/DATA_DICTIONARY.md from the live upload_db catalogue (read-only).

Run after every migration: python scripts/gen_dictionary.py
"""
import pathlib
import sys
from collections import defaultdict

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import get_settings  # noqa: E402

PURPOSE = {
    "roles": "RBAC role catalogue referenced by users.role (reference data).",
    "users": "Login identity: one account per mobile number (optional unique email) with exactly one role and a hashed password.",
    "refresh_tokens": "Hashed, rotating refresh tokens (revoked on rotation/logout).",
    "password_reset_tokens": "Emailed password reset links: token HMAC, 30-minute expiry, single use.",
    "login_audit_logs": "Every sign-in attempt and password event, with IP and user agent (per-IP throttling).",
    "student_profiles": "Student details used on orders, cover pages and packet labels.",
    "shop_profiles": "Printing shop registration, location, payout details and approval/open state.",
    "rider_profiles": "Delivery partner details, KYC documents (storage keys), KYC status and availability.",
    "admin_profiles": "Administrator details (created only by the bootstrap command).",
    "colleges": "Colleges served, with security-cabin drop and collection instructions.",
    "college_slots": "Recurring daily delivery slots per college (time, cut-off, capacity).",
    "shop_colleges": "Which colleges each shop serves (admin-assigned).",
    "rider_colleges": "Which colleges each rider serves, as primary or backup.",
    "services": "Catalogue of printing and binding services (reference data).",
    "shop_services": "Services each shop offers; used to match orders to capable shops.",
    "shop_rate_cards": "A shop's own customer price per printed page; students compare shops on these.",
    "shop_binding_prices": "A shop's own customer price per bound copy.",
    "rate_cards": "Standard customer price per printed page (admin-set): used when a student does not pick a shop, and as the starting rate card for new shops.",
    "binding_prices": "Standard customer price per bound copy (admin-set); starting binding prices for new shops.",
    "orders": "A student's print order: production status, payment status, delivery slot, shop and commission split.",
    "order_documents": "Uploaded document metadata; the file is in private object storage.",
    "print_rules": "Page-range print settings (colour, GSM, sides) for a document.",
    "order_quotations": "Immutable price snapshot taken at checkout; the payment amount derives from it.",
    "order_events": "Append-only order history with from/to status, actor and note.",
    "order_rejections": "Shops that declined an order (never re-offered to them).",
    "payments": "Razorpay payment attempts; captured only after signature/webhook verification.",
    "webhook_events": "Processed payment webhook ids (idempotency).",
    "coupons": "Discount codes: a percentage or a flat amount, never both.",
    "refunds": "Refund requests and decisions, optionally recovering an amount from the shop.",
    "delivery_batches": "A delivery run per college, slot and date (rider-consolidated or shop-direct).",
    "batch_orders": "Orders in a batch with their pickup status.",
    "batch_shop_arrivals": "When the rider arrived at each shop (starts the no-wait timer).",
    "batch_declines": "Riders who declined a batch offer.",
    "handover_otps": "Hashed 4-digit shop-to-rider handover code per order.",
    "custody_events": "Append-only chain of custody for each packet.",
    "shelf_photos": "Security-cabin shelf photo proofs (storage keys) per batch.",
    "complaints": "Student complaints, admin response and resolution.",
    "complaint_attachments": "Complaint evidence photo metadata; files are in private object storage.",
    "ledger_entries": "Append-only financial ledger; `ref` makes every posting idempotent.",
    "settlements": "Weekly shop payouts.",
    "rider_settlements": "Twice-weekly rider payouts.",
    "notifications": "In-app notifications per user.",
    "platform_config": "Single-row admin settings: fees, commission, limits and payout rules.",
    "audit_logs": "Who changed what, for admin and financial actions.",
    "alembic_version": "Alembic migration bookkeeping (current revision).",
}
MODULES = [
    ("1. Users & authentication", ["roles", "users", "refresh_tokens", "password_reset_tokens", "login_audit_logs"]),
    ("2. Profiles", ["student_profiles", "shop_profiles", "rider_profiles", "admin_profiles"]),
    ("3. Colleges & delivery slots", ["colleges", "college_slots", "shop_colleges", "rider_colleges"]),
    ("4. Shops, services & rate cards", ["services", "shop_services", "shop_rate_cards", "shop_binding_prices", "rate_cards", "binding_prices"]),
    ("5. Documents, orders & print customisation",
     ["orders", "order_documents", "print_rules", "order_quotations", "order_events", "order_rejections"]),
    ("6. Payments, coupons & refunds", ["payments", "webhook_events", "coupons", "refunds"]),
    ("7. Delivery batches, pickup OTPs & custody",
     ["delivery_batches", "batch_orders", "batch_shop_arrivals", "batch_declines", "handover_otps", "custody_events"]),
    ("8. Shelf photo proofs & collection", ["shelf_photos"]),
    ("9. Complaints & resolutions", ["complaints", "complaint_attachments"]),
    ("10. Ledger & settlements", ["ledger_entries", "settlements", "rider_settlements"]),
    ("11. Notifications", ["notifications"]),
    ("12. Admin settings & audit", ["platform_config", "audit_logs"]),
    ("Migration bookkeeping", ["alembic_version"]),
]

e = create_engine(get_settings().database_url)
with e.connect() as c:
    version = c.execute(text("show server_version")).scalar()
    revision = c.execute(text("select version_num from alembic_version")).scalar()
    cols = defaultdict(list)
    for r in c.execute(text("""
        select c.relname, a.attname, format_type(a.atttypid, a.atttypmod), not a.attnotnull,
               pg_get_expr(d.adbin, d.adrelid)
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        order by c.relname, a.attnum""")):
        cols[r[0]].append(r[1:])
    cons = defaultdict(list)
    for r in c.execute(text("""
        select cl.relname, co.contype, co.conname, pg_get_constraintdef(co.oid),
               array(select a.attname from unnest(co.conkey) k join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k)
        from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' order by cl.relname, co.contype, co.conname""")):
        cons[r[0]].append(r[1:])
    idx = defaultdict(list)
    for r in c.execute(text("""
        select i.tablename, i.indexname, i.indexdef from pg_indexes i
        where i.schemaname = 'public' and not exists (
            select 1 from pg_constraint co where co.conname = i.indexname) order by 1, 2""")):
        idx[r[0]].append(r[1:])
    referenced_by = defaultdict(list)
    for t, items in cons.items():
        for kind, name, definition, columns in items:
            if kind == "f":
                target = definition.split("REFERENCES ")[1].split("(")[0]
                referenced_by[target].append(f"{t}({', '.join(columns)})")

import re


def tidy(sql: str) -> str:
    """Readable CHECK text: `col IN ('a', 'b')` instead of PostgreSQL's ANY(ARRAY[...]) rendering."""
    sql = re.sub(r"\(\((\w+)\)::text = ANY \(\(ARRAY\[(.*?)\]\)::text\[\]\)\)",
                 lambda m: f"{m[1]} IN ({m[2].replace('::character varying', '')})", sql)
    sql = re.sub(r"\((-?\d+)\)::numeric", lambda m: m[1], sql)
    while sql.startswith("(") and sql.endswith(")") and sql.count("(") == sql.count(")"):
        inner = sql[1:-1]
        depth = 0
        if any((depth := depth + (ch == "(") - (ch == ")")) < 0 for ch in inner):
            break
        sql = inner
    return sql


def short(typ: str) -> str:
    return typ.replace("character varying", "varchar").replace("timestamp with time zone", "timestamptz")


assert sorted(t for _, ts in MODULES for t in ts) == sorted(cols), set(cols) ^ {t for _, ts in MODULES for t in ts}

md = ["# UpLOAD Data Dictionary", "",
      f"Generated from the live database catalogue (PostgreSQL {version}, `upload_db`, Alembic revision `{revision}`).",
      "Regenerate after every migration (see [MIGRATIONS.md](MIGRATIONS.md)). Design notes: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md); "
      "relationships: [ER_DIAGRAM.md](ER_DIAGRAM.md).", "",
      "Key: **PK** primary key, **FK** foreign key, **UK** unique. `Null` = nullable. Defaults written as `now()` are set by "
      "PostgreSQL; other defaults (UUIDs, statuses) are applied by the application when inserting.", ""]
for title, tables in MODULES:
    md += [f"## {title}", ""]
    for t in tables:
        tc = cons[t]
        pk = {col for k, _, _, cs in tc if k == "p" for col in cs}
        fk = {cs[0]: d.split("REFERENCES ")[1] for k, _, d, cs in tc if k == "f" and len(cs) == 1}
        uk = {cs[0] for k, _, _, cs in tc if k == "u" and len(cs) == 1}
        md += [f"### `{t}`", "", PURPOSE[t], "", "| Column | Type | Null | Default | Keys |", "|---|---|---|---|---|"]
        for name, typ, nullable, default in cols[t]:
            keys = [k for k, ok in (("PK", name in pk), ("UK", name in uk)) if ok]
            if name in fk:
                keys.append(f"FK → `{fk[name]}`")
            md.append(f"| `{name}` | {short(typ)} | {'yes' if nullable else 'no'} | {f'`{default}`' if default else ''} | {', '.join(keys)} |")
        extra = []
        for k, name, d, cs in tc:
            if k == "u" and len(cs) > 1:
                extra.append(f"- Unique `{name}`: ({', '.join(cs)})")
            if k == "f" and len(cs) > 1:
                extra.append(f"- Composite FK `{name}`: {d}")
            if k == "c":
                extra.append(f"- Check `{name}`: `{tidy(d.removeprefix('CHECK '))}`")
        for name, d in idx[t]:
            extra.append(f"- Index `{name}`: {d.split(' USING ')[1]}")
        if referenced_by[t]:
            extra.append(f"- Referenced by: {', '.join(sorted(referenced_by[t]))}")
        md += ["", *extra, ""]
(BACKEND.parent / "docs" / "database" / "DATA_DICTIONARY.md").write_text("\n".join(md), encoding="utf-8")
print("written", len(md), "lines;", len(cols), "tables")
