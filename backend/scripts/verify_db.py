"""Verifies upload_db against the SQLAlchemy models (drift, CHECKs, FKs, FK indexes, types). Read-only.

Usage: python scripts/verify_db.py [row-count-snapshot.json]  (the snapshot is optional)
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from sqlalchemy import CheckConstraint, ForeignKeyConstraint, create_engine, inspect, text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db import models  # noqa: E402,F401
from app.db.session import Base  # noqa: E402

before = json.loads(pathlib.Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else {}
e = create_engine(get_settings().database_url)
ok = True
with e.connect() as c:
    insp = inspect(c)
    tables = sorted(insp.get_table_names())
    print("server:", c.execute(text("show server_version")).scalar(), "| db:", c.engine.url.database,
          "| user:", c.execute(text("select current_user")).scalar(), "| revision:",
          c.execute(text("select version_num from alembic_version")).scalar())
    app_tables = [t for t in tables if t != "alembic_version"]
    print(f"tables: {len(tables)} total, {len(app_tables)} application (models define {len(Base.metadata.tables)})")
    ok &= set(app_tables) == set(Base.metadata.tables)

    diff = compare_metadata(MigrationContext.configure(c, opts={"compare_type": True}), Base.metadata)
    print("model/DB drift operations:", len(diff))
    for d in diff:
        print("   ", d)
    ok &= not diff

    def db_names(kind):
        return {(r[0], r[1]) for r in c.execute(text(
            "select cl.relname, co.conname from pg_constraint co join pg_class cl on cl.oid = co.conrelid "
            "join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public' and co.contype = :k"), {"k": kind})}

    for label, kind, cls in (("CHECK", "c", CheckConstraint), ("FOREIGN KEY", "f", ForeignKeyConstraint)):
        model = {(t.name, str(k.name)) for t in Base.metadata.tables.values() for k in t.constraints if isinstance(k, cls)}
        db = db_names(kind)
        print(f"{label} constraints: DB {len(db)}, models {len(model)}, missing in DB {sorted(model - db) or 'none'}, "
              f"extra in DB {sorted(db - model) or 'none'}")
        ok &= model == db
    print("unique constraints:", len(db_names("u")), "| primary keys:", len(db_names("p")))
    idx = c.execute(text("select count(*) from pg_indexes where schemaname = 'public'")).scalar()
    print("indexes (incl. PK/unique):", idx)
    unindexed = c.execute(text("""
        select cl.relname, a.attname from pg_constraint co
        join pg_class cl on cl.oid = co.conrelid join pg_attribute a on a.attrelid = co.conrelid and a.attnum = co.conkey[1]
        where co.contype = 'f' and not exists (
            select 1 from pg_index i where i.indrelid = co.conrelid and i.indkey[0] = co.conkey[1])""")).all()
    print("foreign keys without a leading index:", unindexed or "none")
    ok &= not unindexed
    types = c.execute(text("""select table_name, column_name, data_type from information_schema.columns
        where table_schema = 'public' and (data_type in ('json', 'jsonb', 'timestamp without time zone', 'real', 'double precision')
        or column_name ~ '(amount|price|fee|total|deduction|entitlement|payout|percent|discount|bonus|guarantee)')""")).all()
    bad = [t for t in types if t[2] in ("json", "timestamp without time zone", "real", "double precision")]
    money = [t for t in types if t[2] == "numeric"]
    print(f"money columns NUMERIC: {len(money)} | JSONB columns: {[f'{t[0]}.{t[1]}' for t in types if t[2] == 'jsonb']} | "
          f"bad types (json / timestamp w/o tz / float): {bad or 'none'}")
    ok &= not bad
    print("roles:", [r[0] for r in c.execute(text("select name from roles order by name"))])
    print("services:", [r[0] for r in c.execute(text("select code from services order by code"))])
    if before:
        after = {t: c.execute(text(f'select count(*) from "{t}"')).scalar() for t in before if not t.startswith("_")}
        changed = {t: (before[t], after[t]) for t in after if before[t] != after[t]}
        print("pre-existing tables with changed row counts:", changed or "none")
        ok &= not changed
print("VERIFY:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
