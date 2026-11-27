import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Shop, ShopService } from "@/modules/shop/api/types";
import { ServicesCard } from "@/modules/shop/components/ShopServices";
import { ShopRegisterPage } from "@/modules/shop/pages/ShopRegisterPage";
import { mockFetch, renderWithProviders } from "@/test/utils";

// The register page previews the pin on a Leaflet map; jsdom cannot render it.
vi.mock("@/shared/components/map", () => ({
  MapView: () => <div data-testid="map" />,
  coords: (lat: unknown, lng: unknown) => (lat && lng ? { lat: Number(lat), lng: Number(lng) } : null),
}));

const catalogue: ShopService[] = [
  { code: "binding_calico", category: "binding", label: "Calico binding" },
  { code: "binding_hard", category: "binding", label: "Hard binding" },
  { code: "binding_soft", category: "binding", label: "Soft binding" },
  { code: "binding_spiral", category: "binding", label: "Spiral binding" },
  { code: "print_a3_bw", category: "print", label: "A3 black & white printing" },
  { code: "print_a3_color", category: "print", label: "A3 colour printing" },
  { code: "print_a4_bw", category: "print", label: "A4 black & white printing" },
  { code: "print_a4_color", category: "print", label: "A4 colour printing" },
];
const PRINT = catalogue.filter((s) => s.category === "print");

const shop: Shop = {
  id: "s1", shop_name: "Star Xerox", owner_name: "Mani", area: "Guindy", landmark: null, latitude: "13.0", longitude: "80.2",
  upi_id: "star@upi", status: "approved", rejection_reason: null, is_open: true, services: ["print_a4_bw", "binding_spiral"],
};

async function fillRegistration() {
  const type = (id: string, v: string) => userEvent.type(document.getElementById(id)!, v);
  await type("shop_name", "Star Xerox");
  await type("owner_name", "Mani");
  await type("area", "Guindy");
  await type("latitude", "13.0108");
  await type("longitude", "80.2354");
  await type("upi_id", "star@upi");
  await userEvent.click(screen.getByRole("checkbox", { name: /partner terms/ }));
}

describe("shop services", () => {
  it("registers with all services checked by default, minus the ones unticked", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shops/services")) return { body: catalogue };
      if (url.endsWith("/shops/me") && init?.method === "POST") return { status: 201, body: { ...shop, status: "pending" } };
    });
    renderWithProviders(<ShopRegisterPage />);
    const a3Colour = await screen.findByRole("checkbox", { name: "A3 colour printing" });
    expect(screen.getAllByRole("checkbox", { name: /printing|binding/ }).every((c) => (c as HTMLInputElement).checked)).toBe(true);

    await userEvent.click(a3Colour);
    await userEvent.click(screen.getByRole("checkbox", { name: "Hard binding" }));
    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    const post = calls.find((c) => c.init?.method === "POST")!;
    const sent: string[] = JSON.parse(String(post.init?.body)).services;
    expect(sent.sort()).toEqual(catalogue.map((s) => s.code).filter((c) => c !== "print_a3_color" && c !== "binding_hard").sort());
  });

  it("blocks registration until a printing service is selected", async () => {
    const calls = mockFetch((url) => (url.endsWith("/shops/services") ? { body: catalogue } : undefined));
    renderWithProviders(<ShopRegisterPage />);
    await screen.findByRole("checkbox", { name: "A4 colour printing" });
    for (const s of PRINT) await userEvent.click(screen.getByRole("checkbox", { name: s.label }));
    expect(screen.getByText("Keep at least one printing service selected.")).toBeInTheDocument();

    await fillRegistration();
    await userEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("lets a registered shop edit its services", async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/shops/services")) return { body: catalogue };
      if (url.endsWith("/shops/me/services")) return { body: { ...shop, services: JSON.parse(String(init?.body)).services } };
      if (url.endsWith("/shops/me")) return { body: shop };
    });
    renderWithProviders(<ServicesCard />);
    expect(await screen.findByText("A4 black & white printing")).toBeInTheDocument();
    expect(screen.getByText(/only sent to shops that offer everything/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit services" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Hard binding" }));
    await userEvent.click(screen.getByRole("button", { name: "Save services" }));

    const put = calls.find((c) => c.url.endsWith("/shops/me/services"))!;
    expect(put.init?.method).toBe("PUT");
    expect(JSON.parse(String(put.init?.body))).toEqual({ services: ["print_a4_bw", "binding_spiral", "binding_hard"] });
    expect(await screen.findByText("Services saved")).toBeInTheDocument();
    expect(screen.getByText("Hard binding")).toBeInTheDocument();
  });
});
