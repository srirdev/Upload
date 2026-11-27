import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ShopOrderCard } from "@/modules/shop/components/ShopOrderCard";
import type { ShopOrder } from "@/modules/shop/api/types";
import { Toaster } from "@/shared/components/ui/toast";
import { mockFetch, renderWithProviders } from "@/test/utils";

const order: ShopOrder = {
  id: "o1", code: "UP-ABC123", status: "placed", college_name: "Sample College", delivery_at: "2026-11-28T04:30:00Z",
  documents: [{ id: "d1", filename: "notes.pdf", page_count: 4, copies: 2, paper_size: "A4", rules: [
    { page_from: 1, page_to: 1, color: "color", gsm: 100, sided: "single" },
    { page_from: 2, page_to: 4, color: "bw", gsm: 80, sided: "double" }] }],
  binding: "spiral", cover_page: true, subject_name: "Data Structures", subject_code: "CS3301", entitlement: "78.84",
  next_action: "accept", can_direct_delivery: false, direct_batch_id: null, otp_generated: false, assigned_at: null,
};

const withToasts = (ui: React.ReactElement) => renderWithProviders(<><Toaster />{ui}</>);

describe("ShopOrderCard", () => {
  it("shows print specs, binding, pages to print and the shop's entitlement", () => {
    renderWithProviders(<ShopOrderCard order={order} tab="new" />);
    expect(screen.getByText("UP-ABC123")).toBeInTheDocument();
    expect(screen.getByText("Pages 1–1 · Colour · 100 GSM · Single-sided")).toBeInTheDocument();
    expect(screen.getByText("Pages 2–4 · B&W · 80 GSM · Double-sided")).toBeInTheDocument();
    expect(screen.getByText("₹78.84")).toBeInTheDocument();
    expect(screen.getByText(/Data Structures \(CS3301\)/)).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument(); // 4 pages × 2 copies
    expect(screen.queryByRole("button", { name: /Download file/ })).not.toBeInTheDocument(); // locked until accepted
    expect(screen.getByText("Files unlock once you accept")).toBeInTheDocument();
  });

  it("shows orientation and the student's cover design when present", () => {
    renderWithProviders(
      <ShopOrderCard
        order={{
          ...order,
          documents: [{ ...order.documents[0]!, orientation: "landscape" }, { ...order.documents[0]!, id: "d2", filename: "auto.pdf", orientation: "auto" }],
          cover_template: "modern", cover_color: "maroon", cover_title: "Mini Project Report",
        }}
      />,
    );
    expect(screen.getAllByText("Landscape")).toHaveLength(1); // "auto" is omitted
    const cover = screen.getByRole("region", { name: "Cover page" });
    expect(within(cover).getByText("Mini Project Report")).toBeInTheDocument();
    expect(within(cover).getByText("Modern template")).toBeInTheDocument();
    expect(within(cover).getByText("Maroon")).toBeInTheDocument();
    expect(within(cover).getByText(/Data Structures \(CS3301\)/)).toBeInTheDocument();
  });

  it("still shows the subject on older orders without a cover design", () => {
    renderWithProviders(<ShopOrderCard order={order} />);
    const cover = screen.getByRole("region", { name: "Cover page" });
    expect(within(cover).queryByText(/template/)).not.toBeInTheDocument();
    expect(within(cover).getByText(/Data Structures \(CS3301\)/)).toBeInTheDocument();
  });

  it("requires a reason in the reject dialog before an order can be rejected", async () => {
    const calls = mockFetch((url) => (url.endsWith("/reject") ? { status: 204 } : undefined));
    withToasts(<ShopOrderCard order={order} tab="new" />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject order" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Reason for rejecting"), "Printer is down");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ reason: "Printer is down" });
    expect(await screen.findByText("Order UP-ABC123 rejected")).toBeInTheDocument();
  });

  it("accepts an order via the API and confirms with a toast", async () => {
    const calls = mockFetch((url) => (url.endsWith("/accept") ? { body: { ...order, next_action: "printing_done" } } : undefined));
    withToasts(<ShopOrderCard order={order} tab="new" />);
    await userEvent.click(screen.getByRole("button", { name: "Accept order" }));
    expect(calls[0].url).toContain("/shops/me/orders/o1/accept");
    expect(await screen.findByText("Order UP-ABC123 accepted")).toBeInTheDocument();
  });

  it("shows only the action the server says is next, and file downloads once accepted", () => {
    renderWithProviders(<ShopOrderCard order={{ ...order, status: "printing", next_action: "printing_done" }} tab="pending" />);
    expect(screen.getByRole("button", { name: "Mark printing done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept order" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download file/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cover page/ })).toBeInTheDocument();
  });

  it("generates and displays the handover code", async () => {
    mockFetch((url) => (url.endsWith("/handover-otp") ? { body: { code: "4821" } } : undefined));
    renderWithProviders(<ShopOrderCard order={{ ...order, status: "packing", next_action: "handover_otp" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate handover OTP" }));
    expect(await screen.findByLabelText("Handover code: 4 8 2 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate a new OTP" })).toBeInTheDocument();
  });
});
