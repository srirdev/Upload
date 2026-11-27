"""Generated PDFs for the shop: per-document cover pages and per-order packet labels."""
from fpdf import FPDF

from app.modules.colleges.models import College
from app.modules.orders.enums import COVER_RGB, CoverColor, CoverTemplate, PaperSize
from app.modules.orders.models import Order, OrderDocument
from app.modules.students.models import StudentProfile

INK = (28, 28, 38)
GREY = (96, 96, 110)


def _t(text: str | None) -> str:
    """Built-in PDF fonts are Latin-1 only; replace anything else rather than crash."""
    return (text or "").encode("latin-1", "replace").decode("latin-1")


def cover_lines(order: Order, student: StudentProfile, college: College) -> dict:
    """The text on a cover. The student's Print Preview Studio lays out exactly these strings."""
    heading = order.cover_title or order.subject_name or ""
    sub = f"{order.subject_name} ({order.subject_code})" if order.cover_title else (order.subject_code or "")
    return {
        "college": college.name,
        "heading": heading,
        "sub": sub,
        "name": student.full_name,
        "details": [f"Register No: {student.register_number}", f"{student.department} - Year {student.year}"],
    }


def cover_pdf(order: Order, student: StudentProfile, college: College, doc: OrderDocument) -> bytes:
    """Cover page in the template, colour and paper size the student chose (layout in A4 millimetres, scaled for A3).

    Keep in sync with frontend/src/modules/student/features/studio/CoverArt.tsx.
    """
    a3 = doc.paper_size == PaperSize.A3
    k = 297 / 210 if a3 else 1.0  # A3 is A4 scaled by sqrt(2)
    pdf = FPDF(format="A3" if a3 else "A4")
    pdf.add_page()
    pdf.set_auto_page_break(False)
    c = cover_lines(order, student, college)
    accent = COVER_RGB[order.cover_color or CoverColor.navy]
    template = order.cover_template or CoverTemplate.classic

    def font(style: str, pt: float, rgb=INK):
        pdf.set_font("Helvetica", style, pt * k)
        pdf.set_text_color(*rgb)

    def text(x: float, y: float, w: float, h: float, s: str, align: str):
        pdf.set_xy(x * k, y * k)
        pdf.multi_cell(w * k, h * k, _t(s), align=align, new_x="LMARGIN", new_y="NEXT")

    if template == CoverTemplate.modern:
        pdf.set_fill_color(*accent)
        pdf.rect(0, 0, 58 * k, 297 * k, style="F")
        font("B", 22, (255, 255, 255))
        text(8, 28, 44, 10, order.subject_code or "", "L")
        font("B", 11, accent)
        text(72, 30, 120, 6, c["college"].upper(), "L")
        font("B", 28)
        text(72, 88, 120, 12, c["heading"], "L")
        font("", 14, GREY)
        text(72, pdf.get_y() / k + 4, 120, 7, c["sub"], "L")
        pdf.set_draw_color(*accent)
        pdf.set_line_width(1.2 * k)
        pdf.line(72 * k, 186 * k, 112 * k, 186 * k)
        font("", 10, GREY)
        text(72, 196, 120, 6, "SUBMITTED BY", "L")
        font("B", 17)
        text(72, 204, 120, 9, c["name"], "L")
        font("", 13, GREY)
        for i, line in enumerate(c["details"]):
            text(72, 216 + i * 8, 120, 7, line, "L")
    elif template == CoverTemplate.minimal:
        pdf.set_fill_color(*accent)
        pdf.rect(25 * k, 40 * k, 30 * k, 1.6 * k, style="F")
        font("", 11, GREY)
        text(25, 48, 160, 6, c["college"], "L")
        font("B", 30)
        text(25, 104, 160, 13, c["heading"], "L")
        font("", 14, GREY)
        text(25, pdf.get_y() / k + 4, 160, 7, c["sub"], "L")
        font("B", 16)
        text(25, 226, 160, 8, c["name"], "L")
        font("", 12, GREY)
        for i, line in enumerate(c["details"]):
            text(25, 236 + i * 7, 160, 6, line, "L")
    else:  # classic
        pdf.set_draw_color(*accent)
        pdf.set_line_width(1.6 * k)
        pdf.rect(12 * k, 12 * k, 186 * k, 273 * k)
        pdf.set_line_width(0.4 * k)
        pdf.rect(16 * k, 16 * k, 178 * k, 265 * k)
        font("B", 13, accent)
        text(25, 34, 160, 7, c["college"].upper(), "C")
        pdf.set_line_width(0.6 * k)
        pdf.line(80 * k, 50 * k, 130 * k, 50 * k)
        font("B", 26)
        text(25, 92, 160, 12, c["heading"], "C")
        font("", 15, GREY)
        text(25, pdf.get_y() / k + 4, 160, 8, c["sub"], "C")
        font("", 10, GREY)
        text(25, 172, 160, 6, "SUBMITTED BY", "C")
        font("B", 18)
        text(25, 180, 160, 10, c["name"], "C")
        font("", 13, GREY)
        for i, line in enumerate(c["details"]):
            text(25, 193 + i * 8, 160, 7, line, "C")

    font("", 8, GREY)
    text(15, 288, 180, 4, f"{doc.filename}  |  Order {order.code}", "C")
    return bytes(pdf.output())


def label_pdf(order: Order, student: StudentProfile, college: College) -> bytes:
    pdf = FPDF(orientation="L", unit="mm", format=(70, 100))
    pdf.add_page()
    pdf.set_auto_page_break(False)
    pdf.set_margins(5, 5, 5)
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 11, _t(order.code), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _t(student.full_name), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    slot = f"Deliver: {order.slot_date}" if order.slot_date else ""
    for line in (
        f"Reg: {student.register_number}",
        f"{student.department} - Year {student.year}",
        college.name,
        f"Docs: {len(order.documents)}   Binding: {order.binding.value}",
        slot,
    ):
        if line:
            pdf.cell(0, 6, _t(line), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
