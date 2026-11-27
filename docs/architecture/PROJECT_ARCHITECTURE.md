# UpLOAD Architecture

Campus printing marketplace + smart delivery: students upload and pay, shops print/bind/pack, delivery partners batch packets from several shops to the college security cabin, an admin operations centre runs everything.

```
 Browser (one React app, 4 portals)          FastAPI (one backend, /api/v1)              PostgreSQL (upload_db)
 /student  /shop  /rider  /admin   ── REST ──▶  routers → services (business rules) ── SQLAlchemy ──▶ 43 tables
        ▲                          ◀─ WebSocket ─ realtime hub (events after commit)           │
        │ signed URLs (5 min)                   │                                            │
        └──────────── private object storage ◀──┘ documents, KYC, shelf photos (MinIO/S3/R2; local in dev)
                                                 ▲
                         ARQ worker (Redis) ─────┘ scheduled jobs: checkout expiry, slot cut-offs, reminders,
                                                    draft cleanup, settlement preparation, DOCX/PPTX → PDF
 Razorpay Checkout.js ── payment ──▶ /payments/verify (HMAC) + /payments/webhook (HMAC, idempotent)
```

## Principles
- **Backend owns every rule**: prices, commission, eligibility, state transitions, payouts. The frontend only displays and submits.
- **PostgreSQL is the source of truth**: money is `NUMERIC` + `Decimal`; statuses are independent per concern (order, payment, delivery, refund, complaint, settlement); history tables (`order_events`, `custody_events`, `ledger_entries`, `audit_logs`) are append-only. See `docs/database/`.
- **No fake integrations**: without Razorpay keys checkout returns 503; without LibreOffice documents stay "pending conversion"; without Redis the scheduler doesn't run (jobs can be run by hand).
- **APIs are frontend-independent**: the future student/rider mobile apps reuse the same REST + WebSocket API.

## Backend (`backend/app`)
| Layer | Location | Notes |
|---|---|---|
| App + routing | `main.py`, `api/router.py`, `api/ws.py` | `/api/v1/*`, `/api/v1/ws` |
| Config & infra | `core/config.py` (env), `core/security.py` (JWT, hashing), `core/storage.py` (S3/local), `core/realtime.py` (event hub) | Settings only from `.env` |
| Data | `db/session.py` (engine, naming convention), `db/types.py`, `db/models.py` | Alembic in `alembic/` |
| Modules | `modules/<area>/{models,schemas,service,router}.py` | auth, students, colleges, orders, payments, shops, riders, delivery, finance, notifications, admin |
| Jobs | `workers/jobs.py`, `workers/settings.py` (ARQ cron), `workers/run.py` (run once) | Idempotent |

Request flow: router (auth + role dependency, input validation) → service (rules, one transaction, `commit`) → realtime events published after commit → response schema.

**Auth/RBAC**: mobile number or email + password (scrypt hashes; 5 wrong passwords lock the account for 15 min; students, shops and riders self-register, admins via the CLI) → 30-min JWT access token + rotating refresh token. `require_roles(...)` checks the role from the database; ownership checks return 404 for other users' records.

**Order lifecycle**: draft → awaiting_payment → placed → accepted → printing → packing → handover_verified → out_for_delivery → delivered → collected (or cancelled/rejected). Only services change status (`orders.service.set_status`), each change recorded with from/to, actor and time.

**Pricing**: each shop has its own rate card; the student compares eligible shops (open, approved, serving the college, offering every needed service, priced for every option) or takes the admin's standard price. The quotation is locked at checkout; commission and shop entitlement are split from what was actually paid.

**Payments**: backend quote → Razorpay order → Checkout.js → signature verify and webhook (both HMAC-checked, idempotent) → order placed → ledger postings → shop assignment. Late or superseded payments create refund records automatically.

**Settlements**: Razorpay Checkout.js does not split marketplace payouts. Razorpay Route can, but needs account eligibility and approval, which hasn't been verified. Until then UpLOAD uses a controlled **manual settlement** workflow: weekly shop and twice-weekly rider settlements are prepared (job or admin), paid outside the system, and recorded with a UPI reference; every amount reconciles against `ledger_entries`.

**Delivery**: accepted orders join a batch per college + slot + date; the batch is offered to online riders serving that college (primary, then backup). Pickup needs the shop's 4-digit handover OTP; the 4-minute no-wait rule skips unready packets to the next slot; completion requires a stored shelf photo; students then collect (no OTP). Shops can also deliver directly.

## Frontend (`frontend/src`)
One Vite + React + TypeScript app: `app/` (providers, router, shells), `modules/{student,shop,rider,admin}` (pages, features, components, typed `api/` hooks on TanStack Query), `shared/` (API client with token refresh, auth store in Zustand, UI components on shadcn/ui, realtime hook), `styles/index.css` (design tokens). Forms use React Hook Form + Zod; installable as a PWA.

## Environments
| | Development (this machine) | Production |
|---|---|---|
| Database | Local PostgreSQL 19 (`localhost:5432/upload_db`) | Managed PostgreSQL 16+ with backups |
| Files | `STORAGE_BACKEND=local` (dev only) or MinIO | Private S3/R2 bucket |
| Jobs | `python -m app.workers.run <job>`; ARQ needs Redis (WSL/Docker) | ARQ worker + Redis |
| Realtime | In-process hub (single API process) | Single process, or add Redis pub/sub before scaling out |
