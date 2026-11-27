import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils/cn";

/**
 * Surfaces. `plain` is the workhorse; tinted tones give a section its own colour identity;
 * `brand`/`sunrise`/`midnight`/`mint` are hero surfaces (white text inside, one per screen).
 */
const cardVariants = cva("relative overflow-hidden rounded-3xl", {
  variants: {
    tone: {
      plain: "bg-background shadow-soft ring-1 ring-border/60",
      flat: "bg-background ring-1 ring-border",
      violet: "bg-primary-soft",
      orange: "bg-orange-soft",
      sun: "bg-sun-soft",
      mint: "bg-mint-soft",
      lavender: "bg-surface",
      glass: "glass shadow-soft ring-1 ring-white/60",
      brand: "bg-brand text-white shadow-lift",
      sunrise: "bg-sunrise text-white shadow-lift",
      midnight: "bg-midnight text-white shadow-lift",
      mintfresh: "bg-mintfresh text-navy shadow-lift",
    },
    pad: { none: "", sm: "p-4", default: "p-5", lg: "p-6 md:p-7" },
    interactive: {
      true: "cursor-pointer transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-primary",
      false: "",
    },
  },
  defaultVariants: { tone: "plain", pad: "default", interactive: false },
});

export type CardTone = NonNullable<VariantProps<typeof cardVariants>["tone"]>;

export function Card({
  className, tone, pad, interactive, ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ tone, pad, interactive }), className)} {...props} />;
}

/** Section heading with an optional action on the right ("See all"). */
export function SectionHeader({
  title, subtitle, action, className, as: H = "h2",
}: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <H className={cn("font-display font-bold text-navy", H === "h1" ? "text-2xl md:text-3xl" : "text-lg md:text-xl")}>{title}</H>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Big page title used at the top of desktop pages. */
export function PageHeader({
  title, subtitle, actions, eyebrow,
}: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-extrabold text-navy md:text-[2rem] md:leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
