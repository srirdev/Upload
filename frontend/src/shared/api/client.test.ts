import { describe, expect, it } from "vitest";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/shared/api/authStore";
import { mockFetch, signIn } from "@/test/utils";

describe("api client", () => {
  it("sends the bearer token and JSON body", async () => {
    signIn("student");
    const calls = mockFetch(() => ({ body: { ok: true } }));
    await api("/orders", { method: "POST", json: { a: 1 } });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("refreshes an expired token once, even for parallel requests, and retries", async () => {
    signIn("student");
    let refreshes = 0;
    const calls = mockFetch((url, init) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes += 1;
        return { body: { access_token: "new", refresh_token: "r2", user: { id: "u1", mobile: "9876543210", role: "student" } } };
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return auth === "Bearer new" ? { body: { done: url } } : { status: 401, body: { detail: "expired" } };
    });
    const [a, b] = await Promise.all([api<{ done: string }>("/orders"), api<{ done: string }>("/notifications")]);
    expect(a.done).toContain("/orders");
    expect(b.done).toContain("/notifications");
    expect(refreshes).toBe(1);
    expect(useAuth.getState().refreshToken).toBe("r2");
    expect(calls.filter((c) => c.url.endsWith("/orders"))).toHaveLength(2); // original + retry
  });

  it("clears the session when the refresh token is rejected", async () => {
    signIn("student");
    mockFetch((url) => (url.endsWith("/auth/refresh") ? { status: 401, body: { detail: "Invalid refresh token" } } : { status: 401, body: { detail: "expired" } }));
    await expect(api("/orders")).rejects.toMatchObject({ status: 401 });
    expect(useAuth.getState().user).toBeNull();
  });

  it("raises ApiError with the server's message", async () => {
    mockFetch(() => ({ status: 409, body: { detail: "Printing has already started." } }));
    const err = (await api("/orders/1/cancel", { method: "POST" }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Printing has already started.");
    expect(err.status).toBe(409);
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch(() => ({ status: 204 }));
    await expect(api("/auth/logout", { method: "POST", json: {} })).resolves.toBeUndefined();
  });
});
