from decimal import Decimal

from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import assert_safe_config, get_settings

# Money must never travel as a float: serialise every Decimal as an exact string, like the typed schemas do.
ENCODERS_BY_TYPE[Decimal] = str

settings = get_settings()
assert_safe_config(settings)

app = FastAPI(title="UpLOAD API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
