"""Dumps REAL admin API responses for the frontend's admin page tests.

Run:  DUMP_FIXTURES=1 .venv/Scripts/pytest tests/test_dump_admin_fixtures.py
Writes frontend/src/modules/admin/__fixtures__/api.json. Skipped in normal test runs.
"""
import json
import os
from datetime import date, timedelta
from pathlib import Path

import pytest

from tests.helpers import API
from tests.test_admin import complain, deliver_fully

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "modules" / "admin" / "__fixtures__" / "api.json"


@pytest.mark.skipif(not os.environ.get("DUMP_FIXTURES"), reason="set DUMP_FIXTURES=1 to regenerate frontend fixtures")
def test_dump_admin_fixtures(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, shop_id = make_shop()
    rider, rider_id = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    complain(client, student, oid)
    assert client.put(f"{API}/admin/coupons", headers=admin, json={"code": "WELCOME10", "percent_off": "10"}).status_code == 200
    week = {"period_start": str(date.today() - timedelta(days=7)), "period_end": str(date.today() + timedelta(days=1))}
    client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json=week)
    client.post(f"{API}/admin/settlements/riders/generate", headers=admin, json=week)
    make_shop("9222222222", approve=False)  # a pending shop to review
    make_rider("9444444444", approve=False)  # a pending rider to review

    complaint_id = client.get(f"{API}/admin/complaints", headers=admin).json()[0]["id"]
    paths = [
        "/me", "/ops/summary", "/ops/custody", "/orders", f"/orders/{oid}", "/batches",
        "/shops", "/shops?status=approved", "/shops?status=pending", f"/shops/{shop_id}/performance",
        "/riders", "/riders?kyc=approved", "/riders?kyc=pending", f"/riders/{rider_id}/performance", f"/riders/{rider_id}/documents",
        "/complaints", f"/complaints/{complaint_id}", "/refunds", "/colleges", "/config", "/config/rates", "/coupons",
        "/finance/summary", "/finance/ledger", "/audit",
        "/settlements/shops", "/settlements/riders", "/settlements/shops?status=pending", "/settlements/riders?status=pending",
    ]
    out = {"_ids": {"order": oid, "shop": shop_id, "rider": rider_id, "complaint": complaint_id}}
    for p in paths:
        r = client.get(f"{API}/admin{p}", headers=admin)
        assert r.status_code == 200, (p, r.text)
        out[p] = r.json()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
