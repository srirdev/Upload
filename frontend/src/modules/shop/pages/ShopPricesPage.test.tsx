import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { RateCard } from "@/modules/shop/api/types";
import { ShopPricesPage } from "@/modules/shop/pages/ShopPricesPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

const card: RateCard = {
  rates: [
    { paper_size: "A4", gsm: 80, color: "bw", sided: "single", price_per_page: "1.00" },
    { paper_size: "A4", gsm: 80, color: "bw", sided: "double", price_per_page: "1.50" },
    { paper_size: "A4", gsm: 80, color: "color", sided: "single", price_per_page: "8.00" },
  ],
  bindings: [{ binding: "spiral", price: "30.00" }, { binding: "hard", price: "120.00" }],
};
/** The page also shows the services card (shop + catalogue). */
const otherShopCalls = (url: string) => {
  if (url.endsWith("/shops/services")) return { body: [{ code: "print_a4_bw", category: "print", label: "A4 black & white printing" }] };
  if (url.endsWith("/shops/me")) return { body: { id: "s1", shop_name: "Star Xerox", owner_name: "Mani", area: "Guindy", landmark: null,
    latitude: "13.0", longitude: "80.2", upi_id: null, status: "approved", rejection_reason: null, is_open: true, services: ["print_a4_bw"] } };
};
const A4_BW_80_SINGLE = "A4 Black & white 80 GSM Single-sided price per page";

describe("shop rate card", () => {
  it("loads the card and saves an edited price", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shops/me/rate-card")) return { body: init?.method === "PUT" ? JSON.parse(String(init.body)) : card };
      return otherShopCalls(url);
    });
    renderWithProviders(<ShopPricesPage />);
    const input = await screen.findByLabelText(A4_BW_80_SINGLE);
    expect(input).toHaveValue("1.00");
    expect(screen.getByLabelText("Spiral binding price")).toHaveValue("30.00");
    expect(screen.getByRole("button", { name: "Save prices" })).toBeDisabled(); // nothing changed yet

    await userEvent.clear(input);
    await userEvent.type(input, "1.25");
    await userEvent.clear(screen.getByLabelText("Hard binding price"));
    await userEvent.type(screen.getByLabelText("Hard binding price"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Save prices" }));

    expect(await screen.findByText("Prices saved")).toBeInTheDocument();
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(JSON.parse(String(put.init?.body))).toEqual({
      rates: [{ ...card.rates[0], price_per_page: "1.25" }, card.rates[1], card.rates[2]],
      bindings: [card.bindings[0], { binding: "hard", price: "100" }],
    });
  });

  it("blocks negative prices and shows the backend's error", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shops/me/rate-card"))
        return init?.method === "PUT" ? { status: 422, body: { detail: "Price per page must be at most 1000" } } : { body: card };
      return otherShopCalls(url);
    });
    renderWithProviders(<ShopPricesPage />);
    const input = await screen.findByLabelText(A4_BW_80_SINGLE);
    await userEvent.clear(input);
    await userEvent.type(input, "-1");
    expect(screen.getByRole("alert")).toHaveTextContent("0 or more");
    expect(screen.getByRole("button", { name: "Save prices" })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "5000");
    await userEvent.click(screen.getByRole("button", { name: "Save prices" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Price per page must be at most 1000");
    await waitFor(() => expect(calls.filter((c) => c.init?.method === "PUT")).toHaveLength(1));
  });
});
