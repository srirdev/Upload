import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { useAuth } from "@/shared/api/authStore";
import type { Role } from "@/shared/types/auth";

/** Render inside a router and query client; `routes` lets a test inspect where navigation ended up. */
export function renderWithProviders(ui: ReactElement, { route = "/", path = "*", extraRoutes = [] as { path: string; text: string }[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes.map((r) => <Route key={r.path} path={r.path} element={<p>{r.text}</p>} />)}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function signIn(role: Role) {
  const user = { id: "u1", mobile: "9876543210", role };
  useAuth.setState({
    sessions: { [role]: { accessToken: "access", refreshToken: "refresh", user } },
    current: role,
    accessToken: "access",
    refreshToken: "refresh",
    user,
  });
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined;

/** Stubs fetch with a per-test router; unmatched requests fail loudly. Returns the call log. */
export function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const out = handler(url, init);
    // Dev-only demo accounts: answered 404 (as in production) unless the test handles it; not logged.
    if (!out && url.endsWith("/auth/demo-accounts")) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
    calls.push({ url, init });
    if (!out) throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    const status = out.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(out.body === undefined ? {} : out.body), {
      status, headers: { "Content-Type": "application/json" },
    });
  }));
  return calls;
}
