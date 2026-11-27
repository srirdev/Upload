"""Pure pricing and print-rule logic (no DB, no HTTP). All money is Decimal."""
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided

CENT = Decimal("0.01")
ALLOWED_GSM = (70, 80, 100)


class PricingError(ValueError):
    """User-correctable problem with the order configuration."""


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class RuleInput:
    page_from: int
    page_to: int
    color: ColorMode
    gsm: int
    sided: Sided


@dataclass(frozen=True)
class DocInput:
    filename: str
    page_count: int | None
    copies: int
    paper_size: PaperSize
    rules: list[RuleInput]


RateKey = tuple[PaperSize, int, ColorMode, Sided]


def validate_rules(page_count: int, rules: list[RuleInput]) -> None:
    """Rules must tile pages 1..page_count exactly, and must not put different GSM on one sheet."""
    if not rules:
        raise PricingError("Add at least one print setting")
    ordered = sorted(rules, key=lambda r: r.page_from)
    expected = 1
    for r in ordered:
        if r.gsm not in ALLOWED_GSM:
            raise PricingError(f"Paper weight must be one of {', '.join(map(str, ALLOWED_GSM))} GSM")
        if r.page_from < 1 or r.page_to < r.page_from:
            raise PricingError(f"Invalid page range {r.page_from}-{r.page_to}")
        if r.page_from < expected:
            raise PricingError(f"Page {r.page_from} is covered by more than one setting")
        if r.page_from > expected:
            raise PricingError(f"Pages {expected}-{r.page_from - 1} have no print setting")
        expected = r.page_to + 1
    if expected - 1 < page_count:
        raise PricingError(f"Pages {expected}-{page_count} have no print setting")
    if expected - 1 > page_count:
        raise PricingError(f"Document only has {page_count} pages")

    # Double-sided pages are paired onto sheets in order; a single-sided page ends any open sheet.
    open_page: int | None = None
    open_gsm = 0
    for r in ordered:
        for p in range(r.page_from, r.page_to + 1):
            if r.sided == Sided.single:
                open_page = None
            elif open_page is None:
                open_page, open_gsm = p, r.gsm
            elif open_gsm != r.gsm:
                raise PricingError(
                    f"Pages {open_page} and {p} share one sheet but use different paper weights "
                    f"({open_gsm} and {r.gsm} GSM). Start the new setting on an odd page or make it single-sided."
                )
            else:
                open_page = None


def quote(
    docs: list[DocInput],
    binding: Binding,
    cover_page: bool,
    rates: Mapping[RateKey, Decimal],
    binding_prices: Mapping[Binding, Decimal],
    cover_fee: Decimal,
    delivery_fee: Decimal,
    percent_off: Decimal | None = None,
    flat_off: Decimal | None = None,
) -> dict:
    if not docs:
        raise PricingError("Add at least one document")
    printing = binding_total = cover_total = Decimal("0")
    lines: list[dict] = []
    for d in docs:
        if d.page_count is None:
            raise PricingError(f"Enter the number of pages for {d.filename}")
        validate_rules(d.page_count, d.rules)
        per_copy = Decimal("0")
        for r in d.rules:
            try:
                rate = rates[(d.paper_size, r.gsm, r.color, r.sided)]
            except KeyError:
                raise PricingError(
                    f"{d.paper_size.value} {r.gsm} GSM {r.color.value} {r.sided.value}-sided is not available"
                ) from None
            per_copy += rate * (r.page_to - r.page_from + 1)
        doc_total = money(per_copy * d.copies)
        printing += doc_total
        lines.append({"label": f"{d.filename} ({d.page_count} pages × {d.copies})", "amount": str(doc_total)})
        if binding != Binding.none:
            try:
                binding_total += binding_prices[binding] * d.copies
            except KeyError:
                raise PricingError(f"{binding.value} binding is not available") from None
        if cover_page:
            cover_total += cover_fee * d.copies

    printing, binding_total, cover_total = money(printing), money(binding_total), money(cover_total)
    if binding_total:
        lines.append({"label": f"{binding.value.title()} binding", "amount": str(binding_total)})
    if cover_total:
        lines.append({"label": "Cover pages", "amount": str(cover_total)})

    discount = Decimal("0")
    if percent_off is not None:
        discount = money(printing * percent_off / 100)
    elif flat_off is not None:
        discount = flat_off
    discount = money(min(discount, printing))  # coupons apply to printing only

    delivery_fee = money(delivery_fee)
    total = printing + binding_total + cover_total + delivery_fee - discount
    return {
        "printing_amount": printing,
        "binding_amount": binding_total,
        "cover_amount": cover_total,
        "delivery_fee": delivery_fee,
        "discount": discount,
        "total": money(total),
        "lines": lines,
    }
