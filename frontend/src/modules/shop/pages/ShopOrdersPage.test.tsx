import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Dashboard, Shop, ShopOrder } from "@/modules/shop/api/types";
import { ShopOrdersPage } from "@/modules/shop/pages/ShopOrdersPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

const shop: Shop = {
  id: "s1", shop_name: "Star Xerox", owner_name: "Mani", area: "Guindy", landmark: null, latitude: "13.0", longitude: "80.2",
  upi_id: "star@upi", status: "approved", rejection_reason: null, is_open: true, services: ["print_a4_bw"],
};
const dash: Dashboard = { is_open: true, orders_today: 5, new_orders: 2, pending_orders: 1, weekly_earnings: "640.00", total_earnings: "8120.50" };
const mk = (id: string, code: string, college: string, status = "placed", next_action: ShopOrder["next_action"] = "accept"): ShopOrder => ({
  id, code, status, college_name: college, delivery_at: null, documents: [], binding: "none", cover_page: false,
  subject_name: null, subject_code: null, entitlement: "40.00", next_action, can_direct_delivery: false,
  direct_batch_id: null, otp_generated: false, assigned_at: null,
});
const lists: Record<string, ShopOrder[]> = {
  new: [mk("a", "UP-AAA111", "Anna University"), mk("b", "UP-BBB222", "IIT Madras")],
  pending: [mk("c", "UP-CCC333", "Anna University", "packing", "handover_otp")],
  finished: [],
};

describe("ShopOrdersPage", () => {
  it("shows real counters, the pipeline and filters orders by search", async () => {
    mockFetch((url) => {
      if (url.endsWith("/shops/me/dashboard")) return { body: dash };
      const tab = url.match(/tab=(\w+)/)?.[1];
      if (tab) return { body: lists[tab] };
      if (url.endsWith("/shops/me")) return { body: shop };
    });
    renderWithProviders(<ShopOrdersPage />);

    expect(await screen.findByRole("heading", { name: "Star Xerox" })).toBeInTheDocument();
    expect(await screen.findByText("₹640.00")).toBeInTheDocument();
    expect(screen.getByText("₹8120.50")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /1\s*Ready for handover/ })).toBeInTheDocument();

    expect(await screen.findByText("UP-AAA111")).toBeInTheDocument();
    expect(screen.getByText("UP-BBB222")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search orders"), "iit");
    expect(screen.queryByText("UP-AAA111")).not.toBeInTheDocument();
    expect(screen.getByText("UP-BBB222")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search orders"));
    await userEvent.click(screen.getByRole("button", { name: /Ready for handover/ }));
    expect(await screen.findByText("UP-CCC333")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");
  });
});
