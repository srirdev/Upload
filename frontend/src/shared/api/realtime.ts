import { useEffect } from "react";
import { useQueryClient, type InvalidateQueryFilters } from "@tanstack/react-query";
import { fetchMe } from "@/shared/api/auth";
import { useAuth } from "@/shared/api/authStore";
import { BASE } from "@/shared/api/client";
import type { Role } from "@/shared/types/auth";

/** Server push messages carry ids only; the affected data is refetched over REST. */
export type RealtimeEvent =
  | { type: "ready" }
  | { type: "order.status"; order_id: string; status: string }
  | { type: "order.assigned"; order_id: string; shop_id: string }
  | { type: "order.custody"; order_id: string; batch_id?: string; event: string }
  | { type: "batch.updated"; batch_id: string; status: string }
  | { type: "notification"; kind: string; order_id?: string | null };

const PING_MS = 25_000; // keeps proxies from idling the socket out
const MAX_BACKOFF_MS = 30_000;
const UNAUTHORIZED = 4401;

/** ws(s):// URL of the events socket: same origin and prefix as the REST API. */
export function socketUrl(token: string) {
  const url = new URL(`${BASE}/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

/** Live query-key prefixes per portal; these mirror the `key` objects in modules/<role>/api. */
const LIVE: Record<Role, InvalidateQueryFilters[]> = {
  student: [{ queryKey: ["student", "orders"] }, { queryKey: ["student", "order"] }, { queryKey: ["student", "notifications"] }],
  shop: [{ queryKey: ["shop", "orders"] }, { queryKey: ["shop", "dashboard"] }, { queryKey: ["shop", "accounting"] }],
  rider: [{ queryKey: ["rider", "run"] }, { queryKey: ["rider", "history"] }, { queryKey: ["rider", "earnings"] }],
  // Admin keys are ["admin", path]: refresh live ops, orders and batches, not settings or finance.
  admin: [{ queryKey: ["admin"], predicate: (q) => /^\/(ops|orders|batches)/.test(String(q.queryKey[1])) }],
};

/** What to refetch for one event. Students only refetch the order it names. */
export function filtersFor(role: Role, e: RealtimeEvent): InvalidateQueryFilters[] {
  if (role !== "student") return LIVE[role];
  const orderId = "order_id" in e ? e.order_id : null;
  return [
    ...(orderId ? [{ queryKey: ["student", "orders"] }, { queryKey: ["student", "order", orderId] }] : []),
    ...(e.type === "notification" ? [{ queryKey: ["student", "notifications"] }] : []),
  ];
}

/**
 * While signed in, keeps one events socket open and invalidates the affected queries on each message.
 * Reconnects with backoff, reading the latest access token each time; on 4401 it refreshes the token first.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  const role = useAuth((s) => s.user?.role);

  useEffect(() => {
    if (!userId || !role) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let wasConnected = false;
    let stopped = false;
    const invalidate = (filters: InvalidateQueryFilters[]) => filters.forEach((f) => qc.invalidateQueries(f));

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts) * (0.75 + Math.random() * 0.5);
      attempts += 1;
      retry = setTimeout(connect, delay);
    };

    function connect() {
      const token = useAuth.getState().accessToken;
      if (stopped || !token) return;
      const ws = new WebSocket(socketUrl(token));
      socket = ws;
      ws.onopen = () => {
        ping = setInterval(() => ws.readyState === 1 /* OPEN */ && ws.send("ping"), PING_MS);
      };
      ws.onmessage = (m: MessageEvent) => {
        let e: RealtimeEvent;
        try {
          e = JSON.parse(String(m.data)) as RealtimeEvent;
        } catch {
          return;
        }
        if (e.type !== "ready") return invalidate(filtersFor(role!, e));
        attempts = 0;
        if (wasConnected) invalidate(LIVE[role!]); // catch up on anything missed while disconnected
        wasConnected = true;
      };
      ws.onclose = (ev: CloseEvent) => {
        clearInterval(ping);
        if (stopped) return;
        // Expired token: any authed call refreshes it, or signs out (which stops this effect).
        if (ev.code === UNAUTHORIZED) fetchMe().catch(() => undefined).finally(schedule);
        else schedule();
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [qc, userId, role]);
}
