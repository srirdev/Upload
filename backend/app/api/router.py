from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core import storage
from app.core.config import get_settings
from app.db.session import get_db
from app.api.ws import router as ws_router
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.colleges.router import router as colleges_router
from app.modules.delivery.router import router as delivery_router
from app.modules.notifications.router import router as notifications_router
from app.modules.orders.router import router as orders_router
from app.modules.payments.router import router as payments_router
from app.modules.riders.router import router as riders_router
from app.modules.shops.router import router as shops_router
from app.modules.students.router import router as students_router

api_router = APIRouter(prefix="/api/v1")
for r in (auth_router, students_router, colleges_router, orders_router, payments_router, notifications_router,
          shops_router, riders_router, delivery_router, admin_router, ws_router):
    api_router.include_router(r)

# Remaining module routers (finance) are included here as they are built.


@api_router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@api_router.get("/health/db", tags=["system"])
def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "up"}


if get_settings().storage_backend == "local" and get_settings().app_env == "development":

    @api_router.get("/dev-files/{key:path}", tags=["system"], include_in_schema=False)
    def dev_file(key: str):
        """DEVELOPMENT ONLY: serves files from local storage in place of S3 signed URLs."""
        path = storage.local_file(key)
        if not path:
            raise HTTPException(404, "File not found")
        return FileResponse(path)
