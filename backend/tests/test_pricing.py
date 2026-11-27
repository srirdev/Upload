from decimal import Decimal as D

import pytest

from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided
from app.modules.orders.pricing import DocInput, PricingError, RuleInput, quote, validate_rules

A4, BW, COL, S, DBL = PaperSize.A4, ColorMode.bw, ColorMode.color, Sided.single, Sided.double
RATES = {
    (A4, 80, BW, S): D("1.00"), (A4, 80, BW, DBL): D("0.80"),
    (A4, 100, COL, S): D("6.00"), (A4, 100, COL, DBL): D("5.50"), (A4, 70, BW, DBL): D("0.70"),
}
BINDING = {Binding.spiral: D("30")}


def rule(a, b, color=BW, gsm=80, sided=S):
    return RuleInput(a, b, color, gsm, sided)


def doc(pages, rules, copies=1):
    return DocInput("notes.pdf", pages, copies, A4, rules)


def q(docs, **kw):
    args = dict(binding=Binding.none, cover_page=False, rates=RATES, binding_prices=BINDING,
                cover_fee=D("5"), delivery_fee=D("15"))
    args.update(kw)
    return quote(docs, **args)


def test_totals_use_decimal_and_all_components():
    r = q([doc(10, [rule(1, 10)], copies=2)], binding=Binding.spiral, cover_page=True)
    assert r["printing_amount"] == D("20.00")  # 10 pages * 1.00 * 2 copies
    assert r["binding_amount"] == D("60.00") and r["cover_amount"] == D("10.00")
    assert r["total"] == D("20.00") + D("60.00") + D("10.00") + D("15.00")


def test_mixed_page_rules_price_each_range():
    # Spec example: page 1 colour 100gsm, pages 2-48 b&w 80gsm
    r = q([doc(48, [rule(1, 1, COL, 100), rule(2, 48)])])
    assert r["printing_amount"] == D("6.00") + D("47.00")


def test_rounding_is_half_up_to_cents():
    r = q([doc(3, [rule(1, 3, sided=DBL)])], percent_off=D("33.33"))
    assert r["printing_amount"] == D("2.40") and r["discount"] == D("0.80")


def test_flat_coupon_never_exceeds_printing_amount():
    r = q([doc(1, [rule(1, 1)])], flat_off=D("999"))
    assert r["discount"] == D("1.00") and r["total"] == D("15.00")  # delivery fee is never discounted


@pytest.mark.parametrize("rules, msg", [
    ([rule(2, 5)], "Pages 1-1 have no print setting"),
    ([rule(1, 2), rule(4, 5)], "Pages 3-3 have no print setting"),
    ([rule(1, 3), rule(3, 5)], "covered by more than one"),
    ([rule(1, 4)], "Pages 5-5 have no print setting"),
    ([rule(1, 9)], "only has 5 pages"),
])
def test_rules_must_tile_the_document(rules, msg):
    with pytest.raises(PricingError, match=msg):
        validate_rules(5, rules)


def test_duplex_sheet_cannot_mix_paper_weights():
    with pytest.raises(PricingError, match="different paper weights"):
        validate_rules(6, [rule(1, 3, sided=DBL), rule(4, 6, gsm=70, sided=DBL)])


def test_duplex_boundary_on_even_page_is_fine():
    validate_rules(6, [rule(1, 4, sided=DBL), rule(5, 6, gsm=70, sided=DBL)])


def test_single_sided_cover_then_duplex_body_is_fine():
    validate_rules(48, [rule(1, 1, COL, 100, S), rule(2, 48, BW, 80, DBL)])


def test_unavailable_combination_and_missing_page_count():
    with pytest.raises(PricingError, match="not available"):
        q([doc(1, [rule(1, 1, COL, 70)])])
    with pytest.raises(PricingError, match="number of pages"):
        q([DocInput("a.docx", None, 1, A4, [])])
