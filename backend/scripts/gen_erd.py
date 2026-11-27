"""Generates docs/database/ER_DIAGRAM.md (Mermaid) from the SQLAlchemy metadata. Run: python scripts/gen_erd.py"""
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from sqlalchemy import ForeignKeyConstraint, UniqueConstraint  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402

from app.db import models  # noqa: E402,F401
from app.db.session import Base  # noqa: E402

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
]
T = Base.metadata.tables
assert sorted(t for _, ts in MODULES for t in ts) == sorted(T), set(T) ^ {t for _, ts in MODULES for t in ts}
pg = postgresql.dialect()


def is_unique(table, cols) -> bool:
    cols = set(cols)
    if set(c.name for c in table.primary_key.columns) == cols:
        return True
    if len(cols) == 1 and table.columns[next(iter(cols))].unique:
        return True
    return any(isinstance(c, UniqueConstraint) and set(x.name for x in c.columns) == cols for c in table.constraints)


def relations(tables=None):
    out = []
    for t in T.values():
        for fk in t.constraints:
            if not isinstance(fk, ForeignKeyConstraint):
                continue
            parent = fk.referred_table.name
            if tables and t.name not in tables and parent not in tables:
                continue
            cols = [c.name for c in fk.columns]
            optional = any(c.nullable for c in fk.columns)
            left = "|o" if optional else "||"
            right = "o|" if is_unique(t, cols) else "o{"
            out.append(f"    {parent} {left}--{right} {t.name} : \"{', '.join(cols)}\"")
    return sorted(set(out))


def entity(t):
    fk_cols = {c.parent.name for c in t.foreign_keys}
    lines = [f"    {t.name} {{"]
    for c in t.columns:
        typ = c.type.compile(dialect=pg).split("(")[0].lower().replace("timestamp with time zone", "timestamptz").replace(" ", "_")
        keys = []
        if c.primary_key:
            keys.append("PK")
        if c.name in fk_cols:
            keys.append("FK")
        if c.unique or (not c.primary_key and is_unique(t, [c.name])):
            keys.append("UK")
        lines.append(f"        {typ} {c.name} {','.join(keys)}".rstrip())
    lines.append("    }")
    return lines


md = ["# UpLOAD ER Diagram", "",
      "Generated from the SQLAlchemy models (`backend/app/**/models.py`), which migration `0006` brings `upload_db` in line with.",
      "Regenerate after schema changes (see [MIGRATIONS.md](MIGRATIONS.md)). Notation: `||` exactly one, `|o` zero or one, "
      "`o{` zero or many, `o|` zero or one on the child side (one-to-one). PK primary key, FK foreign key, UK unique.", "",
      f"## Overview (all {len(T)} tables)", "", "```mermaid", "erDiagram", *relations(), "```", ""]
for title, tables in MODULES:
    md += [f"## {title}", "", "```mermaid", "erDiagram"]
    for name in tables:
        md += entity(T[name])
    md += [r for r in relations(set(tables)) if r.split()[0] in tables and r.split()[2] in tables]
    md += ["```", ""]
    outside = [r.strip() for r in relations(set(tables)) if not (r.split()[0] in tables and r.split()[2] in tables)]
    if outside:
        md += ["Links to other modules: " + "; ".join(f"`{r.split()[2]}.{r.split(':')[1].strip().strip(chr(34))}` → `{r.split()[0]}`"
                                                   for r in outside), ""]
(BACKEND.parent / "docs" / "database" / "ER_DIAGRAM.md").write_text("\n".join(md), encoding="utf-8")
print("written", len(md), "lines")
