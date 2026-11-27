import { api } from "@/shared/api/client";
import type { Role, TokenPair, User } from "@/shared/types/auth";

/** Mobile number or email + password. */
export const login = (identifier: string, password: string, role: Role) =>
  api<TokenPair>("/auth/login", { method: "POST", json: { identifier, password, role } });

/** Self sign-up for students, shops and riders (admins are created by operators). */
export const register = (body: { full_name: string; mobile: string; email: string; password: string; role: Exclude<Role, "admin"> }) =>
  api<TokenPair>("/auth/register", { method: "POST", json: body });

/** Emails a single-use reset link. `dev_reset_url` is only returned in development without email (DEV MOCK). */
export const forgotPassword = (email: string) =>
  api<{ message: string; dev_reset_url: string | null }>("/auth/password/forgot", { method: "POST", json: { email } });

export const resetPassword = (token: string, password: string) =>
  api<void>("/auth/password/reset", { method: "POST", json: { token, password } });

/** Signed-in change; signs out other devices and returns fresh tokens for this one. */
export const changePassword = (current_password: string, new_password: string) =>
  api<TokenPair>("/auth/password/change", { method: "POST", json: { current_password, new_password } });

export const logout = (refresh_token: string) => api<void>("/auth/logout", { method: "POST", json: { refresh_token } });

export interface DemoAccount {
  role: Role;
  mobile: string;
  email: string;
  name: string;
  password: string;
}

/** DEVELOPMENT ONLY: demo sign-ins (404 → none outside development). Never throws. */
export const fetchDemoAccounts = () => api<DemoAccount[]>("/auth/demo-accounts").catch(() => [] as DemoAccount[]);

export const fetchMe = () => api<User>("/auth/me");
