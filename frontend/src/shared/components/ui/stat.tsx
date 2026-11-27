import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconTile, type Tone } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

/** Compact a number for tiles: 1,284 / 12.9K / 4.2L (Indian lakh/crore for money). */
export function compact(n: number, money = false) {
  const a = Math.abs(n);
  if (money) {
    if (a >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
    if (a >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (a >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: money ? 2 : 0 }).format(n);
}

/**
 * Stat tile: label (sentence case) · value · optional hint/delta. Values come from the API, never invented.
 * Colour comes from the icon tile; the value stays in ink.
 */
export function StatTile({
  label, value, hint, icon, tone = "violet", className, emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col gap-3", className)} pad="default">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
      </div>
      <p className={cn("font-display font-bold tabular text-navy", emphasis ? "text-4xl" : "text-[1.75rem] leading-none")}>{value}</p>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </Card>
  );
}

/** Meter: share of a whole; track is a lighter step of the same hue. */
export function Meter({ value, max, tone = "violet", label }: { value: number; max: number; tone?: "violet" | "orange" | "mint" | "sun"; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = { violet: "bg-primary", orange: "bg-orange", mint: "bg-mint", sun: "bg-sun" }[tone];
  const track = { violet: "bg-primary-soft", orange: "bg-orange-soft", mint: "bg-mint-soft", sun: "bg-sun-soft" }[tone];
  return (
    <div role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className={cn("h-2.5 w-full overflow-hidden rounded-full", track)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
