import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OrderDetail, OrderSummary, Profile } from "@/modules/student/api/types";
import { HomePage } from "@/modules/student/pages/HomePage";
import { OrdersPage } from "@/modules/student/pages/OrdersPage";
import { StartOrderPage } from "@/modules/student/pages/StartOrderPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

const profile: Profile = {
  full_name: "Asha Raman", college_id: "c1", college_name: "Anna University", department: "CSE", year: 3,
  register_number: "21CS001", referral_code: "ASHA42",
};
const draft = { id: "new1", code: "UP-NEW001", status: "draft" } as OrderDetail;
const summary = (p: Partial<OrderSummary>): OrderSummary => ({
  id: "o1", code: "UP-AAA111", status: "printing", payment_status: "captured", created_at: "2026-11-20T04:30:00Z",
  slot_date: "2026-11-21", document_count: 2, total: "120.00", ...p,
});

/** Backend for the home page; `orders` lets each test choose what the student has. */
const homeApi = (orders: OrderSummary[]) => (url: string, init?: RequestInit) => {
  if (url.endsWith("/students/me/profile")) return { body: profile };
  if (url.endsWith("/orders") && init?.method === "POST") return { status: 201, body: draft };
  if (url.endsWith("/orders")) return { body: orders };
  if (url.endsWith("/colleges")) return { body: [{ id: "c1", name: "Anna University", city: "Chennai", security_cabin: "Gate 2 cabin", collection_instructions: null }] };
  if (url.includes("/colleges/c1/slots")) return { body: [] };
};

async function renderHome(orders: OrderSummary[] = []) {
  const calls = mockFetch(homeApi(orders));
  // HomePage expects the profile to be loaded already (StudentGate guarantees it in the app).
  const { useProfile } = await import("@/modules/student/api");
  function Loaded() {
    return useProfile().data ? <HomePage /> : null;
  }
  renderWithProviders(<Loaded />, { path: "/student", route: "/student", extraRoutes: [{ path: "/student/new/:id", text: "Wizard open" }] });
  await screen.findByRole("heading", { name: "Asha" });
  return calls;
}

describe("starting an order", () => {
  it("the Upload (FAB) page creates exactly one draft and opens the wizard", async () => {
    const calls = mockFetch((url, init) => (url.endsWith("/orders") && init?.method === "POST" ? { status: 201, body: draft } : undefined));
    renderWithProviders(<StartOrderPage />, { path: "/student/new", route: "/student/new", extraRoutes: [{ path: "/student/new/:id", text: "Wizard open" }] });
    expect(await screen.findByText("Wizard open")).toBeInTheDocument();
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
  });

  it("shows the reason and retries when the draft can't be created", async () => {
    let fail = true;
    mockFetch((url, init) => {
      if (!(url.endsWith("/orders") && init?.method === "POST")) return undefined;
      if (fail) { fail = false; return { status: 409, body: { detail: "Your college has no active slots" } }; }
      return { status: 201, body: draft };
    });
    renderWithProviders(<StartOrderPage />, { path: "/student/new", route: "/student/new", extraRoutes: [{ path: "/student/new/:id", text: "Wizard open" }] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your college has no active slots");
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Wizard open")).toBeInTheDocument();
  });

  it("the home hero's Upload button creates a draft and opens the wizard", async () => {
    const calls = await renderHome();
    await userEvent.click(screen.getByRole("button", { name: /Upload documents/ }));
    expect(await screen.findByText("Wizard open")).toBeInTheDocument();
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
  });
});

describe("home page", () => {
  it("greets the student and shows a designed empty state with no orders", async () => {
    await renderHome();
    expect(screen.getByText("Anna University")).toBeInTheDocument();
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(screen.getAllByText("No slots open right now").length).toBeGreaterThan(0);
  });

  it("tracks a live order and lists recent ones", async () => {
    await renderHome([summary({}), summary({ id: "o2", code: "UP-BBB222", status: "collected" })]);
    expect(await screen.findByText("Live order")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track order/ })).toHaveAttribute("href", "/student/orders/o1");
    expect(screen.getAllByText("UP-BBB222").length).toBeGreaterThan(0);
  });

  it("explains a service and starts an order from its sheet", async () => {
    await renderHome();
    await userEvent.click(screen.getByRole("button", { name: /Spiral binding/ }));
    expect(await screen.findByRole("dialog", { name: "Spiral binding" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Start an order/ }));
    expect(await screen.findByText("Wizard open")).toBeInTheDocument();
  });

  it("copies the student's real referral code", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByRole("button", { name: "Copy referral code" }));
    expect(await navigator.clipboard.readText()).toBe("ASHA42");
    expect(screen.getByRole("button", { name: "Copy referral code" })).toHaveTextContent("Copied");
  });
});

describe("orders page", () => {
  const list = [
    summary({}),
    summary({ id: "o2", code: "UP-BBB222", status: "collected" }),
    summary({ id: "o3", code: "UP-CCC333", status: "cancelled" }),
  ];

  it("filters by status chip and searches by code", async () => {
    mockFetch((url) => (url.endsWith("/orders") ? { body: list } : undefined));
    renderWithProviders(<OrdersPage />);
    expect(await screen.findByText("UP-AAA111")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Collected/ }));
    expect(screen.getByText("UP-BBB222")).toBeInTheDocument();
    expect(screen.queryByText("UP-AAA111")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /All/ }));
    await userEvent.type(screen.getByLabelText("Search orders"), "ccc");
    expect(screen.getByText("UP-CCC333")).toBeInTheDocument();
    expect(screen.queryByText("UP-BBB222")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search orders"));
    await userEvent.type(screen.getByLabelText("Search orders"), "zzz");
    expect(screen.getByText("No matching orders")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("UP-AAA111")).toBeInTheDocument();
  });
});

describe("upload step", () => {
  it("shows live per-file progress, then the uploaded document", async () => {
    let report: (f: number) => void = () => {};
    let finish: () => void = () => {};
    const api = await import("@/modules/student/api");
    vi.spyOn(api, "uploadDocumentWithProgress").mockImplementation((_o, _f, onProgress) => {
      report = onProgress;
      return new Promise((resolve) => { finish = () => resolve({} as never); });
    });
    mockFetch((url) => (url.endsWith("/orders/d1") ? { body: { ...draft, id: "d1", documents: [] } } : undefined));
    const { UploadStep } = await import("@/modules/student/features/new-order/UploadStep");
    const order = { ...draft, id: "d1", documents: [] } as OrderDetail;
    renderWithProviders(<UploadStep order={order} onNext={() => {}} />);

    await userEvent.upload(screen.getByLabelText(/Drop your files/), new File(["%PDF"], "notes.pdf", { type: "application/pdf" }));
    const bar = await screen.findByRole("progressbar", { name: "Uploading notes.pdf" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    act(() => report(0.6));
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
    act(() => finish());
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
  });

  it("rejects unsupported files before uploading", async () => {
    const api = await import("@/modules/student/api");
    const spy = vi.spyOn(api, "uploadDocumentWithProgress");
    mockFetch(() => undefined);
    const { UploadStep } = await import("@/modules/student/features/new-order/UploadStep");
    renderWithProviders(<UploadStep order={{ ...draft, documents: [] } as OrderDetail} onNext={() => {}} />);
    await userEvent.upload(screen.getByLabelText(/Drop your files/), new File(["x"], "virus.exe"), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("virus.exe: unsupported type");
    expect(spy).not.toHaveBeenCalled();
  });
});
