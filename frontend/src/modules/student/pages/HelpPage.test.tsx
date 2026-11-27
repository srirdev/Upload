import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Complaint, OrderSummary } from "@/modules/student/api/types";
import { HelpPage } from "@/modules/student/pages/HelpPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

const order: OrderSummary = {
  id: "o1", code: "UP-ABC123", status: "collected", payment_status: "captured", created_at: "2026-11-20T04:30:00Z",
  slot_date: "2026-11-21", document_count: 1, total: "120.00",
};
const ticket: Complaint = {
  id: "c1", order_id: "o1", order_code: "UP-ABC123", category: "damaged_binding", description: "Spiral came apart",
  photo_urls: ["https://files.test/a.jpg", "https://files.test/b.jpg"], status: "open", admin_response: null,
  refund_status: null, created_at: "2026-11-22T04:30:00Z",
};
const photo = (name: string) => new File(["x"], name, { type: "image/png" });

async function fillForm() {
  await screen.findByRole("option", { name: /UP-ABC123/ });
  await userEvent.selectOptions(screen.getByLabelText("Order"), "o1");
  await userEvent.click(screen.getByRole("radio", { name: "Damaged binding" }));
  await userEvent.type(screen.getByLabelText("Describe the issue"), "Binding came loose");
}

describe("HelpPage complaints", () => {
  it("sends every selected photo as a repeated `photos` field", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/orders")) return { body: [order] };
      if (url.endsWith("/students/complaints")) return init?.method === "POST" ? { status: 201, body: ticket } : { body: [] };
    });
    renderWithProviders(<HelpPage />);
    await fillForm();
    await userEvent.upload(screen.getByLabelText("Photos (optional)"), [photo("one.png"), photo("two.png")]);
    expect(screen.getByText("one.png")).toBeInTheDocument();
    expect(screen.getByText("two.png")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thanks, we've received your report.");
    const post = calls.find((c) => c.init?.method === "POST")!;
    const form = post.init!.body as FormData;
    expect(form.getAll("photos").map((f) => (f as File).name)).toEqual(["one.png", "two.png"]);
    expect(form.get("photo")).toBeNull();
  });

  it("caps attachments at three and lets one be removed", async () => {
    mockFetch((url) => {
      if (url.endsWith("/orders")) return { body: [order] };
      if (url.endsWith("/students/complaints")) return { body: [] };
    });
    renderWithProviders(<HelpPage />);
    await fillForm();
    await userEvent.upload(screen.getByLabelText("Photos (optional)"), ["1.png", "2.png", "3.png", "4.png"].map(photo));
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(3);
    expect(screen.queryByText("4.png")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Photos (optional)")).not.toBeInTheDocument(); // picker hidden at the limit

    await userEvent.click(screen.getByRole("button", { name: "Remove 2.png" }));
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.getByLabelText("Photos (optional)")).toBeInTheDocument();
  });

  it("shows the backend's error detail", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/orders")) return { body: [order] };
      if (url.endsWith("/students/complaints"))
        return init?.method === "POST" ? { status: 413, body: { detail: "Each photo must be 5 MB or smaller" } } : { body: [] };
    });
    renderWithProviders(<HelpPage />);
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Each photo must be 5 MB or smaller");
  });

  it("shows every evidence photo on a ticket", async () => {
    mockFetch((url) => {
      if (url.endsWith("/orders")) return { body: [order] };
      if (url.endsWith("/students/complaints")) return { body: [ticket] };
    });
    renderWithProviders(<HelpPage />);
    await waitFor(() => expect(screen.getAllByRole("img", { name: /for UP-ABC123/ })).toHaveLength(2));
  });
});
