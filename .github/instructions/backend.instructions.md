---
applyTo: "backend/**"
---
- Modules in `app/modules/<name>` (models, schemas, service, router). Register routers in `app/api/router.py`, models in `app/db/models.py`.
- Sync SQLAlchemy 2.0 sessions via `get_db`; Alembic for all schema changes; transactions for money/order operations.
- Pydantic v2 schemas, UUID PKs, immutable events/ledger rows, audit logging, ownership + role checks on every route.
