import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "@/shared/api/authStore";
import type { Role, TokenPair } from "@/shared/types/auth";

const pair = (role: Role): TokenPair => ({
  access_token: `${role}-access`, refresh_token: `${role}-refresh`, user: { id: `${role}-id`, mobile: "9876543210", role },
});
const go = (path: string) => useAuth.getState().syncPath(path);

beforeEach(() => useAuth.setState({ sessions: {}, current: null, accessToken: null, refreshToken: null, user: null }));

describe("per-portal sessions", () => {
  it("keeps every portal signed in and mirrors the one in the URL", () => {
    go("/student/login");
    useAuth.getState().setSession(pair("student"));
    expect(useAuth.getState().user?.role).toBe("student");
    go("/shop/login");
    expect(useAuth.getState().user).toBeNull(); // shop not signed in yet; student untouched
    useAuth.getState().setSession(pair("shop"));
    expect(useAuth.getState().accessToken).toBe("shop-access");
    go("/student/orders");
    expect(useAuth.getState().accessToken).toBe("student-access");
    expect(Object.keys(useAuth.getState().sessions).sort()).toEqual(["shop", "student"]);
  });

  it("a session for another portal never replaces the one on screen", () => {
    go("/rider");
    useAuth.getState().setSession(pair("rider"));
    useAuth.getState().setSession(pair("admin"));
    expect(useAuth.getState().accessToken).toBe("rider-access");
    go("/admin");
    expect(useAuth.getState().accessToken).toBe("admin-access");
  });

  it("signing out leaves the other portals signed in", () => {
    go("/student");
    useAuth.getState().setSession(pair("student"));
    go("/shop");
    useAuth.getState().setSession(pair("shop"));
    useAuth.getState().clear();
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().sessions.shop).toBeUndefined();
    go("/student");
    expect(useAuth.getState().user?.role).toBe("student");
  });

  it("ignores paths outside the portals", () => {
    go("/student");
    useAuth.getState().setSession(pair("student"));
    go("/");
    expect(useAuth.getState().user?.role).toBe("student");
  });
});
