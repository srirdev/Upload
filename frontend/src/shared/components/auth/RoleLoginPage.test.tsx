import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChangePasswordButton } from "@/shared/components/auth/ChangePassword";
import { ResetPasswordPage } from "@/shared/components/auth/ResetPasswordPage";
import { RoleLoginPage } from "@/shared/components/auth/RoleLoginPage";
import { useAuth } from "@/shared/api/authStore";
import { mockFetch, renderWithProviders, signIn } from "@/test/utils";

const tokens = { access_token: "a", refresh_token: "r", user: { id: "1", full_name: "Asha Raman", mobile: "9876543210", role: "student" } };
const home = { path: "/student/login", route: "/student/login", extraRoutes: [{ path: "/student", text: "Student home" }] };

describe("RoleLoginPage sign in", () => {
  it("signs in with a phone number by default and validates without calling the API", async () => {
    const calls = mockFetch(() => undefined);
    renderWithProviders(<RoleLoginPage role="student" />);
    expect(screen.getByRole("radio", { name: "Phone number" })).toHaveAttribute("aria-checked", "true");
    await userEvent.type(screen.getByLabelText("Mobile number"), "12345");
    await userEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(await screen.findByText("Enter your 10-digit mobile number")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("signs in with a phone number and password", async () => {
    const calls = mockFetch((url) => (url.endsWith("/auth/login") ? { body: tokens } : undefined));
    renderWithProviders(<RoleLoginPage role="student" />, home);
    await userEvent.type(screen.getByLabelText("Mobile number"), "9876543210");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(await screen.findByText("Student home")).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ identifier: "9876543210", password: "correct-horse-1", role: "student" });
  });

  it("switches to email sign-in", async () => {
    const calls = mockFetch((url) => (url.endsWith("/auth/login") ? { body: tokens } : undefined));
    renderWithProviders(<RoleLoginPage role="student" />, home);
    await userEvent.click(screen.getByRole("radio", { name: "Email" }));
    await userEvent.type(screen.getByLabelText("Email address"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Email address"));
    await userEvent.type(screen.getByLabelText("Email address"), "asha@college.edu");
    await userEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(await screen.findByText("Student home")).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init?.body)).identifier).toBe("asha@college.edu");
  });

  it("shows the server's message when the password is wrong", async () => {
    mockFetch((url) => (url.endsWith("/auth/login") ? { status: 401, body: { detail: "Incorrect mobile number/email or password" } } : undefined));
    renderWithProviders(<RoleLoginPage role="shop" />);
    await userEvent.type(screen.getByLabelText("Mobile number"), "9876543210");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-one");
    await userEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect mobile number/email or password");
    expect(useAuth.getState().user).toBeNull();
  });

  it("offers a one-click demo account in development", async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith("/auth/demo-accounts")) {
        return { body: [
          { role: "student", mobile: "9000000101", email: "student@demo.upload", name: "Demo Student", password: "Demo@12345" },
          { role: "shop", mobile: "9000000102", email: "shop@demo.upload", name: "Demo Print Shop", password: "Demo@12345" },
        ] };
      }
      if (url.endsWith("/auth/login")) return { body: tokens };
    });
    renderWithProviders(<RoleLoginPage role="student" />, home);
    await userEvent.click(await screen.findByRole("button", { name: /Use demo account.*Demo Student/ }));
    expect(await screen.findByText("Student home")).toBeInTheDocument();
    const login = calls.find((c) => c.url.endsWith("/auth/login"))!;
    expect(JSON.parse(String(login.init?.body))).toEqual({ identifier: "9000000101", password: "Demo@12345", role: "student" });
  });

  it("shows no demo button outside development", async () => {
    mockFetch(() => undefined); // demo-accounts answers 404
    renderWithProviders(<RoleLoginPage role="student" />);
    await screen.findByRole("button", { name: /^Sign in/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /Use demo account/ })).not.toBeInTheDocument();
  });

  it("emails a reset link from 'Forgot password?' (and shows the dev link when there is no mail server)", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/auth/password/forgot")
        ? { status: 202, body: { message: "If an account uses this email, we've sent a link.", dev_reset_url: "http://localhost:5173/student/reset-password?token=abc" } }
        : undefined,
    );
    renderWithProviders(<RoleLoginPage role="student" />);
    await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    await userEvent.type(await screen.findByLabelText("Email address"), "asha@college.edu");
    await userEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));
    expect(await screen.findByText(/we've sent a link/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the reset link" })).toHaveAttribute("href", expect.stringContaining("token=abc"));
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ email: "asha@college.edu" });
  });

  it("has no OTP step and no self sign-up for admins", () => {
    mockFetch(() => undefined);
    renderWithProviders(<RoleLoginPage role="admin" />);
    expect(screen.queryByText(/OTP/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create an account/ })).not.toBeInTheDocument();
    expect(screen.getByText(/created by the operations team/)).toBeInTheDocument();
  });
});

describe("RoleLoginPage sign up", () => {
  it("needs full name, phone, email and a confirmed password", async () => {
    const calls = mockFetch((url) => (url.endsWith("/auth/register") ? { status: 201, body: tokens } : undefined));
    renderWithProviders(<RoleLoginPage role="student" />, home);
    await userEvent.click(screen.getByRole("button", { name: "New here? Create an account" }));
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Full name"), "Asha Raman");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9876543210");
    await userEvent.type(screen.getByLabelText("Email address"), "asha@college.edu");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Confirm password"), "correct-horse-2");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText("Confirm password"));
    await userEvent.type(screen.getByLabelText("Confirm password"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByText("Student home")).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      full_name: "Asha Raman", mobile: "9876543210", email: "asha@college.edu", password: "correct-horse-1", role: "student",
    });
  });

  it("shows the server's message when the number is taken", async () => {
    mockFetch((url) => (url.endsWith("/auth/register") ? { status: 409, body: { detail: "This mobile number is already registered. Sign in instead." } } : undefined));
    renderWithProviders(<RoleLoginPage role="rider" />);
    await userEvent.click(screen.getByRole("button", { name: "New here? Create an account" }));
    await userEvent.type(screen.getByLabelText("Full name"), "Kumar");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9876543210");
    await userEvent.type(screen.getByLabelText("Email address"), "kumar@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("Confirm password"), "correct-horse-1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
  });
});

describe("Password reset and change", () => {
  it("sets a new password from an emailed link", async () => {
    const calls = mockFetch((url) => (url.endsWith("/auth/password/reset") ? { status: 204 } : undefined));
    renderWithProviders(<ResetPasswordPage role="shop" />, { path: "/shop/reset-password", route: "/shop/reset-password?token=tok-123" });
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass-1");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pass-1");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ token: "tok-123", password: "brand-new-pass-1" });
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/shop/login");
  });

  it("explains an expired link", async () => {
    mockFetch(() => ({ status: 400, body: { detail: "This reset link is invalid or has expired. Request a new one." } }));
    renderWithProviders(<ResetPasswordPage role="student" />, { path: "/student/reset-password", route: "/student/reset-password?token=old" });
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass-1");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pass-1");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  });

  it("changes the password while signed in and keeps this device signed in", async () => {
    signIn("rider");
    const fresh = { ...tokens, access_token: "new-access", user: { ...tokens.user, role: "rider" } };
    const calls = mockFetch((url) => (url.endsWith("/auth/password/change") ? { body: fresh } : undefined));
    renderWithProviders(<ChangePasswordButton />);
    await userEvent.click(screen.getByRole("button", { name: /Change password/ }));
    await userEvent.type(await screen.findByLabelText("Current password"), "correct-horse-1");
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass-1");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pass-1");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(useAuth.getState().accessToken).toBe("new-access"));
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ current_password: "correct-horse-1", new_password: "brand-new-pass-1" });
  });
});
