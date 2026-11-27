import type * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Loader, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export type Tone = "violet" | "orange" | "sun" | "mint" | "danger" | "neutral" | "navy";

const toneClass: Record<Tone, string> = {
  violet: "bg-primary-soft text-primary",
  orange: "bg-orange-soft text-orange-ink",
  sun: "bg-sun-soft text-sun-ink",
  mint: "bg-mint-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface text-ink-2",
  navy: "bg-navy text-white",
};

export function Badge({
  tone = "neutral", icon: Icon, className, children, ...props
}: React.ComponentProps<"span"> & { tone?: Tone; icon?: LucideIcon }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none", toneClass[tone], className)}
      {...props}
    >
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

/** State kinds every portal shares. Status is never colour-alone: each kind carries its own icon. */
export type StatusKind = "new" | "progress" | "waiting" | "done" | "problem" | "cancelled" | "info";
const STATUS: Record<StatusKind, { tone: Tone; icon: LucideIcon }> = {
  new: { tone: "violet", icon: CircleDashed },
  progress: { tone: "orange", icon: Loader },
  waiting: { tone: "sun", icon: Clock3 },
  done: { tone: "mint", icon: CheckCircle2 },
  problem: { tone: "danger", icon: AlertTriangle },
  cancelled: { tone: "neutral", icon: XCircle },
  info: { tone: "neutral", icon: CircleDashed },
};

export function StatusPill({ kind, children, className, live }: { kind: StatusKind; children: React.ReactNode; className?: string; live?: boolean }) {
  const { tone, icon } = STATUS[kind];
  return (
    <Badge tone={tone} icon={live ? undefined : icon} className={className}>
      {live && (
        <span className="relative mr-0.5 flex size-2" aria-hidden>
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current" />
          <span className="relative size-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </Badge>
  );
}

/** Coloured rounded square holding an icon. */
export function IconTile({
  icon: Icon, tone = "violet", size = "md", className,
}: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        toneClass[tone],
        size === "sm" && "size-9 rounded-xl [&_svg]:size-4.5",
        size === "md" && "size-11 rounded-2xl [&_svg]:size-5",
        size === "lg" && "size-14 rounded-2xl [&_svg]:size-7",
        className,
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}

/** Initials avatar on a brand gradient. */
export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-bold text-white ring-2 ring-white", className)}
    >
      {initials || "U"}
    </span>
  );
}
