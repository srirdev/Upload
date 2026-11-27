import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Pill tabs with an animated indicator. Renders a proper tablist; the caller renders the panel.
 * `variant="underline"` suits dense desktop toolbars.
 */
export function Tabs<T extends string>({
  value, onChange, items, label, variant = "pill", className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: TabItem<T>[];
  label: string;
  variant?: "pill" | "underline";
  className?: string;
}) {
  const group = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto",
        variant === "pill" ? "rounded-2xl bg-background p-1 shadow-soft ring-1 ring-border/60" : "border-b border-border",
        className,
      )}
    >
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors",
              variant === "pill" ? "h-10 rounded-xl px-4" : "h-11 px-3",
              on ? (variant === "pill" ? "text-white" : "text-primary") : "text-muted hover:text-navy",
            )}
          >
            {on && (
              <motion.span
                layoutId={`tab-${group}`}
                transition={{ type: "spring", stiffness: 480, damping: 36 }}
                className={cn("absolute", variant === "pill" ? "inset-0 rounded-xl bg-primary shadow-glow" : "inset-x-2 -bottom-px h-0.5 rounded-full bg-primary")}
              />
            )}
            <span className="relative">{t.label}</span>
            {t.count !== undefined && (
              <span
                className={cn(
                  "relative min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none tabular",
                  on && variant === "pill" ? "bg-white/25 text-white" : "bg-surface text-ink-2",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontally scrolling chip filter (single choice). */
export function ChipFilter<T extends string>({
  value, onChange, items, label,
}: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {items.map((c) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.value)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 transition-colors",
              on ? "bg-navy text-white ring-navy" : "bg-background text-ink-2 ring-border hover:ring-primary/40",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
