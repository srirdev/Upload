import io
import zipfile

import pytest
from fastapi import HTTPException

from app.modules.orders.documents import DOCX, PPTX, inspect_upload
from tests.conftest import make_pdf


def zipped(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()


def test_pdf_page_count():
    assert inspect_upload("a.pdf", make_pdf(7)) == ("application/pdf", 7)


def test_pptx_counts_slides_and_docx_reads_saved_page_hint():
    pptx = zipped({"ppt/slides/slide1.xml": "", "ppt/slides/slide2.xml": "", "ppt/presentation.xml": ""})
    assert inspect_upload("a.pptx", pptx) == (PPTX, 2)
    docx = zipped({"word/document.xml": "", "docProps/app.xml": "<Properties><Pages>12</Pages></Properties>"})
    assert inspect_upload("a.docx", docx) == (DOCX, 12)
    assert inspect_upload("b.docx", zipped({"word/document.xml": ""})) == (DOCX, None)


def test_images_are_one_page():
    assert inspect_upload("a.png", b"\x89PNG\r\n\x1a\n....")[1] == 1
    assert inspect_upload("a.JPG", b"\xff\xd8\xff\xe0....")[1] == 1


@pytest.mark.parametrize("name, data, status", [
    ("a.exe", b"MZ", 415),
    ("a.pdf", b"not a pdf", 422),          # extension lies
    ("a.png", b"%PDF-1.4", 422),
    ("a.docx", b"plain text", 422),
    ("a.pptx", zipped({"x.txt": ""}), 422),
])
def test_rejects_bad_files(name, data, status):
    with pytest.raises(HTTPException) as e:
        inspect_upload(name, data)
    assert e.value.status_code == status
