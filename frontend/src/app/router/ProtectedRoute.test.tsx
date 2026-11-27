import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { renderWithProviders, signIn } from "@/test/utils";

const guarded = (role: "student" | "shop" | "rider" | "admin") => (
  <ProtectedRoute role={role}>
    <p>Secret {role} area</p>
  </ProtectedRoute>
);
const others = [
  { path: "/student/login", text: "Student sign in" },
  { path: "/shop", text: "Shop home" },
  { path: "/admin/login", text: "Admin sign in" },
];

describe("ProtectedRoute", () => {
  it("sends signed-out visitors to that portal's login", () => {
    renderWithProviders(guarded("student"), { extraRoutes: others, path: "/student" , route: "/student" });
    expect(screen.getByText("Student sign in")).toBeInTheDocument();
    expect(screen.queryByText(/Secret/)).not.toBeInTheDocument();
  });

  it("lets the right role in", () => {
    signIn("admin");
    renderWithProviders(guarded("admin"), { extraRoutes: others, path: "/admin", route: "/admin" });
    expect(screen.getByText("Secret admin area")).toBeInTheDocument();
  });

  it("each portal has its own sign-in: being signed in as a shop doesn't open the admin area", () => {
    signIn("shop");
    renderWithProviders(guarded("admin"), { extraRoutes: others, path: "/admin", route: "/admin" });
    expect(screen.getByText("Admin sign in")).toBeInTheDocument();
    expect(screen.queryByText(/Secret/)).not.toBeInTheDocument();
  });
});
