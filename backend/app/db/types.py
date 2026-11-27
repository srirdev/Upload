import enum

from sqlalchemy import JSON, Enum
from sqlalchemy.dialects.postgresql import JSONB


def enum_col(e: type[enum.Enum], name: str | None = None) -> Enum:
    """Portable enum column: VARCHAR plus a CHECK constraint listing the allowed values.

    `name` names the CHECK constraint; pass it when one table has two columns of the same enum.
    """
    return Enum(e, native_enum=False, length=30, create_constraint=True, name=name or e.__name__.lower())


# JSONB on PostgreSQL (indexable, binary), plain JSON elsewhere (test database).
JsonB = JSON().with_variant(JSONB(), "postgresql")
