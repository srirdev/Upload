import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/shared/api/authStore";
import { useRealtime } from "@/shared/api/realtime";
import type { Role } from "@/shared/types/auth";
import { signIn } from "@/test/utils";

/** Minimal stand-in for the browser WebSocket; tests drive its handlers directly. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send() {}
  close() {
    this.closed = true;
  }
  receive(msg: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(msg) }));
  }
}

function Probe() {
  useRealtime();
  return null;
}

function setup(role: Role) {
  signIn(role);
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>);
  const keys = () => invalidate.mock.calls.map((c) => c[0]?.queryKey);
  return { invalidate, keys, socket: FakeSocket.instances.at(-1)! };
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => vi.useRealTimers());

describe("realtime", () => {
  it("connects with the access token and invalidates the student's order on an event", () => {
    const { invalidate, keys, socket } = setup("student");
    expect(socket.url).toBe(`ws://${window.location.host}/api/v1/ws?token=access`);

    socket.receive({ type: "ready" });
    expect(invalidate).not.toHaveBeenCalled();

    socket.receive({ type: "order.status", order_id: "o1", status: "printing" });
    expect(keys()).toEqual([["student", "orders"], ["student", "order", "o1"]]);

    invalidate.mockClear();
    socket.receive({ type: "notification", kind: "order_update", order_id: null });
    expect(keys()).toEqual([["student", "notifications"]]);
  });

  it("refreshes a shop's order lists and dashboard", () => {
    const { keys, socket } = setup("shop");
    socket.receive({ type: "order.assigned", order_id: "o1", shop_id: "s1" });
    expect(keys()).toEqual([["shop", "orders"], ["shop", "dashboard"], ["shop", "accounting"]]);
  });

  it("reconnects with the latest token after a drop and closes on sign-out", () => {
    vi.useFakeTimers();
    const { socket } = setup("rider");
    useAuth.setState({ accessToken: "fresh" }); // e.g. refreshed by the API client meanwhile
    act(() => socket.onclose?.({ code: 1006 }));
    expect(FakeSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1500));
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain("token=fresh");

    act(() => useAuth.getState().clear());
    expect(FakeSocket.instances[1].closed).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
