"""Seed placeholder pricing so the platform is usable before the admin portal exists (Phase 6).

    python -m app.modules.finance.seed                  # idempotent: platform config, rate card, binding prices
    python -m app.modules.finance.seed --sample-college # DEV ONLY: one sample college with three slots

!! The prices below are PLACEHOLDERS, not real business figures. Replace them with your real
!! pricing (via the admin portal once built, or directly in the database) before going live.
"""
import sys
from datetime import time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.modules.colleges.models import College, CollegeSlot
from app.modules.finance.models import BindingPrice, PlatformConfig, RateCard
from app.modules.orders.enums import Binding, ColorMode, PaperSize, Sided

PLACEHOLDER_PRINT = {  # (paper, color, sided) -> price per page; same price across GSM besides the surcharge
    (PaperSize.A4, ColorMode.bw, Sided.single): "1.00", (PaperSize.A4, ColorMode.bw, Sided.double): "0.80",
    (PaperSize.A4, ColorMode.color, Sided.single): "5.00", (PaperSize.A4, ColorMode.color, Sided.double): "4.50",
    (PaperSize.A3, ColorMode.bw, Sided.single): "3.00", (PaperSize.A3, ColorMode.bw, Sided.double): "2.50",
    (PaperSize.A3, ColorMode.color, Sided.single): "10.00", (PaperSize.A3, ColorMode.color, Sided.double): "9.00",
}
GSM_SURCHARGE = {70: Decimal("0"), 80: Decimal("0.10"), 100: Decimal("0.50")}
PLACEHOLDER_BINDING = {Binding.spiral: "30", Binding.calico: "40", Binding.soft: "60", Binding.hard: "150"}


def seed_defaults(db: Session) -> None:
    if not db.get(PlatformConfig, 1):
        db.add(PlatformConfig(id=1, delivery_fee=Decimal("15"), cover_page_fee=Decimal("5"),
                              commission_percent=Decimal("10"), rider_base_fee=Decimal("40"),
                              rider_extra_shop_fee=Decimal("15"), rider_packet_bonus=Decimal("3"),
                              rider_min_guarantee=Decimal("60"), no_wait_minutes=4,
                              gateway_fee_percent=Decimal("2"), late_refund_percent=Decimal("50")))
    if not db.query(RateCard).first():
        for (paper, color, sided), base in PLACEHOLDER_PRINT.items():
            for gsm, extra in GSM_SURCHARGE.items():
                db.add(RateCard(paper_size=paper, gsm=gsm, color=color, sided=sided,
                                price_per_page=Decimal(base) + extra))
    for binding, price in PLACEHOLDER_BINDING.items():
        if not db.get(BindingPrice, binding):
            db.add(BindingPrice(binding=binding, price=Decimal(price)))
    db.commit()


def seed_sample_college(db: Session) -> None:
    if db.query(College).filter_by(name="Sample College (dev)").first():
        return
    college = College(name="Sample College (dev)", city="Chennai", security_cabin="Main gate security cabin", latitude=Decimal("13.010000"), longitude=Decimal("80.230000"),
                      drop_instructions="Place packets on the labelled shelf.",
                      collection_instructions="Show your order ID at the security cabin and collect your packet.")
    db.add(college)
    db.flush()
    for label, t, cutoff in (("Morning", time(10, 0), 120), ("Afternoon", time(13, 30), 120), ("Evening", time(16, 30), 120)):
        db.add(CollegeSlot(college_id=college.id, label=label, delivery_time=t, cutoff_minutes=cutoff, capacity=50))
    db.commit()


if __name__ == "__main__":
    with SessionLocal() as session:
        seed_defaults(session)
        if "--sample-college" in sys.argv:
            seed_sample_college(session)
    print("Seeded placeholder pricing" + (" and a sample college" if "--sample-college" in sys.argv else ""))
