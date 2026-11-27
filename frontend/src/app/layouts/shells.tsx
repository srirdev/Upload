import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { motion } from "motion/react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { logout } from "@/shared/api/auth";
import { useAuth } from "@/shared/api/authStore";
import { PortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { Logo, LogoMark } from "@/shared/components/Logo";
import { Drawer } from "@/shared/components/ui/dialog";
import { PageTransition } from "@/shared/components/ui/motion";
import { cn } from "@/shared/utils/cn";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Small count/label shown next to the item (e.g. new orders). */
  badge?: ReactNode;
}

export async function signOut() {
  const { refreshToken, clear } = useAuth.getState();
  try {
    if (refreshToken) await logout(refreshToken);
  } catch {
    /* offline or already revoked: still clear the local session */
  } finally {
    clear();
  }
}

/** Keys page transitions on the first two path segments so tab switches animate but query changes don't. */
function useTransitionKey() {
  const { pathname } = useLocation();
  return pathname.split("/").slice(0, 4).join("/");
}

/**
 * Mobile-first shell (student, rider). Phones: glass top bar + floating bottom nav with an optional raised
 * centre action. Tablets/desktops: a top navigation bar and a wider content column.
 */
export function MobileShell({
  nav, topRight, fab, title,
}: {
  nav: NavItem[];
  /** Right side of the top bar (e.g. notifications bell, online toggle). */
  topRight?: ReactNode;
  /** Raised centre button in the bottom bar (e.g. "Upload"). */
  fab?: { to: string; label: string; icon: LucideIcon };
  /** Small label under the logo on desktop ("Delivery Partner"). */
  title?: string;
}) {
  const key = useTransitionKey();
  const half = Math.ceil(nav.length / 2);
  const left = fab ? nav.slice(0, half) : nav;
  const right = fab ? nav.slice(half) : [];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="glass sticky top-0 z-30 border-b border-white/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Link to={nav[0]?.to ?? "/"} className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-primary" aria-label="Home">
            <Logo className="hidden md:inline-flex" />
            <LogoMark className="md:hidden" />
          </Link>
          {title && <span className="hidden rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary md:inline">{title}</span>}
          <nav aria-label="Main" className="hidden flex-1 justify-center gap-1 md:flex">
            {nav.map((n) => <TopLink key={n.to} item={n} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <PortalSwitcher />
            {topRight}
            {fab && (
              <Link
                to={fab.to}
                className="hidden h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 md:inline-flex"
              >
                <fab.icon className="size-4" aria-hidden /> {fab.label}
              </Link>
            )}
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="hidden size-11 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-surface hover:text-navy md:flex"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-5 md:px-6 md:pb-12 md:pt-8">
        <PageTransition id={key}>
          <Outlet />
        </PageTransition>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-md items-end rounded-[1.75rem] bg-background/95 px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 shadow-nav ring-1 ring-border/70 backdrop-blur md:hidden"
      >
        {left.map((n) => <BottomLink key={n.to} item={n} />)}
        {fab && (
          <Link to={fab.to} aria-label={fab.label} className="-mt-7 flex flex-1 flex-col items-center gap-1 pb-1.5 text-[11px] font-semibold text-primary">
            <motion.span whileTap={{ scale: 0.92 }} className="flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-glow ring-4 ring-canvas">
              <fab.icon className="size-6" aria-hidden />
            </motion.span>
            {fab.label}
          </Link>
        )}
        {right.map((n) => <BottomLink key={n.to} item={n} />)}
      </nav>
    </div>
  );
}

function TopLink({ item: { to, label, icon: Icon, end, badge } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn("relative flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors", isActive ? "text-primary" : "text-muted hover:text-navy")
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="top-nav" className="absolute inset-0 rounded-xl bg-primary-soft" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <Icon className="relative size-4" aria-hidden />
          <span className="relative">{label}</span>
          {badge !== undefined && badge !== null && badge !== 0 && <span className="relative rounded-full bg-orange px-1.5 text-[11px] font-bold text-navy">{badge}</span>}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ item: { to, label, icon: Icon, end, badge } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn("relative flex min-h-15 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors", isActive ? "text-primary" : "text-muted")
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative flex h-8 w-12 items-center justify-center">
            {isActive && <motion.span layoutId="bottom-nav" className="absolute inset-0 rounded-full bg-primary-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <Icon className="relative size-5" aria-hidden />
            {badge !== undefined && badge !== null && badge !== 0 && (
              <span className="absolute -right-0.5 -top-1 min-w-4 rounded-full bg-orange px-1 text-center text-[10px] font-bold leading-4 text-navy">{badge}</span>
            )}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/**
 * Desktop-first shell (shop, admin): a midnight sidebar on large screens, a top bar with a menu drawer on
 * smaller ones. `account` renders above Sign out; `headerRight` sits in the top bar (status toggles, alerts).
 */
export function SidebarShell({
  nav, title, account, headerRight,
}: { nav: NavItem[]; title: string; account?: ReactNode; headerRight?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const key = useTransitionKey();
  const { pathname } = useLocation();
  const current = [...nav].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  const links = (onNavigate?: () => void) => (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group relative flex h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-colors",
              isActive ? "text-white" : "text-white/65 hover:bg-white/8 hover:text-white",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId={onNavigate ? "side-nav-drawer" : "side-nav"}
                  className="absolute inset-0 rounded-2xl bg-white/14 ring-1 ring-white/15"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              {isActive && <span className="absolute -left-4 top-3 h-6 w-1.5 rounded-r-full bg-sun" aria-hidden />}
              <Icon className="relative size-5" aria-hidden />
              <span className="relative flex-1">{label}</span>
              {badge !== undefined && badge !== null && badge !== 0 && (
                <span className="relative min-w-6 rounded-full bg-orange px-2 py-0.5 text-center text-xs font-bold text-navy">{badge}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-2 border-t border-white/10 pt-4">
      {account}
      <button onClick={signOut} className="flex h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold text-white/65 transition-colors hover:bg-white/8 hover:text-white">
        <LogOut className="size-5" aria-hidden /> Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="bg-midnight sticky top-0 hidden h-dvh w-68 shrink-0 flex-col gap-6 p-4 pt-6 lg:flex">
        <div className="px-2">
          <Logo inverted />
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">{title}</p>
        </div>
        <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">{links()}</div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/60 px-4 md:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex size-11 items-center justify-center rounded-2xl text-navy transition-colors hover:bg-surface lg:hidden"
          >
            <Menu className="size-6" />
          </button>
          <LogoMark className="lg:hidden" />
          <p className="min-w-0 truncate font-display text-base font-bold text-navy lg:text-sm lg:font-semibold lg:text-muted">
            <span className="hidden lg:inline">{title} / </span>
            {current?.label}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <PortalSwitcher />
            {headerRight}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[90rem]">
            <PageTransition id={key}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <Drawer open={open} onOpenChange={setOpen} side="left" dark title={<Logo inverted />} description={title} className="sm:w-80">
        <div className="flex h-full flex-col gap-6">
          <div className="flex-1">{links(() => setOpen(false))}</div>
          {footer}
        </div>
      </Drawer>
    </div>
  );
}
