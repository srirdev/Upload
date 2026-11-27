# UpLOAD — Campus Printing & Smart Delivery

Students upload documents, compare shop prices and pay; printing shops print, bind and pack; delivery partners batch packets to the college security cabin; an admin operations centre runs it all. One React app (four portals), one FastAPI backend, one PostgreSQL database.

Start here: `AGENTS.md` (conventions), `docs/FILE_INDEX.md` (file map), `docs/architecture/PROJECT_ARCHITECTURE.md`, `docs/api/API_OVERVIEW.md`, `docs/database/`.

## Quick start on Windows (no Docker)
Double-click **`start-dev.bat`** (or run it from `UPLOAD/`). It migrates and seeds the database, starts the API on :8000 and the website on :5173, and opens the browser.

- **Database**: the local PostgreSQL server (Windows service `postgresql-x64-19`, `localhost:5432`), database `upload_db`, role `upload_user` (owner, not superuser). Set `DATABASE_URL` in `.env` (see `.env.example`); never commit the password.
- **Files**: `STORAGE_BACKEND=local` (development only; the API refuses it elsewhere).
- **Admin**: set `ADMIN_MOBILE`, `ADMIN_NAME` (optional `ADMIN_EMAIL`) in `.env`, then `cd backend` and `.venv\Scripts\python -m app.modules.auth.cli` (it asks for the admin's password). Sign in at `/admin/login` with the mobile number or email and that password. There is no default admin account. To set or reset anyone's password: `.venv\Scripts\python -m app.modules.auth.cli set-password <mobile>`.
- **Demo accounts (development only)**: set `DEMO_PASSWORD` and the `DEMO_*` numbers/emails in `.env` (see `.env.example`), then `cd backend` and `.venv\Scripts\python -m app.modules.auth.demo`. It creates one ready-to-use account per portal (student with profile; shop approved, zoned and open; rider KYC-approved and online; admin). Each sign-in page then shows a **Use demo account** button. Refused unless `APP_ENV=development`; re-running repairs the accounts and resets their password.
- Run npm commands from `frontend/` (or from the root: `npm run dev`).

## Services
| Service | Command (from `backend/` unless noted) | Needed for |
|---|---|---|
| API | `.venv/Scripts/uvicorn app.main:app --reload --port 8000` | everything (REST + WebSocket `/api/v1/ws`) |
| Web | `cd frontend && npm run dev` (http://localhost:5173) | the four portals |
| Database | local PostgreSQL service | everything |
| Redis + MinIO (optional) | `docker compose up -d redis minio` (from the root) | ARQ worker; S3-style storage |
| Worker | `arq app.workers.settings.WorkerSettings` (Linux/WSL/Docker) | scheduled jobs |
| One job, no Redis | `.venv/Scripts/python -m app.workers.run <job>` or `all` | Windows / Task Scheduler |

Jobs: `release_expired_checkouts` (2 min), `convert_pending_documents` (1 min), `process_slot_cutoffs` (5 min), `collection_reminders` (30 min), `prepare_settlements` (daily), `cleanup_abandoned_drafts` (daily). All are idempotent.
DOCX/PPTX → PDF previews need LibreOffice (`SOFFICE_PATH` or `soffice` on PATH); without it documents stay "pending conversion" and the student's page count is used.

Setting up from scratch: create the PostgreSQL role and database (see `docs/database/MIGRATIONS.md`), copy `.env.example` to `.env`, then `python -m venv .venv && .venv/Scripts/pip install -r requirements.txt`, `.venv/Scripts/python -m alembic upgrade head`, `.venv/Scripts/python scripts/verify_db.py`, and `cd frontend && npm install`.

API docs: http://localhost:8000/docs · MinIO console: http://localhost:9001

## First run
1. Seed **placeholder** standard prices and a **dev-only** sample college (opt-in): `.venv/Scripts/python -m app.modules.finance.seed --sample-college`.
2. Create the admin (above) and sign in at `/admin/login`.
3. Shops and riders self-register at `/shop/login` and `/rider/login`; approve them in the admin portal and assign colleges. Shops set their services and **own rate card** (starts from the standard prices); riders switch **Online** to receive runs.
4. Students sign in at `/student/login`, upload, compare shop prices (or take the standard price) and pay.

## Notes
- Sign-in is mobile number or email + password (no OTP/SMS). There is no self-service "forgot password" yet: an operator resets it with the `set-password` command above.
- Payments: set `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` (test keys) in `.env`; without them checkout returns 503 (never mocked).
- Outside development `SECRET_KEY` must be 32+ random characters or the API refuses to start.

## Tests
`cd backend && .venv/Scripts/pytest` (in-memory SQLite with foreign keys enforced and fake storage/Razorpay; never touches `upload_db`) and `cd frontend && npm test` / `npm run typecheck`.

## Before going live
- **Review the economics.** The seeded prices are placeholders; with them a single-packet run *loses* money (rider minimum guarantee > delivery fee + commission). Set real values in Admin → Finance.
- Razorpay live keys + webhook secret (webhook → `/api/v1/payments/webhook`). Gateway fees in the ledger are an *estimate* (`gateway_fee_percent`); reconcile with Razorpay reports.
- Payouts: Razorpay Checkout.js doesn't split marketplace payments. Apply for **Razorpay Route** (needs account approval) or keep the built-in manual settlement workflow (prepared settlements → pay → record UPI reference). Refunds are also recorded manually (no automatic Razorpay refund call).
- Production `SECRET_KEY`, HTTPS, `CORS_ORIGINS`, a private S3/R2 bucket, Redis + the ARQ worker, LibreOffice on the worker host.
- Realtime runs in-process: keep one API process, or add Redis pub/sub before scaling out.
- The pytest suite runs on SQLite; migrations and jobs were verified on PostgreSQL. Run the suite against a PostgreSQL test database before launch.
