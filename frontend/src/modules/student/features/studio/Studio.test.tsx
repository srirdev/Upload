import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDetail, OrderDocument } from "@/modules/student/api/types";
import { ReviewStep } from "@/modules/student/features/studio/ReviewStep";
import { StudioStep } from "@/modules/student/features/studio/StudioStep";
import { mockFetch, renderWithProviders, signIn } from "@/test/utils";

// The real PDF engine needs a browser canvas; the studio only needs pages, sizes and rendered images.
const render = vi.fn(async (page: number) => `blob:page-${page}`);
const openDocument = vi.fn();
vi.mock("@/modules/student/features/studio/pdf", () => ({ openDocument: (...a: unknown[]) => openDocument(...a) }));

const fakeDoc = (pages: number, landscape = false) => ({
  kind: "pdf" as const,
  pages,
  size: async () => (landscape ? { w: 842, h: 595 } : { w: 595, h: 842 }),
  render,
});

const PROFILE = {
  full_name: "Asha Raman", college_id: "c1", college_name: "Guindy College of Engineering", department: "CSE", year: 3,
  register_number: "21CS001", referral_code: "ASHA1234",
};

function makeDoc(over: Partial<OrderDocument> = {}): OrderDocument {
  return {
    id: "d1", filename: "notes.pdf", content_type: "application/pdf", size_bytes: 1000, page_count: 6, page_count_auto: true,
    conversion_status: "not_needed", has_preview: false, copies: 1, paper_size: "A4", orientation: "auto",
    rules: [{ page_from: 1, page_to: 6, color: "bw", gsm: 80, sided: "single" }], ...over,
  };
}

function makeOrder(over: Partial<OrderDetail> = {}, docs = [makeDoc()]): OrderDetail {
  return {
    id: "o1", code: "UP-AB12CD", status: "draft", payment_status: "unpaid", created_at: "2026-11-26T10:00:00Z",
    college: { id: "c1", name: "Guindy College of Engineering", security_cabin: "Main gate", collection_instructions: null },
    slot: null, binding: "none", cover_page: false, subject_name: null, subject_code: null, cover_template: "classic",
    cover_color: "navy", cover_title: null, coupon_code: null, documents: docs, quotation: null, chosen_shop: null,
    timeline: [], can_cancel: false, can_collect: false, shelf_photo_url: null, ...over,
  };
}

const QUOTE = (total: string) => ({
  printing_amount: total, binding_amount: "0.00", cover_amount: "0.00", delivery_fee: "10.00", discount: "0.00", total,
  lines: [{ label: "notes.pdf", amount: total }],
});

function api(extra?: (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined) {
  return mockFetch((url, init) => {
    const hit = extra?.(url, init);
    if (hit) return hit;
    if (url.endsWith("/students/me/profile")) return { body: PROFILE };
    if (url.endsWith("/quotation/preview")) {
      const body = JSON.parse(String(init?.body));
      const copies = body.documents[0]?.copies ?? 1;
      return { body: QUOTE(`${(copies * 12).toFixed(2)}`) };
    }
    return undefined;
  });
}

beforeEach(() => {
  signIn("student");
  render.mockClear();
  openDocument.mockReset();
  openDocument.mockResolvedValue(fakeDoc(6));
});

describe("Print Preview Studio", () => {
  it("renders the real document and flips through it page by page", async () => {
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    expect(await screen.findByText("Page 1 — sheet 1 of 6")).toBeInTheDocument();
    expect(openDocument).toHaveBeenCalledWith("o1", "d1", "application/pdf", false); // the uploaded PDF itself
    expect(await screen.findByAltText("Page 1")).toHaveAttribute("src", "blob:page-1");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2 — sheet 2 of 6")).toBeInTheDocument(); // single-sided: back of sheet 1 is blank
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("Page 1 — sheet 1 of 6")).toBeInTheDocument();

    // thumbnails jump straight to a sheet
    await userEvent.click(screen.getByRole("option", { name: /Sheet 5: page 5/ }));
    expect(await screen.findByText("Page 5 — sheet 5 of 6")).toBeInTheDocument();
  });

  it("keeps up with rapid page turns", async () => {
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    await screen.findByText("Page 1 — sheet 1 of 6");
    const next = screen.getByRole("button", { name: "Next page" });
    await userEvent.click(next);
    await userEvent.click(next);
    await userEvent.click(next);
    expect(await screen.findByText("Page 4 — sheet 4 of 6")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Page 4 — sheet 4 of 6")).toBeInTheDocument(); // keys only act when the stage has focus
    screen.getByLabelText(/Preview stage/).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(await screen.findByText("Page 3 — sheet 3 of 6")).toBeInTheDocument();
  });

  it("double-sided printing puts pages on the front and back of each sheet", async () => {
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    await screen.findByText("Page 1 — sheet 1 of 6");
    await userEvent.click(screen.getByRole("radio", { name: /Double-sided/ }));
    expect(await screen.findByText("Page 1 — sheet 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 sheets per copy")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2 · Page 3 — sheet 2 of 3")).toBeInTheDocument(); // back of sheet 1 + front of sheet 2
  });

  it("shows paper size, orientation and stack thickness, and updates the price live", async () => {
    const calls = api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    expect(await screen.findByText("A4 · 210 × 297 mm")).toBeInTheDocument();
    expect(screen.getByText("Portrait (auto)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /^A3/ }));
    expect(await screen.findByText("A3 · 297 × 420 mm")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /^Landscape/ }));
    expect(await screen.findByText("A3 · 420 × 297 mm")).toBeInTheDocument();
    expect(screen.getAllByText("Landscape").length).toBeGreaterThan(0);

    expect((await screen.findAllByText("₹12.00")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "More copies" }));
    await userEvent.click(screen.getByRole("button", { name: "More copies" }));
    expect(await screen.findByText(/≈ .* mm stack \(3 copies\)/)).toBeInTheDocument();
    expect((await screen.findAllByText("₹36.00", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    const last = calls.filter((c) => c.url.endsWith("/quotation/preview")).at(-1)!;
    expect(JSON.parse(String(last.init?.body)).documents[0]).toMatchObject({ copies: 3, paper_size: "A3" });
    // nothing was saved while previewing
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
    expect(screen.getAllByText("Unsaved").length).toBeGreaterThan(0);
  });

  it.each([
    ["Spiral", "spiral bound document"],
    ["Calico", "calico bound document"],
    ["Soft binding", "soft bound document"],
    ["Hard binding", "hard bound document"],
    ["No binding", "loose stack"],
  ])("shows %s as an assembled 3D object", async (label, aria) => {
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    await screen.findByText("Page 1 — sheet 1 of 6");
    await userEvent.click(screen.getByRole("tab", { name: "Binding" }));
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(`^${label}`) }));
    expect(await screen.findByRole("img", { name: new RegExp(aria) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Spine" }));
    expect(screen.getByRole("button", { name: "Spine" })).toHaveAttribute("aria-pressed", "true");
  });

  it("designs the cover from profile details and validates before saving", async () => {
    const calls = api((url, init) =>
      init?.method === "PUT" ? { body: url.endsWith("/binding") ? makeOrder() : makeDoc() } : undefined,
    );
    const onNext = vi.fn();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={onNext} />);
    await screen.findByText("Page 1 — sheet 1 of 6");
    await userEvent.click(screen.getByRole("tab", { name: "Cover" }));
    await userEvent.click(screen.getByRole("switch", { name: "Add a cover page" }));

    // profile details come in automatically
    expect(screen.getAllByText("Asha Raman").length).toBeGreaterThan(0);
    expect(screen.getByText("21CS001")).toBeInTheDocument();
    // the cover is the first sheet of the flip preview
    expect(await screen.findByText("Cover — sheet 1 of 7")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Modern/ }));
    expect(screen.getByRole("radio", { name: /Modern/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("img", { name: "Cover page, modern template" }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("radio", { name: "Maroon" }));

    // required fields
    await userEvent.click(screen.getAllByRole("button", { name: /Save and continue/ })[0]!);
    expect(await screen.findByText("Enter the subject name")).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);

    await userEvent.type(screen.getByLabelText("Subject name"), "Data Structures");
    await userEvent.type(screen.getByLabelText("Subject code"), "CS3301");
    await userEvent.type(screen.getByLabelText(/Project or assignment title/), "Hash Tables Lab");
    expect(screen.getAllByText("Hash Tables Lab").length).toBeGreaterThan(0); // live on the cover
    await userEvent.click(screen.getAllByRole("button", { name: /Save and continue/ })[0]!);

    await waitFor(() => expect(onNext).toHaveBeenCalled());
    const binding = calls.find((c) => c.url.endsWith("/orders/o1/binding"))!;
    expect(JSON.parse(String(binding.init?.body))).toEqual({
      binding: "none", cover_page: true, subject_name: "Data Structures", subject_code: "CS3301",
      cover_template: "modern", cover_color: "maroon", cover_title: "Hash Tables Lab",
    });
    const config = calls.find((c) => c.url.endsWith("/documents/d1/config"))!;
    expect(JSON.parse(String(config.init?.body))).toMatchObject({ copies: 1, paper_size: "A4", orientation: "auto" });
  });

  it("discards unsaved changes back to the saved configuration", async () => {
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    await screen.findByText("Page 1 — sheet 1 of 6");
    await userEvent.click(screen.getByRole("radio", { name: /^Colour/ }));
    expect(screen.getAllByText("Unsaved").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Discard changes/ }));
    expect(screen.getByRole("radio", { name: /^Black & white/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
  });

  it("explains DOCX conversion progress and failures without inventing content", async () => {
    api();
    const docx = makeDoc({ id: "d2", filename: "report.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", conversion_status: "pending" });
    const { unmount } = renderWithProviders(<StudioStep order={makeOrder({}, [docx])} onNext={() => {}} />);
    expect(await screen.findByText("Preparing a print preview")).toBeInTheDocument();
    expect(openDocument).not.toHaveBeenCalled();
    unmount();

    renderWithProviders(<StudioStep order={makeOrder({}, [{ ...docx, conversion_status: "failed" }])} onNext={() => {}} />);
    expect(await screen.findByText("Preview not available")).toBeInTheDocument();
    expect(screen.getByText(/original upload is kept/)).toBeInTheDocument();
  });

  it("previews a converted DOCX from its PDF and says so", async () => {
    api();
    const docx = makeDoc({ id: "d2", filename: "report.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", conversion_status: "done", has_preview: true });
    renderWithProviders(<StudioStep order={makeOrder({}, [docx])} onNext={() => {}} />);
    expect(await screen.findByText("Converted from DOCX")).toBeInTheDocument();
    expect(openDocument).toHaveBeenCalledWith("o1", "d2", docx.content_type, true);
  });

  it("lazily renders only nearby pages of a large PDF", async () => {
    openDocument.mockResolvedValue(fakeDoc(400));
    api();
    const big = makeDoc({ page_count: 400, rules: [{ page_from: 1, page_to: 400, color: "bw", gsm: 70, sided: "double" }] });
    renderWithProviders(<StudioStep order={makeOrder({}, [big])} onNext={() => {}} />);
    expect(await screen.findByText("Page 1 — sheet 1 of 200")).toBeInTheDocument();
    await waitFor(() => expect(render).toHaveBeenCalled());
    const pages = new Set(render.mock.calls.map((c) => c[0]));
    expect(pages.size).toBeLessThan(20); // never the whole document
  });

  it("shows an error with retry when the document can't be opened", async () => {
    openDocument.mockRejectedValueOnce(new Error("Network error")).mockResolvedValue(fakeDoc(6));
    api();
    renderWithProviders(<StudioStep order={makeOrder()} onNext={() => {}} />);
    expect(await screen.findByText("We couldn't open this document")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Page 1 — sheet 1 of 6")).toBeInTheDocument();
  });
});

describe("Review step", () => {
  it("summarises exactly the saved configuration", async () => {
    mockFetch((url) => {
      if (url.endsWith("/students/me/profile")) return { body: PROFILE };
      if (url.endsWith("/orders/o1/quotation")) return { body: QUOTE("120.00") };
    });
    const order = makeOrder(
      { binding: "hard", cover_page: true, subject_name: "Data Structures", subject_code: "CS3301", cover_template: "minimal", cover_color: "forest", cover_title: "Final Project" },
      [makeDoc({ copies: 2, paper_size: "A3", orientation: "landscape", rules: [{ page_from: 1, page_to: 2, color: "color", gsm: 100, sided: "double" }, { page_from: 3, page_to: 6, color: "bw", gsm: 80, sided: "single" }] })],
    );
    const onEdit = vi.fn();
    renderWithProviders(<ReviewStep order={order} onEdit={onEdit} onNext={() => {}} />);
    expect((await screen.findAllByText("₹120.00")).length).toBeGreaterThan(0);
    expect(screen.getByText("Hard binding")).toBeInTheDocument();
    expect(screen.getByText("Minimal · Forest")).toBeInTheDocument();
    expect(screen.getAllByText("Landscape").length).toBeGreaterThan(0);
    const table = screen.getByRole("table");
    expect(within(table).getByText("1–2")).toBeInTheDocument();
    expect(within(table).getAllByText("Colour")).toHaveLength(2); // header + the colour range
    await userEvent.click(screen.getAllByRole("button", { name: /Edit/ })[2]!);
    expect(onEdit).toHaveBeenCalledWith("cover");
  });
});
