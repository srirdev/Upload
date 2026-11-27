import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, TokenPair, User } from "@/shared/types/auth";

export const ROLES: Role[] = ["student", "rider", "shop", "admin"];

interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthState {
  /** One session per portal: you can be signed in as a student, rider, shop and admin at the same time. */
  sessions: Partial<Record<Role, Session>>;
  /** The portal being viewed (from the URL). The three fields below mirror its session. */
  current: Role | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (t: TokenPair) => void;
  /** Signs out of the current portal only; other portals stay signed in. */
  clear: () => void;
  /** Switches the mirrored session to the portal of this URL path (called on every navigation). */
  syncPath: (pathname: string) => void;
}

const mirror = (s?: Session) => ({ accessToken: s?.accessToken ?? null, refreshToken: s?.refreshToken ?? null, user: s?.user ?? null });

export const roleFromPath = (pathname: string): Role | null => {
  const seg = pathname.split("/")[1] as Role;
  return ROLES.includes(seg) ? seg : null;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      sessions: {},
      current: typeof window === "undefined" ? null : roleFromPath(window.location.pathname),
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (t) => {
        const session = { accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user };
        const role = t.user.role;
        const current = get().current ?? role;
        set((s) => ({
          sessions: { ...s.sessions, [role]: session },
          current,
          ...(role === current ? mirror(session) : {}),
        }));
      },
      clear: () =>
        set((s) => {
          const role = s.current ?? s.user?.role;
          const sessions = { ...s.sessions };
          if (role) delete sessions[role];
          return { sessions, ...mirror() };
        }),
      syncPath: (pathname) => {
        const role = roleFromPath(pathname);
        if (!role || role === get().current) return;
        set((s) => ({ current: role, ...mirror(s.sessions[role]) }));
      },
    }),
    {
      name: "upload-auth",
      version: 2,
      partialize: (s) => ({ sessions: s.sessions }),
      // v1 stored a single session: keep it under its role so nobody is signed out by the upgrade.
      migrate: (persisted, version) => {
        const old = persisted as { accessToken?: string; refreshToken?: string; user?: User; sessions?: AuthState["sessions"] };
        if (version < 2 && old.user && old.accessToken && old.refreshToken) {
          return { sessions: { [old.user.role]: { accessToken: old.accessToken, refreshToken: old.refreshToken, user: old.user } } };
        }
        return { sessions: old.sessions ?? {} };
      },
      // Restore the sessions and mirror the one for the portal in the URL.
      merge: (persisted, state) => {
        const sessions = (persisted as Pick<AuthState, "sessions"> | undefined)?.sessions ?? {};
        return { ...state, sessions, ...(state.current ? mirror(sessions[state.current]) : {}) };
      },
    },
  ),
);
