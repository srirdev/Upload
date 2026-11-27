import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.orders.enums import Binding, ColorMode, CoverColor, CoverTemplate, Orientation, OrderStatus, PaperSize, Sided
from app.modules.orders.schemas import RuleIO
from app.modules.shops.models import SettlementStatus, ShopStatus


class ShopRegisterIn(BaseModel):
    shop_name: str = Field(min_length=2, max_length=160)
    owner_name: str = Field(min_length=2, max_length=120)
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)
    area: str = Field(min_length=2, max_length=160)
    landmark: str | None = Field(default=None, max_length=160)
    upi_id: str | None = Field(default=None, pattern=r"^[\w.\-]{2,}@[A-Za-z]{2,}$")
    bank_account_name: str | None = Field(default=None, max_length=120)
    bank_account_number: str | None = Field(default=None, pattern=r"^\d{9,18}$")
    bank_ifsc: str | None = Field(default=None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    accept_terms: bool
    services: list[str] | None = Field(default=None, description="Service codes offered; omitted = all services")

    @model_validator(mode="after")
    def check(self):
        if not self.accept_terms:
            raise ValueError("You must accept the terms to register")
        bank = (self.bank_account_name, self.bank_account_number, self.bank_ifsc)
        if not self.upi_id and not all(bank):
            raise ValueError("Provide a UPI ID or complete bank details for payouts")
        return self


class ShopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    shop_name: str
    owner_name: str
    area: str
    landmark: str | None
    latitude: Decimal
    longitude: Decimal
    upi_id: str | None
    status: ShopStatus
    rejection_reason: str | None
    is_open: bool
    services: list[str] = []


class OpenIn(BaseModel):
    is_open: bool


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ShopDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    filename: str
    page_count: int | None
    copies: int
    paper_size: PaperSize
    orientation: Orientation = Orientation.auto
    rules: list[RuleIO]


class ShopOrderOut(BaseModel):
    id: uuid.UUID
    code: str
    status: OrderStatus
    college_name: str
    delivery_at: datetime | None
    documents: list[ShopDocOut]
    binding: Binding
    cover_page: bool
    subject_name: str | None
    subject_code: str | None
    # Cover design the student chose; the cover PDF endpoint renders exactly this.
    cover_template: CoverTemplate = CoverTemplate.classic
    cover_color: CoverColor = CoverColor.navy
    cover_title: str | None = None
    entitlement: Decimal | None
    next_action: str | None  # accept | printing_done | packing_done | handover_otp | complete_delivery | None
    can_direct_delivery: bool = False
    direct_batch_id: uuid.UUID | None = None  # set while the shop is delivering this order itself
    otp_generated: bool
    assigned_at: datetime | None


class OtpOut(BaseModel):
    code: str


class DashboardOut(BaseModel):
    is_open: bool
    orders_today: int
    new_orders: int
    pending_orders: int
    weekly_earnings: Decimal
    total_earnings: Decimal


class SettlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    period_start: date
    period_end: date
    order_count: int
    gross_amount: Decimal
    refund_deductions: Decimal
    net_amount: Decimal
    status: SettlementStatus
    upi_reference: str | None


class AccountingOut(BaseModel):
    unsettled_orders: int
    unsettled_amount: Decimal
    settlements: list[SettlementOut]


class ServicesIn(BaseModel):
    services: list[str] = Field(min_length=1)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    category: str
    label: str


class RateIO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    paper_size: PaperSize
    gsm: int
    color: ColorMode
    sided: Sided
    price_per_page: Decimal = Field(ge=0, le=1000, decimal_places=2)

    @field_validator("gsm")
    @classmethod
    def _gsm(cls, v: int) -> int:
        if v not in (70, 80, 100):
            raise ValueError("GSM must be 70, 80 or 100")
        return v


class BindingPriceIO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    binding: Binding
    price: Decimal = Field(ge=0, le=10000, decimal_places=2)

    @field_validator("binding")
    @classmethod
    def _not_none(cls, v: Binding) -> Binding:
        if v == Binding.none:
            raise ValueError("'none' has no price")
        return v


class RateCardIn(BaseModel):
    rates: list[RateIO] = Field(min_length=1, max_length=48)
    bindings: list[BindingPriceIO] = Field(default=[], max_length=4)


class RateCardOut(BaseModel):
    rates: list[RateIO]
    bindings: list[BindingPriceIO]
