import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.delivery.models import BatchMode, BatchStatus
from app.modules.riders.models import KycStatus, RiderSettlementStatus


class RiderRegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    base_area: str = Field(min_length=2, max_length=160)
    vehicle_number: str = Field(pattern=r"^[A-Za-z]{2}[ -]?\d{1,2}[ -]?[A-Za-z]{0,3}[ -]?\d{1,4}$")
    upi_id: str = Field(pattern=r"^[\w.\-]{2,}@[A-Za-z]{2,}$")


class RiderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    base_area: str
    vehicle_number: str
    upi_id: str
    kyc_status: KycStatus
    kyc_note: str | None
    has_dl: bool = False
    has_rc: bool = False
    is_online: bool = False


class AvailabilityIn(BaseModel):
    is_online: bool


class PickupIn(BaseModel):
    order_id: uuid.UUID
    code: str = Field(pattern=r"^\d{4}$")


class ArriveIn(BaseModel):
    shop_id: uuid.UUID


class RunOrder(BaseModel):
    order_id: uuid.UUID
    code: str
    status: str  # pending | picked_up | skipped
    packed: bool
    code_ready: bool


class RunShop(BaseModel):
    shop_id: uuid.UUID
    shop_name: str
    area: str
    landmark: str | None
    maps_url: str | None
    latitude: float | None = None  # for the rider's route map
    longitude: float | None = None
    arrived_at: datetime | None
    not_ready_available_at: datetime | None
    can_mark_not_ready: bool
    orders: list[RunOrder]


class RunCollege(BaseModel):
    name: str
    security_cabin: str
    drop_instructions: str | None
    maps_url: str | None
    latitude: float | None = None
    longitude: float | None = None


class RunSlot(BaseModel):
    label: str
    delivery_at: datetime


class RunOut(BaseModel):
    id: uuid.UUID
    code: str
    mode: BatchMode
    status: BatchStatus
    college: RunCollege
    slot: RunSlot
    shop_count: int
    packet_count: int
    route_distance_km: Decimal | None
    guaranteed_payout: Decimal
    shops: list[RunShop]
    can_depart: bool
    can_close_empty: bool
    shelf_photo_count: int


class HistoryItem(BaseModel):
    id: uuid.UUID
    code: str
    completed_at: datetime | None
    status: BatchStatus
    packet_count: int
    payout: Decimal | None
    shelf_photo_url: str | None
    settled: bool


class PayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    period_start: date
    period_end: date
    batch_count: int
    amount: Decimal
    status: RiderSettlementStatus
    upi_reference: str | None


class LastTrip(BaseModel):
    base_fee: Decimal | None
    extra_shop_fees: Decimal | None
    packet_bonus: Decimal | None
    total: Decimal | None


class EarningsOut(BaseModel):
    today: Decimal
    this_week: Decimal
    unsettled: Decimal
    last_trip: LastTrip | None
    payouts: list[PayoutOut]


class NotReadyOut(BaseModel):
    skipped: list[str]  # order codes
