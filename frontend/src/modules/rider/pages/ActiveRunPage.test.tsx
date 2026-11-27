import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Rider, Run } from "@/modules/rider/api/types";
import { AvailabilityToggle } from "@/modules/rider/components/AvailabilityToggle";
import { ActiveRunPage } from "@/modules/rider/pages/ActiveRunPage";
import { Toaster } from "@/shared/components/ui/toast";
import { mockFetch, renderWithProviders } from "@/test/utils";

vi.mock("@/shared/components/map", () => ({
  MapView: () => <div data-testid="map" />,
  coords: (lat: unknown, lng: unknown) => (lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) }),
}));

const rider: Rider = {
  id: "r1", full_name: "Ravi Kumar", base_area: "Guindy", vehicle_number: "TN01AB1234", upi_id: "ravi@upi",
  kyc_status: "approved", kyc_note: null, has_dl: true, has_rc: true, is_online: false,
};

const baseRun: Run = {
  id: "b1", code: "B-1001", mode: "consolidated", status: "offered",
  college: { name: "Anna University", security_cabin: "Main gate cabin", drop_instructions: null, maps_url: null, latitude: 13.01, longitude: 80.23 },
  slot: { label: "Evening", delivery_at: new Date(Date.now() + 3_600_000).toISOString() },
  shop_count: 1, packet_count: 2, route_distance_km: "3.4", guaranteed_payout: "80.00",
  shops: [{
    shop_id: "s1", shop_name: "Star Xerox", area: "Guindy", landmark: null, maps_url: "https://maps.example/s1",
    latitude: 13.0, longitude: 80.2, arrived_at: null, not_ready_available_at: null, can_mark_not_ready: false,
    orders: [
      { order_id: "o1", code: "UP-11", status: "pending", packed: true, code_ready: true },
      { order_id: "o2", code: "UP-12", status: "pending", packed: false, code_ready: false },
    ],
  }],
  can_depart: false, can_close_empty: false, shelf_photo_count: 0,
};

const withToasts = (ui: React.ReactNode) => <>{ui}<Toaster /></>;

describe("availability toggle", () => {
  it("goes online via the API and reflects the new state", async () => {
    let online = false;
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/riders/me/availability")) {
        online = JSON.parse(String(init?.body)).is_online;
        return { body: { ...rider, is_online: online } };
      }
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: online } };
      if (url.endsWith("/riders/me/run")) return { body: null };
    });
    renderWithProviders(<AvailabilityToggle />);
    const toggle = await screen.findByRole("switch", { name: "Available for deliveries" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);

    const put = calls.find((c) => c.url.endsWith("/riders/me/availability"))!;
    expect(put.init?.method).toBe("PUT");
    expect(JSON.parse(String(put.init?.body))).toEqual({ is_online: true });
    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Available for deliveries" })).toHaveAttribute("aria-checked", "true");
  });

  it("toasts why a rider can't go offline mid-run", async () => {
    mockFetch((url) => {
      if (url.endsWith("/riders/me/availability")) return { status: 409, body: { detail: "Finish your current run before going offline" } };
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: true } };
    });
    renderWithProviders(withToasts(<AvailabilityToggle />));
    await userEvent.click(await screen.findByRole("switch", { name: "Available for deliveries" }));
    expect(await screen.findByText("Finish your current run before going offline")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Available for deliveries" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("ActiveRunPage", () => {
  it("prompts an offline rider to go online", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/riders/me/availability")) return { body: { ...rider, is_online: JSON.parse(String(init?.body)).is_online } };
      if (url.endsWith("/riders/me")) return { body: rider };
      if (url.endsWith("/riders/me/run")) return { body: null };
      if (url.endsWith("/riders/me/earnings")) return { body: { today: "0.00", this_week: "0.00", unsettled: "0.00", last_trip: null, payouts: [] } };
    });
    renderWithProviders(<ActiveRunPage />);
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go online" }));
    expect(calls.some((c) => c.url.endsWith("/riders/me/availability") && c.init?.method === "PUT")).toBe(true);
  });

  it("accepts an offered run", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/delivery/batches/b1/accept") && init?.method === "POST") return { body: { ...baseRun, status: "accepted" } };
      if (url.endsWith("/riders/me/run")) return { body: baseRun };
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: true } };
      return { body: [] };
    });
    renderWithProviders(withToasts(<ActiveRunPage />));
    expect(await screen.findByText("New run offer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(calls.some((c) => c.url.endsWith("/delivery/batches/b1/accept"))).toBe(true);
    expect(await screen.findByText("Pickup checklist")).toBeInTheDocument();
  });

  it("asks for confirmation before declining", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/delivery/batches/b1/decline") && init?.method === "POST") return { status: 204 };
      if (url.endsWith("/riders/me/run")) return { body: baseRun };
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: true } };
      return { body: [] };
    });
    renderWithProviders(<ActiveRunPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(calls.some((c) => c.url.includes("/decline"))).toBe(false);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline run" }));
    expect(calls.some((c) => c.url.endsWith("/delivery/batches/b1/decline"))).toBe(true);
  });

  it("verifies a packet's 4-digit handover code at the shop", async () => {
    const atShop: Run = { ...baseRun, status: "accepted", shops: [{ ...baseRun.shops[0]!, arrived_at: new Date().toISOString() }] };
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/delivery/batches/b1/pickup") && init?.method === "POST") {
        return { body: { ...atShop, shops: [{ ...atShop.shops[0]!, orders: [{ ...atShop.shops[0]!.orders[0]!, status: "picked_up" }, atShop.shops[0]!.orders[1]!] }] } };
      }
      if (url.endsWith("/riders/me/run")) return { body: atShop };
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: true } };
      return { body: [] };
    });
    renderWithProviders(withToasts(<ActiveRunPage />));
    const first = await screen.findByLabelText("Handover code for UP-11 digit 1");
    await userEvent.click(first);
    await userEvent.keyboard("4821");

    const pickup = calls.find((c) => c.url.endsWith("/delivery/batches/b1/pickup"))!;
    expect(JSON.parse(String(pickup.init?.body))).toEqual({ order_id: "o1", code: "4821" });
    expect(await screen.findByText("Packet UP-11 collected")).toBeInTheDocument();
    // The second packet has no code yet: no code entry for it.
    expect(screen.queryByLabelText("Handover code for UP-12 digit 1")).not.toBeInTheDocument();
  });

  it("shows the server's message when a handover code is wrong", async () => {
    const atShop: Run = { ...baseRun, status: "accepted", shops: [{ ...baseRun.shops[0]!, arrived_at: new Date().toISOString() }] };
    mockFetch((url, init) => {
      if (url.endsWith("/delivery/batches/b1/pickup") && init?.method === "POST") return { status: 400, body: { detail: "Incorrect code" } };
      if (url.endsWith("/riders/me/run")) return { body: atShop };
      if (url.endsWith("/riders/me")) return { body: { ...rider, is_online: true } };
      return { body: [] };
    });
    renderWithProviders(<ActiveRunPage />);
    await userEvent.click(await screen.findByLabelText("Handover code for UP-11 digit 1"));
    await userEvent.keyboard("0000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code");
  });
});
