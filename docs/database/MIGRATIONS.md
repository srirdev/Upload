# Database Migrations

Alembic manages every schema change to `upload_db`. Never change the schema by hand (pgAdmin, ad-hoc SQL): it would drift from the models and the migration history.

- Config: `backend/alembic.ini`, `backend/alembic/env.py` (reads `DATABASE_URL` from `.env`; imports every model via `app/db/models.py`).
- Migrations: `backend/alembic/versions/`.
- Naming convention (`app/db/session.py`): `pk_<table>`, `fk_<table>_<column>_<ref table>`, `uq_<table>_<column>`, `ix_<table>_<column>`, `ck_<table>_<name>`.

## History

| Revision | Summary |
|---|---|
| `0001` | Auth: `users`, `otp_codes`, `refresh_tokens` |
| `0002` | Students, colleges, slots, pricing config (`platform_config`, `rate_cards`, `binding_prices`), coupons, orders, documents, print rules, quotations, events, payments, webhook events, refunds, complaints, notifications |
| `0003` | Shops, shop colleges, order assignment + commission split, rejections, handover OTPs, shop settlements |
| `0004` | Riders, zones, delivery batches, batch orders, arrivals, declines, custody events, shelf photos, rider settlements; college coordinates; rider payout, gateway-fee and late-refund settings |
| `0005` | Ledger, audit logs; refund ↔ complaint link, shop deductions, refund decisions |
| `0006` | Schema hardening: `roles` (RBAC, FK from `users.role`), `admin_profiles`, `services` + `shop_services`, `complaint_attachments` (moves `complaints.photo_key`), complaint `resolved_by/at`, `order_events.from_status/to_status`, `rider_profiles.is_online`, JSON → JSONB, 35 new indexes (every FK now indexed), composite FKs, 58 CHECK constraints (enums, money, ranges) |
| `0007` | Shop price comparison: `shop_rate_cards`, `shop_binding_prices` (existing shops seeded from the standard prices), `orders.chosen_shop_id`; DOCX/PPTX conversion: `order_documents.conversion_status`, `preview_key` |
| `0008` | Password login replaces OTP login: `users.email` (unique), `password_hash`, `failed_logins`, `locked_until`; admin emails copied to `users.email`; drops `otp_codes`. Existing users need `python -m app.modules.auth.cli set-password <mobile>` |
| `0009` | Print Preview Studio: `order_documents.orientation`; cover design on `orders` (`cover_template`, `cover_color`, `cover_title`). Defaults keep existing orders unchanged; none affect the price |
| `0010` | Auth: `users.full_name`; `password_reset_tokens` (single-use, expiring, HMAC only); `login_audit_logs` (sign-in attempts and password events, per-IP throttling). Passwords hashed with Argon2id (scrypt upgraded on sign-in) |

## Everyday commands (from `backend/`)

```bash
.venv/Scripts/python -m alembic current            # revision the database is on
.venv/Scripts/python -m alembic history            # all revisions
.venv/Scripts/python -m alembic upgrade head       # apply pending migrations
.venv/Scripts/python -m alembic upgrade head --sql # print the SQL without running it (review first)
.venv/Scripts/python scripts/verify_db.py          # schema == models? CHECKs, FKs, FK indexes, types
```

`start-dev.bat` runs `alembic upgrade head` on every start.

## Creating a migration

1. Change the SQLAlchemy model(s). Money: `Numeric` + `Decimal`; timestamps: `DateTime(timezone=True)`; enums: `enum_col(...)` (adds a CHECK); add `index=True` to every FK.
2. Generate a draft: `.venv/Scripts/python -m alembic revision --autogenerate --rev-id 0007 -m "short description"`.
3. **Review and complete it by hand.** Autogenerate does not cover:
   - CHECK constraints on existing tables (enum values, ranges): add `op.create_check_constraint(op.f("ck_<table>_<name>"), ...)`. Wrap already-final names in `op.f()`, otherwise the naming convention is applied twice.
   - Data migrations (moving/backfilling data) and seed rows for reference tables (`op.bulk_insert`).
   - New NOT NULL columns on tables with rows: give a `server_default` or backfill first.
   - Type changes needing a cast (`postgresql_using=...`).
4. Write a real `downgrade()`.
5. Check the SQL: `alembic upgrade head --sql`.
6. Apply: `alembic upgrade head`. PostgreSQL runs the migration in one transaction, so a failure (for example an existing row violating a new CHECK) leaves the database untouched.
7. Verify: `python scripts/verify_db.py` must print `VERIFY: PASS`.
8. Regenerate docs: `python scripts/gen_erd.py` and `python scripts/gen_dictionary.py`; update `DATABASE_SCHEMA.md` and the table above.
9. Run tests: `.venv/Scripts/pytest` (the suite builds the schema from the models with foreign keys enforced).

## Rules

- Never edit a migration that has been applied to a shared or production database; add a new one instead.
- Never `DROP` a table or column holding data without first migrating that data and getting sign-off.
- Back up before applying to production: `pg_dump -Fc -h <host> -U <user> upload_db > upload_db-<date>.dump`.
- Reference data (roles, services) is inserted by migrations; business data (colleges, prices) by admins or the opt-in seed `python -m app.modules.finance.seed`. Never insert test orders or financial records into a real database.
- Credentials come only from `.env` (`DATABASE_URL`); never commit them.
