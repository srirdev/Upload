import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useAuth } from "@/shared/api/authStore";
import { PortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { renderWithProviders, signIn } from "@/test/utils";

describe("PortalSwitcher", () => {
  it("lists all four portals with their sign-in status and opens the right page", async () => {
    signIn("student");
    useAuth.setState((s) => ({
      sessions: { ...s.sessions, shop: { accessToken: "x", refreshToken: "y", user: { id: "s", full_name: "Ravi Kumar", mobile: "9111111111", role: "shop" } } },
    }));
    renderWithProviders(<PortalSwitcher />, {
      route: "/student", path: "/student",
      extraRoutes: [{ path: "/shop", text: "Shop home" }, { path: "/rider/login", text: "Rider sign in page" }],
    });
    await userEvent.click(screen.getByRole("button", { name: /Switch portal/ }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    expect(screen.getByRole("menuitem", { name: /Printing Shop.*Signed in · Ravi Kumar/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delivery Partner.*Not signed in/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Delivery Partner/ }));
    expect(await screen.findByText("Rider sign in page")).toBeInTheDocument();
  });
});
