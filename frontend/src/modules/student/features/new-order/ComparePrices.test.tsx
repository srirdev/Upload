import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { OrderDetail, ShopOption } from "@/modules/student/api/types";
import { ComparePrices } from "@/modules/student/features/new-order/ComparePrices";
import { mockFetch, renderWithProviders } from "@/test/utils";

const order: OrderDetail = {
  id: "o1", code: "UP-ABC123", status: "draft", payment_status: "unpaid", created_at: "2026-11-20T04:30:00Z",
  college: { id: "c1", name: "Anna University", security_cabin: "Gate 2", collection_instructions: null },
  slot: null, binding: "spiral", cover_page: false, subject_name: null, subject_code: null, coupon_code: null,
  documents: [], quotation: null, chosen_shop: null, timeline: [], can_cancel: false, can_collect: false, shelf_photo_url: null,
};
const options: ShopOption[] = [
  { shop_id: "s2", shop_name: "Star Xerox", area: "Guindy", distance_km: "1.24", printing_amount: "40.00", binding_amount: "30.00", total: "95.00", chosen: false },
  { shop_id: null, shop_name: "Any available shop", area: null, distance_km: null, printing_amount: "50.00", binding_amount: "30.00", total: "105.00", chosen: true },
  { shop_id: "s3", shop_name: "Copy Corner", area: "Adyar", distance_km: null, printing_amount: "60.00", binding_amount: "30.00", total: "115.00", chosen: false },
];

describe("compare prices", () => {
  it("lists shops cheapest first and sends the chosen shop_id", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/orders/o1/shop-options")) return { body: options };
      if (url.endsWith("/orders/o1/shop") && init?.method === "PUT") return { body: { ...order, chosen_shop: { id: "s2", shop_name: "Star Xerox", area: "Guindy" } } };
    });
    renderWithProviders(<ComparePrices order={order} version="v1" />);

    const cards = await screen.findAllByRole("radio");
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("Star Xerox"), expect.stringContaining("Any available shop · standard price"), expect.stringContaining("Copy Corner"),
    ]);
    expect(within(cards[0]).getByText("Lowest price")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Guindy · 1.2 km to college")).toBeInTheDocument();
    expect(screen.getAllByText("Lowest price")).toHaveLength(1);
    expect(cards[1]).toHaveAttribute("aria-checked", "true");

    await userEvent.click(cards[0]);
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toMatch(/\/orders\/o1\/shop$/);
    expect(JSON.parse(String(put.init?.body))).toEqual({ shop_id: "s2" });
    // Options are refetched so the comparison reflects the new choice.
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/shop-options"))).toHaveLength(2));
  });

  it("sends null for the standard price option", async () => {
    const chosen = { ...order, chosen_shop: { id: "s2", shop_name: "Star Xerox", area: "Guindy" } };
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shop-options")) return { body: options };
      if (init?.method === "PUT") return { body: order };
    });
    renderWithProviders(<ComparePrices order={chosen} version="v1" />);
    await userEvent.click(await screen.findByRole("radio", { name: /Any available shop/ }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "PUT")!.init?.body))).toEqual({ shop_id: null });
  });

  it("shows the backend's reason when a shop can't take the order", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/shop-options")) return { body: options };
      if (init?.method === "PUT") return { status: 409, body: { detail: "That shop can't take this order right now. Choose another shop." } };
    });
    renderWithProviders(<ComparePrices order={order} version="v1" />);
    await userEvent.click(await screen.findByRole("radio", { name: /Copy Corner/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That shop can't take this order right now.");
  });

  it("explains why prices can't be compared yet", async () => {
    mockFetch((url) => (url.endsWith("/shop-options") ? { status: 422, body: { detail: "Enter the page count for notes.docx" } } : undefined));
    renderWithProviders(<ComparePrices order={order} version="v1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the page count for notes.docx");
  });
});
