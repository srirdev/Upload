import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ComplaintDetail, ComplaintRow } from "@/modules/admin/api/types";
import { ComplaintsTab } from "@/modules/admin/components/ComplaintsTab";
import { mockFetch, renderWithProviders } from "@/test/utils";

const row: ComplaintRow = {
  id: "c1", order_id: "o1", order_code: "UP-ABC123", student_name: "Asha", category: "missing_pages", status: "resolved",
  created_at: "2026-11-22T04:30:00Z",
};
const detail: ComplaintDetail = {
  id: "c1", category: "missing_pages", description: "Pages 4-6 missing", status: "resolved", admin_response: "Reprinted",
  created_at: "2026-11-22T04:30:00Z", resolved_at: "2026-11-23T06:00:00Z",
  evidence_photo_urls: ["https://files.test/1.jpg", "https://files.test/2.jpg", "https://files.test/3.jpg"],
  shelf_photo_urls: [], order: { id: "o1", code: "UP-ABC123", status: "collected", payment_status: "captured", total: "120.00" },
  student: { name: "Asha" }, custody: [], refunds: [], late_refund_percent: "20",
};

describe("ComplaintsTab", () => {
  it("shows every student evidence photo and when the complaint was resolved", async () => {
    mockFetch((url) => {
      if (url.endsWith("/admin/complaints")) return { body: [row] };
      if (url.endsWith("/admin/complaints/c1")) return { body: detail };
    });
    renderWithProviders(<ComplaintsTab />);
    await userEvent.click(await screen.findByText("UP-ABC123"));
    expect(await screen.findAllByRole("img", { name: /^Student photo/ })).toHaveLength(3);
    expect(screen.getByText(/^Resolved /)).toBeInTheDocument();
    expect(screen.getByText("No shelf photo on record.")).toBeInTheDocument();
  });

  it("says so when the student attached no photos", async () => {
    mockFetch((url) => {
      if (url.endsWith("/admin/complaints")) return { body: [{ ...row, status: "open" }] };
      if (url.endsWith("/admin/complaints/c1")) return { body: { ...detail, status: "open", resolved_at: null, evidence_photo_urls: [] } };
    });
    renderWithProviders(<ComplaintsTab />);
    await userEvent.click(await screen.findByText("UP-ABC123"));
    expect(await screen.findByText("No photo attached.")).toBeInTheDocument();
    expect(screen.queryByText(/^Resolved /)).not.toBeInTheDocument();
  });
});
