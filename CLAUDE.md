# CLAUDE.md

Read `AGENTS.md` first: it holds the working rules for this repo (they apply to Claude as well). Then:

- `docs/FILE_INDEX.md`: where each feature lives (search the owning module first).
- `docs/architecture/PROJECT_ARCHITECTURE.md`: how the pieces fit.
- `docs/api/API_OVERVIEW.md`: every endpoint (regenerate: `cd backend && .venv/Scripts/python scripts/gen_api_docs.py`).
- `docs/database/`: schema, ER diagram, data dictionary, migration workflow.

Quick commands (Windows, from the repo root):
- Backend tests: `cd backend && .venv/Scripts/pytest`
- Frontend tests: `cd frontend && npm test` · typecheck `npm run typecheck`
- Migrate + verify: `cd backend && .venv/Scripts/python -m alembic upgrade head && .venv/Scripts/python scripts/verify_db.py`
- Run a background job once: `cd backend && .venv/Scripts/python -m app.workers.run <job|all>`

Never print or commit `.env` values (the database password lives only there). Don't run bare `python` on this machine: it starts the Windows Python install manager. Use `backend/.venv/Scripts/python`.
