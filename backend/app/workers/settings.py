"""ARQ worker: runs app/workers/jobs.py on a schedule. Needs Redis (REDIS_URL).

    arq app.workers.settings.WorkerSettings

arq is POSIX-oriented; on Windows run the worker under WSL/Docker, or run single jobs with
`python -m app.workers.run <job>` (e.g. from Task Scheduler).
"""
import asyncio

from arq import cron
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.workers.jobs import JOBS


def _task(name: str):
    async def run(ctx) -> object:
        def work():
            with SessionLocal() as db:
                return JOBS[name](db)

        return await asyncio.to_thread(work)  # jobs use the sync SQLAlchemy session

    run.__name__ = name
    return run


async def ping(ctx) -> str:
    return "pong"


TASKS = {name: _task(name) for name in JOBS}


class WorkerSettings:
    functions = [ping, *TASKS.values()]
    cron_jobs = [
        cron(TASKS["release_expired_checkouts"], minute=set(range(0, 60, 2))),
        cron(TASKS["convert_pending_documents"], minute=set(range(60)), unique=True),
        cron(TASKS["process_slot_cutoffs"], minute=set(range(0, 60, 5))),
        cron(TASKS["collection_reminders"], minute={7, 37}),
        cron(TASKS["prepare_settlements"], hour={1}, minute={15}),  # 01:15 server time, daily (idempotent)
        cron(TASKS["cleanup_abandoned_drafts"], hour={3}, minute={30}),
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
