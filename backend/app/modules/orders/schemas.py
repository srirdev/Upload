import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.orders.enums import (
    Binding, ColorMode, ConversionStatus, CoverColor, CoverTemplate, Orientation, OrderStatus, PaperSize, PaymentStatus, Sided,
)


class RuleIO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    page_from: int = Field(ge=1)
    page_to: int = Field(ge=1)
    color: ColorMode
    gsm: Literal[70, 80, 100]
    sided: Sided


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    page_count: int | None
    page_count_auto: bool
    conversion_status: ConversionStatus = ConversionStatus.not_needed
    has_preview: bool = False
    copies: int
    paper_size: PaperSize
    orientation: Orientation = Orientation.auto
    rules: list[RuleIO]


class DocConfigIn(BaseModel):
    copies: int = Field(ge=1, le=100)
    paper_size: PaperSize
    orientation: Orientation = Orientation.auto  # optional for older clients; doesn't affect price
    page_count: int | None = Field(default=None, ge=1, le=5000)  # only honoured when not auto-detected
    rules: list[RuleIO] = Field(min_length=1, max_length=50)


class BindingIn(BaseModel):
    binding: Binding
    cover_page: bool = False
    subject_name: str | None = Field(default=None, max_length=120)
    subject_code: str | None = Field(default=None, max_length=40)
    # Cover design (optional for older clients; doesn't affect price)
    cover_template: CoverTemplate = CoverTemplate.classic
    cover_color: CoverColor = CoverColor.navy
    cover_title: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def cover_needs_subject(self):
        if self.cover_page and not (self.subject_name and self.subject_name.strip() and self.subject_code and self.subject_code.strip()):
            raise ValueError("Subject name and code are needed for the cover page")
        return self


class DocProposalIn(BaseModel):
    id: uuid.UUID
    copies: int = Field(ge=1, le=100)
    paper_size: PaperSize
    page_count: int | None = Field(default=None, ge=1, le=5000)
    rules: list[RuleIO] = Field(min_length=1, max_length=50)


class QuotePreviewIn(BaseModel):
    """Unsaved Print Preview Studio settings to price. Nothing is written; omitted documents use their saved config."""
    documents: list[DocProposalIn] = Field(default=[], max_length=50)
    binding: Binding
    cover_page: bool = False


class DeliveryIn(BaseModel):
    slot_id: uuid.UUID
    slot_date: date
    coupon_code: str | None = Field(default=None, max_length=40)


class QuoteLine(BaseModel):
    label: str
    amount: Decimal


class QuotationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    printing_amount: Decimal
    binding_amount: Decimal
    cover_amount: Decimal
    delivery_fee: Decimal
    discount: Decimal
    total: Decimal
    lines: list[QuoteLine]


class SlotOut(BaseModel):
    slot_id: uuid.UUID
    label: str
    date: date
    delivery_at: datetime
    cutoff_at: datetime
    remaining: int
    is_open: bool


class CollegeBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    security_cabin: str
    collection_instructions: str | None


class TimelineStep(BaseModel):
    key: str
    label: str
    done: bool
    at: datetime | None


class OrderSummary(BaseModel):
    id: uuid.UUID
    code: str
    status: OrderStatus
    payment_status: PaymentStatus
    created_at: datetime
    slot_date: date | None
    document_count: int
    total: Decimal | None


class ShopBrief(BaseModel):
    id: uuid.UUID
    shop_name: str
    area: str


class ShopOption(BaseModel):
    """One row of the price comparison. shop_id None = standard price (any available shop)."""
    shop_id: uuid.UUID | None
    shop_name: str
    area: str | None
    distance_km: Decimal | None  # shop to the college
    printing_amount: Decimal
    binding_amount: Decimal
    total: Decimal
    chosen: bool


class ShopChoiceIn(BaseModel):
    shop_id: uuid.UUID | None


class OrderDetail(BaseModel):
    id: uuid.UUID
    code: str
    status: OrderStatus
    payment_status: PaymentStatus
    created_at: datetime
    college: CollegeBrief
    slot: SlotOut | None
    binding: Binding
    cover_page: bool
    subject_name: str | None
    subject_code: str | None
    cover_template: CoverTemplate = CoverTemplate.classic
    cover_color: CoverColor = CoverColor.navy
    cover_title: str | None = None
    coupon_code: str | None
    documents: list[DocumentOut]
    quotation: QuotationOut | None  # locked snapshot once checkout has started
    chosen_shop: ShopBrief | None = None  # None = standard price, shop auto-assigned
    timeline: list[TimelineStep]
    can_cancel: bool
    can_collect: bool
    shelf_photo_url: str | None = None  # where the packet was left, once delivered


class CheckoutOut(BaseModel):
    razorpay_key_id: str
    razorpay_order_id: str
    amount_paise: int
    currency: str
