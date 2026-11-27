import uuid

from pydantic import BaseModel, ConfigDict


class CollegeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    city: str | None
    security_cabin: str
    collection_instructions: str | None
