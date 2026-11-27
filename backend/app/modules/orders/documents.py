"""Validate uploaded files by content (not just extension) and extract page counts where possible."""
import io
import re
import zipfile

from fastapi import HTTPException
from pypdf import PdfReader

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
ALLOWED_EXT = {"pdf": "application/pdf", "docx": DOCX, "pptx": PPTX, "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}


def inspect_upload(filename: str, data: bytes) -> tuple[str, int | None]:
    """Returns (content_type, page_count). page_count is None when it can't be determined reliably."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, "Unsupported file type. Upload PDF, DOCX, PPTX, JPG or PNG.")
    ctype = ALLOWED_EXT[ext]

    if ctype == "application/pdf":
        if not data.startswith(b"%PDF"):
            raise HTTPException(422, "This file is not a valid PDF")
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise HTTPException(422, "Password-protected PDFs are not supported")
            return ctype, len(reader.pages)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "This PDF could not be read") from None
    if ctype == "image/png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(422, "This file is not a valid PNG")
        return ctype, 1
    if ctype == "image/jpeg":
        if not data.startswith(b"\xff\xd8\xff"):
            raise HTTPException(422, "This file is not a valid JPG")
        return ctype, 1

    # DOCX / PPTX are zip containers
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
        names = zf.namelist()
    except zipfile.BadZipFile:
        raise HTTPException(422, "This file is not a valid Office document") from None
    if ctype == PPTX:
        slides = [n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
        if not slides:
            raise HTTPException(422, "This file is not a valid PPTX")
        return ctype, len(slides)
    if "word/document.xml" not in names:
        raise HTTPException(422, "This file is not a valid DOCX")
    # DOCX page count is only what the authoring app last saved; treat it as a best-effort hint.
    try:
        with zf.open("docProps/app.xml") as f:
            m = re.search(rb"<Pages>(\d+)</Pages>", f.read(1_000_000))
        return ctype, int(m.group(1)) if m and int(m.group(1)) > 0 else None
    except KeyError:
        return ctype, None
