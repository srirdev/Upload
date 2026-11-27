import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Earnings, HistoryItem } from "@/modules/rider/api/types";
import { EarningsPage } from "@/modules/rider/pages/EarningsPage";
import { HistoryPage } from "@/modules/rider/pages/HistoryPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

const now = new Date().toISOString();
const history: HistoryItem[] = [
  { id: "h1", code: "B-1", completed_at: now, status: "completed", packet_count: 3, payout: "90.00", shelf_photo_url: "https://files.test/p1.jpg", settled: false },
  { id: "h2", code: "B-2", completed_at: now, status: "completed", packet_count: 1, payout: "60.00", shelf_photo_url: null, settled: true },
  { id: "h3", code: "B-3", completed_at: now, status: "cancelled", packet_count: 0, payout: null, shelf_photo_url: null, settled: false },
];
const earnings: Earnings = {
  today: "150.00", this_week: "150.00", unsettled: "90.00",
  last_trip: { base_fee: "50.00", extra_shop_fees: "10.00", packet_bonus: "30.00", total: "90.00" },
  payouts: [{ id: "p1", period_start: now, period_end: now, batch_count: 1, amount: "60.00", status: "paid", upi_reference: "UTR123" }],
};

const api = (url: string) => {
  if (url.endsWith("/riders/me/earnings")) return { body: earnings };
  if (url.endsWith("/riders/me/history")) return { body: history };
};

describe("EarningsPage", () => {
  it("shows real totals, the last trip breakdown and payouts", async () => {
    mockFetch(api);
    renderWithProviders(<EarningsPage />);
    expect(await screen.findAllByText("₹150.00")).toHaveLength(2); // today + this week
    expect(screen.getByText("Trip total")).toBeInTheDocument();
    expect(screen.getByText(/UPI ref UTR123/)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("derives performance from run history", async () => {
    mockFetch(api);
    renderWithProviders(<EarningsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Performance" }));
    expect(await screen.findByText("Runs completed")).toBeInTheDocument();
    expect(screen.getByText("1 closed empty")).toBeInTheDocument();
    expect(screen.getByText("2.0 per run")).toBeInTheDocument(); // 4 packets over 2 completed runs
    expect(screen.getByText("₹75")).toBeInTheDocument(); // (90 + 60) / 2
  });
});

describe("HistoryPage", () => {
  it("filters runs and searches by batch code", async () => {
    mockFetch(api);
    renderWithProviders(<HistoryPage />);
    expect(await screen.findByText("B-1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Closed empty/ }));
    expect(screen.getByText("B-3")).toBeInTheDocument();
    expect(screen.queryByText("B-1")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /All/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search by batch code" }), "B-2");
    expect(screen.getByText("B-2")).toBeInTheDocument();
    expect(screen.queryByText("B-1")).not.toBeInTheDocument();
  });

  it("opens a shelf photo", async () => {
    mockFetch(api);
    renderWithProviders(<HistoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "View shelf photo for B-1" }));
    expect(await screen.findByRole("img", { name: "Shelf photo for batch B-1" })).toHaveAttribute("src", "https://files.test/p1.jpg");
  });
});
