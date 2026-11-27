"""DOCX/PPTX -> PDF conversion with LibreOffice (headless), run by the background worker.

The PDF gives students a faithful preview and an exact page count. Without LibreOffice the document stays
`pending` and the student's page count (entered manually, as before) is used; nothing is faked.
"""
import io
import shutil
import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader

from app.core.config import get_settings

TIMEOUT_SECONDS = 120


class ConversionUnavailable(RuntimeError):
    """LibreOffice is not installed/configured on this machine."""


def soffice() -> str:
    path = get_settings().soffice_path or shutil.which("soffice") or shutil.which("libreoffice")
    if not path or not Path(path).exists():
        raise ConversionUnavailable("LibreOffice (soffice) not found; set SOFFICE_PATH")
    return path


def to_pdf(filename: str, data: bytes) -> tuple[bytes, int]:
    """Returns (pdf bytes, page count). Raises ConversionUnavailable or RuntimeError on failure."""
    exe = soffice()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / ("input" + Path(filename).suffix.lower())
        src.write_bytes(data)
        # A private profile dir keeps parallel conversions from fighting over one LibreOffice profile.
        profile = Path(tmp, "profile").as_uri()
        result = subprocess.run(
            [exe, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(src)],
            capture_output=True, timeout=TIMEOUT_SECONDS, check=False,
        )
        out = src.with_suffix(".pdf")
        if result.returncode != 0 or not out.exists():
            raise RuntimeError(f"conversion failed: {result.stderr.decode(errors='replace')[:300]}")
        pdf = out.read_bytes()
    return pdf, len(PdfReader(io.BytesIO(pdf)).pages)
