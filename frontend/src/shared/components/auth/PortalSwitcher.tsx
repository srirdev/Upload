import { ArrowLeftRight, Bike, Check, GraduationCap, LogIn, Printer, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROLES, useAuth } from "@/shared/api/authStore";
import { ROLE_LABEL, type Role } from "@/shared/types/auth";
import { cn } from "@/shared/utils/cn";

const ICON: Record<Role, LucideIcon> = { student: GraduationCap, rider: Bike, shop: Printer, admin: ShieldCheck };

/**
 * Switch between the four websites. Each keeps its own sign-in, so you can be signed in to all of them at once
 * in one browser; portals you're not signed in to open their sign-in page.
 */
export function PortalSwitcher({ dark, up }: { dark?: boolean; /** open the menu upwards */ up?: boolean }) {
  const [open, setOpen] = useState(false);
  const sessions = useAuth((s) => s.sessions);
  const current = useAuth((s) => s.current);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-2xl px-3 text-sm font-semibold transition-colors",
          dark ? "text-white/80 hover:bg-white/10 hover:text-white" : "bg-background text-ink-2 shadow-soft ring-1 ring-border/60 hover:text-primary",
        )}
      >
        <ArrowLeftRight className="size-4" aria-hidden />
        <span className="hidden sm:inline">Switch portal</span>
      </button>
      {open && (
        <div role="menu" aria-label="Portals" className={cn("absolute right-0 z-50 w-72", up ? "bottom-12" : "top-12")}>
          <div className="rounded-3xl bg-background p-2 text-navy shadow-lift ring-1 ring-border">
          {ROLES.map((role) => {
            const s = sessions[role];
            const Icon = ICON[role];
            const here = role === current;
            return (
              <button
                key={role}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(s ? `/${role}` : `/${role}/login`);
                }}
                className={cn("flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface", here && "bg-primary-soft")}
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", s ? "bg-primary text-white" : "bg-surface text-muted")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{ROLE_LABEL[role]}</span>
                  <span className="block truncate text-xs text-muted">
                    {s ? `Signed in · ${s.user.full_name || s.user.email || s.user.mobile}` : "Not signed in"}
                  </span>
                </span>
                {here ? <Check className="size-4 text-primary" aria-label="Current" /> : !s && <LogIn className="size-4 text-muted" aria-hidden />}
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

/** For full-screen pages outside the portal layouts (sign-up steps, approval waits): pinned bottom-right. */
export function FloatingPortalSwitcher() {
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <PortalSwitcher up />
    </div>
  );
}
