from fastapi import APIRouter

from app.modules.admin import colleges, complaints, finance, ops, people, settlements

router = APIRouter()
for module in (ops, people, complaints, settlements, colleges, finance):
    router.include_router(module.router)
