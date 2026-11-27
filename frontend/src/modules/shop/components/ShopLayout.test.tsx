import { act, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Shop, ShopOrder } from "@/modules/shop/api/types";
import { OpenToggle, ShopLayout, useNewOrderAlerts } from "@/modules/shop/components/ShopLayout";
import { Toaster } from "@/shared/components/ui/toast";
import { mockFetch, renderWithProviders } from "@/test/utils";

const shop: Shop = {
  id: "s1", shop_name: "Star Xerox", owner_name: "Mani", area: "Guindy", landmark: null, latitude: "13.0", longitude: "80.2",
  upi_id: "star@upi", status: "approved", rejection_reason: null, is_open: true, services: ["print_a4_bw"],
};
const mk = (id: string, code: string): ShopOrder => ({
  id, code, status: "placed", college_name: "Sample College", delivery_at: null, documents: [], binding: "none",
  cover_page: false, subject_name: null, subject_code: null, entitlement: "40.00", next_action: "accept",
  can_direct_delivery: false, direct_batch_id: null, otp_generated: false, assigned_at: null,
});

describe("new order alerts", () => {
  it("ignores orders present on first load and reports only ones that arrive later", () => {
    const notify = vi.fn();
    const { rerender } = renderHook(({ orders }) => useNewOrderAlerts(orders, notify), {
      initialProps: { orders: undefined as ShopOrder[] | undefined },
    });
    rerender({ orders: [mk("a", "UP-A")] });
    expect(notify).not.toHaveBeenCalled(); // already waiting when the portal opened

    rerender({ orders: [mk("b", "UP-B"), mk("a", "UP-A")] });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0].map((o: ShopOrder) => o.code)).toEqual(["UP-B"]);

    rerender({ orders: [mk("b", "UP-B")] }); // an order leaving the list is not "new"
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("badges the Orders nav item with the number of new orders", async () => {
    mockFetch((url) => {
      if (url.includes("/shops/me/orders?tab=new")) return { body: [mk("a", "UP-A"), mk("b", "UP-B")] };
      if (url.endsWith("/shops/me")) return { body: shop };
    });
    renderWithProviders(<ShopLayout />);
    expect(await screen.findByRole("link", { name: "2 new orders" })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    expect(within(nav).getByRole("link", { name: /Orders/ })).toHaveTextContent("2");
  });
});

describe("open/closed toggle", () => {
  it("closes the shop and confirms with a toast", async () => {
    let current = shop; // the server remembers the new state, so the post-toggle refetch agrees
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shops/me/open")) return { body: (current = { ...shop, is_open: JSON.parse(String(init?.body)).is_open }) };
      if (url.endsWith("/shops/me")) return { body: current };
      if (url.includes("/shops/me/")) return { body: [] }; // invalidated lists/dashboard refetch
    });
    renderWithProviders(<><Toaster /><OpenToggle /></>);
    const toggle = await screen.findByRole("switch", { name: "Accepting orders" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await act(() => userEvent.click(toggle));
    const put = calls.find((c) => c.url.endsWith("/shops/me/open"))!;
    expect(put.init?.method).toBe("PUT");
    expect(JSON.parse(String(put.init?.body))).toEqual({ is_open: false });
    expect(await screen.findByText("Shop closed")).toBeInTheDocument();
    expect(await screen.findByText("Closed")).toBeInTheDocument();
  });
});
