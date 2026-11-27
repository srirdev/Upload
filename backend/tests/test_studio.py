"""Print Preview Studio: orientation and cover design persist on the order, reach the shop and admin exactly,
never change the price, and the document bytes stream only to the owner."""
import io

import pytest
from pypdf import PdfReader

from tests.conftest import make_pdf
from tests.helpers import API, build_order, hdr, placed_order


def _config(client, h, oid, doc, **over):
    body = {"copies": 2, "paper_size": "A4",
            "rules": [{"page_from": 1, "page_to": doc["page_count"], "color": "bw", "gsm": 80, "sided": "double"}], **over}
    return client.put(f"{API}/orders/{oid}/documents/{doc['id']}/config", headers=h, json=body)


def _binding(client, h, oid, **over):
    body = {"binding": "hard", "cover_page": True, "subject_name": "Data Structures", "subject_code": "CS3301", **over}
    return client.put(f"{API}/orders/{oid}/binding", headers=h, json=body)


def test_orientation_defaults_to_auto_and_persists(client, student, seeded, db_session):
    oid, doc = build_order(client, student, seeded, db_session)
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["documents"][0]["orientation"] == "auto"
    r = _config(client, student, oid, doc, orientation="landscape")
    assert r.status_code == 200 and r.json()["orientation"] == "landscape"
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["documents"][0]["orientation"] == "landscape"
    assert _config(client, student, oid, doc, orientation="sideways").status_code == 422
    # older clients that don't send orientation keep working (falls back to auto)
    assert _config(client, student, oid, doc).json()["orientation"] == "auto"


def test_cover_design_persists_and_validates(client, student, seeded, db_session):
    oid, _ = build_order(client, student, seeded, db_session)
    d = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert (d["cover_template"], d["cover_color"], d["cover_title"]) == ("classic", "navy", None)  # defaults

    r = _binding(client, student, oid, cover_template="modern", cover_color="maroon", cover_title="  Hash Tables Lab  ")
    assert r.status_code == 200
    d = r.json()
    assert (d["cover_template"], d["cover_color"], d["cover_title"]) == ("modern", "maroon", "Hash Tables Lab")

    assert _binding(client, student, oid, cover_template="fancy").status_code == 422
    assert _binding(client, student, oid, cover_color="#ff0000").status_code == 422
    assert _binding(client, student, oid, cover_title="x" * 161).status_code == 422
    # a cover still needs subject name and code
    assert _binding(client, student, oid, subject_code="").status_code == 422
    assert _binding(client, student, oid, cover_title="   ").json()["cover_title"] is None


def test_design_choices_never_change_the_price(client, student, seeded, db_session):
    oid, doc = build_order(client, student, seeded, db_session)
    _config(client, student, oid, doc)
    _binding(client, student, oid)
    before = client.get(f"{API}/orders/{oid}/quotation", headers=student).json()["total"]
    _config(client, student, oid, doc, orientation="landscape")
    _binding(client, student, oid, cover_template="minimal", cover_color="forest", cover_title="Lab record")
    assert client.get(f"{API}/orders/{oid}/quotation", headers=student).json()["total"] == before
    # price-affecting options still re-quote
    _config(client, student, oid, doc, copies=3)
    assert client.get(f"{API}/orders/{oid}/quotation", headers=student).json()["total"] != before


def test_document_file_streams_only_to_the_owner(client, student, seeded, db_session, login):
    oid, doc = build_order(client, student, seeded, db_session, pages=3)
    r = client.get(f"{API}/orders/{oid}/documents/{doc['id']}/file", headers=student)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(PdfReader(io.BytesIO(r.content)).pages) == 3
    assert "private" in r.headers["cache-control"]
    assert client.get(f"{API}/orders/{oid}/documents/{doc['id']}/file", headers=student,
                      params={"preview": True}).status_code == 404  # PDFs have no converted preview

    other = hdr(login("9123456780"))
    client.post(f"{API}/students/me/profile", headers=other, json={
        "full_name": "Other", "college_id": str(seeded.id), "department": "ECE", "year": 2, "register_number": "22EC9"})
    assert client.get(f"{API}/orders/{oid}/documents/{doc['id']}/file", headers=other).status_code == 404
    assert client.get(f"{API}/orders/{oid}/documents/{doc['id']}/file").status_code == 401


@pytest.mark.parametrize("template", ["classic", "modern", "minimal"])
@pytest.mark.parametrize("paper", ["A4", "A3"])
def test_shop_sees_exact_specs_and_cover_pdf_matches(client, student, seeded, db_session, razorpay, make_shop, template, paper):
    h, _ = make_shop()
    oid, doc = build_order(client, student, seeded, db_session)
    _config(client, student, oid, doc, paper_size=paper, orientation="landscape")
    _binding(client, student, oid, cover_template=template, cover_color="royal", cover_title="Final Year Project")
    from tests.test_orders import pay
    pay(client, student, oid)

    order = next(o for o in client.get(f"{API}/shops/me/orders", headers=h, params={"tab": "new"}).json() if o["id"] == oid)
    assert (order["cover_template"], order["cover_color"], order["cover_title"]) == (template, "royal", "Final Year Project")
    assert order["documents"][0]["orientation"] == "landscape" and order["documents"][0]["paper_size"] == paper

    client.post(f"{API}/shops/me/orders/{oid}/accept", headers=h)
    cov = client.get(f"{API}/shops/me/orders/{oid}/cover.pdf", headers=h, params={"document_id": doc["id"]})
    assert cov.status_code == 200
    page = PdfReader(io.BytesIO(cov.content)).pages[0]
    width_mm = float(page.mediabox.width) / 72 * 25.4
    assert abs(width_mm - (297 if paper == "A3" else 210)) < 1  # cover printed on the document's paper size
    text = page.extract_text()
    assert "Final Year Project" in text and "Data Structures (CS3301)" in text and "Asha Raman" in text


def test_admin_order_detail_includes_design(client, student, seeded, db_session, razorpay, admin):
    oid, doc = placed_order(client, student, seeded, db_session, razorpay)
    d = client.get(f"{API}/admin/orders/{oid}", headers=admin).json()
    assert d["cover_template"] == "classic" and d["documents"][0]["orientation"] == "auto"


def test_large_multi_page_pdf_is_counted_and_streamed(client, student, seeded, db_session):
    oid = client.post(f"{API}/orders", headers=student).json()["id"]
    r = client.post(f"{API}/orders/{oid}/documents", headers=student,
                    files={"file": ("thesis.pdf", make_pdf(400), "application/pdf")})
    assert r.status_code == 201 and r.json()["page_count"] == 400
    f = client.get(f"{API}/orders/{oid}/documents/{r.json()['id']}/file", headers=student)
    assert len(PdfReader(io.BytesIO(f.content)).pages) == 400


def test_quote_preview_prices_unsaved_settings_without_saving(client, student, seeded, db_session):
    oid, doc = build_order(client, student, seeded, db_session)
    saved = client.get(f"{API}/orders/{oid}", headers=student).json()
    saved_total = client.get(f"{API}/orders/{oid}/quotation", headers=student).json()["total"]
    rules = [{"page_from": 1, "page_to": doc["page_count"], "color": "color", "gsm": 100, "sided": "single"}]

    url = f"{API}/orders/{oid}/quotation/preview"
    more = client.post(url, headers=student, json={
        "documents": [{"id": doc["id"], "copies": 5, "paper_size": "A3", "rules": rules}], "binding": "hard", "cover_page": True})
    assert more.status_code == 200 and float(more.json()["total"]) > float(saved_total)
    # identical proposal to the saved config prices the same as the saved quote
    same = client.post(url, headers=student, json={
        "documents": [{"id": d["id"], "copies": d["copies"], "paper_size": d["paper_size"], "rules": d["rules"]}
                      for d in saved["documents"]],
        "binding": saved["binding"], "cover_page": saved["cover_page"]})
    assert same.json()["total"] == saved_total
    # nothing was written
    assert client.get(f"{API}/orders/{oid}", headers=student).json() == saved
    # invalid page ranges are reported with the file name
    bad = client.post(url, headers=student, json={
        "documents": [{"id": doc["id"], "copies": 1, "paper_size": "A4",
                       "rules": [{**rules[0], "page_to": doc["page_count"] - 1}]}], "binding": "none"})
    assert bad.status_code == 422 and "notes.pdf" in bad.json()["detail"]
