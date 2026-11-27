# UpLOAD — Agent Guide

Campus printing + delivery platform. One React app (`frontend/`), one FastAPI backend (`backend/`).
Mobile apps (`mobile/`) are reserved; do NOT build them yet.

## Working rules
1. Read this file, README.md and `docs/FILE_INDEX.md` first; search the owning module before global searching.
2. Use exact paths and targeted searches. Never scan `node_modules`, `dist`, `.venv`, `__pycache__`, `Python/`.
3. Reuse existing code; no duplicate services, models, APIs or components. No new dependencies without need.
4. All business rules (pricing, commission, state transitions, payments) live in FastAPI, never in the frontend.
5. Money = `NUMERIC` + Python `Decimal`. Commission/delivery prices come from admin settings, never hardcoded.
6. Never trust client prices or payment success; verify Razorpay signatures/webhooks on the backend.
7. Never expose `.env` secrets. Mocks must be clearly labelled dev-only; never present a mock as a real integration.
8. Update `docs/FILE_INDEX.md` when modules or ownership change. Keep docs concise.

## Phases
All seven phases are built (foundation, design system + auth, student, shop, rider, admin, integration testing). Remaining work is hardening for launch (see README "Before going live"). Keep adding features module-by-module and keep the test suites green.

## Testing
Backend: `cd backend && .venv/Scripts/pytest` (SQLite + in-memory fakes for storage/Razorpay). Frontend: `cd frontend && npm test`. Money, permissions, state transitions and payouts each have dedicated tests; extend them with any change.

## UI
Vibrant, premium consumer-tech (quick-commerce energy), not a plain dashboard. Follow `docs/DESIGN_SYSTEM.md`: tokens in `frontend/src/styles/index.css`, shared kit in `frontend/src/shared/components/`. Real API data only; every loading, empty and error state is designed.
