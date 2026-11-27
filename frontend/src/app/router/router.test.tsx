import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { routes } from "@/app/router";
import { RouteErrorPage } from "@/app/router/RouteErrorPage";

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );

describe("app router", () => {
  it.each([
    ["/student/login", "Student sign in"],
    ["/rider/login", "Delivery Partner sign in"],
    ["/shop/login", "Printing Shop sign in"],
    ["/admin/login", "Admin sign in"],
  ])("lazy-loads the portal for %s", async (path, text) => {
    renderAt(path);
    expect(await screen.findByText(text, {}, { timeout: 10000 })).toBeInTheDocument();
  });

  it("sends signed-out visitors of a protected page to that portal's login", async () => {
    renderAt("/shop");
    expect(await screen.findByText("Printing Shop sign in", {}, { timeout: 10000 })).toBeInTheDocument();
  });

  it("shows a branded error page instead of the router's developer screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("destroy is not a function");
    };
    const router = createMemoryRouter([{ errorElement: <RouteErrorPage />, children: [{ path: "/", element: <Boom /> }] }]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Your orders and uploads are safe/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload/ })).toBeInTheDocument();
  });
});
