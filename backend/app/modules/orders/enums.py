import enum


class PaperSize(str, enum.Enum):
    A4 = "A4"
    A3 = "A3"


class ColorMode(str, enum.Enum):
    bw = "bw"
    color = "color"


class Sided(str, enum.Enum):
    single = "single"
    double = "double"


class Binding(str, enum.Enum):
    none = "none"
    spiral = "spiral"
    calico = "calico"
    soft = "soft"
    hard = "hard"


class ConversionStatus(str, enum.Enum):
    """DOCX/PPTX are converted to PDF by a background worker for previews and exact page counts."""
    not_needed = "not_needed"  # PDF / image
    pending = "pending"
    done = "done"
    failed = "failed"  # student confirms the page count manually


class OrderStatus(str, enum.Enum):
    draft = "draft"
    awaiting_payment = "awaiting_payment"
    placed = "placed"
    accepted = "accepted"
    printing = "printing"
    packing = "packing"
    handover_verified = "handover_verified"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    collected = "collected"
    cancelled = "cancelled"
    rejected = "rejected"


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refund_pending = "refund_pending"
    refunded = "refunded"


class Orientation(str, enum.Enum):
    """How pages are laid on the sheet. `auto` follows each page of the document."""
    auto = "auto"
    portrait = "portrait"
    landscape = "landscape"


class CoverTemplate(str, enum.Enum):
    """Cover page designs; the shop's generated cover PDF uses the same template the student previewed."""
    classic = "classic"  # centred, double rule border (traditional academic)
    modern = "modern"  # colour band down the left edge
    minimal = "minimal"  # left-aligned, generous whitespace, thin accent rule


class CoverColor(str, enum.Enum):
    """Accent colour palette for covers (keys, not free hex, so print and preview always match)."""
    navy = "navy"
    maroon = "maroon"
    forest = "forest"
    royal = "royal"
    charcoal = "charcoal"
    violet = "violet"


# RGB used by the generated cover PDF (and mirrored in the student preview).
COVER_RGB: dict[CoverColor, tuple[int, int, int]] = {
    CoverColor.navy: (27, 42, 74),
    CoverColor.maroon: (122, 30, 46),
    CoverColor.forest: (28, 84, 58),
    CoverColor.royal: (36, 76, 168),
    CoverColor.charcoal: (52, 52, 58),
    CoverColor.violet: (88, 40, 160),
}
