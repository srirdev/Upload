"""Run one background job now, without Redis:  python -m app.workers.run <job>   (or `all`)."""
import json
import sys

from app.db.session import SessionLocal
from app.workers.jobs import JOBS


def main() -> None:
    names = list(JOBS) if sys.argv[1:] == ["all"] else sys.argv[1:]
    if not names or any(n not in JOBS for n in names):
        sys.exit(f"usage: python -m app.workers.run <{'|'.join(JOBS)}|all>")
    for name in names:
        with SessionLocal() as db:
            print(name, json.dumps(JOBS[name](db), default=str))


if __name__ == "__main__":
    main()
