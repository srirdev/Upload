import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const fieldBase = cn(
  "w-full rounded-2xl border border-border bg-background text-base text-navy placeholder:text-muted/70",
  "shadow-[inset_0_1px_2px_rgb(20_15_60/0.04)] transition-[border-color,box-shadow]",
  "hover:border-primary/30 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/10",
);

/** Text input. `icon` adds a leading icon; `trailing` renders inside the right edge (e.g. a show-password toggle). */
export function Input({
  className, icon: Icon, trailing, ...props
}: React.ComponentProps<"input"> & { icon?: LucideIcon; trailing?: React.ReactNode }) {
  if (!Icon && !trailing) return <input className={cn(fieldBase, "h-13 px-4", className)} {...props} />;
  return (
    <div className="relative">
      {Icon && <Icon aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />}
      <input className={cn(fieldBase, "h-13", Icon ? "pl-12" : "pl-4", trailing ? "pr-12" : "pr-4", className)} {...props} />
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}
