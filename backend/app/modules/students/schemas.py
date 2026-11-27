import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.students.models import ComplaintCategory, ComplaintStatus


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    college_id: uuid.UUID
    department: str = Field(min_length=2, max_length=120)
    year: int = Field(ge=1, le=6)
    register_number: str = Field(min_length=3, max_length=40)


class ProfileName(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    full_name: str
    college_id: uuid.UUID
    college_name: str
    department: str
    year: int
    register_number: str
    referral_code: str


class ComplaintOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    order_code: str
    category: ComplaintCategory
    description: str
    photo_urls: list[str]
    status: ComplaintStatus
    admin_response: str | None
    refund_status: str | None
    created_at: datetime
