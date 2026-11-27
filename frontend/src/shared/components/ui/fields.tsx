import type * as React from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useId } from "react";
import { fieldBase } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/utils/cn";

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(fieldBase, "h-13 appearance-none px-4 pr-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-28 p-4", className)} {...props} />;
}

/** Label + control + hint/error, wired for screen readers (the control gets the generated id via `children(id)`). */
export function FormField({
  label, hint, error, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} role="alert" className="mt-1.5 text-sm font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={msgId} className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Segmented single-choice control (e.g. A4 / A3) with a sliding thumb. */
export function Segmented<T extends string | number>({
  value, options, onChange, label, size = "default",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "default" | "sm";
}) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-xl text-sm font-semibold transition-colors",
              size === "sm" ? "h-8 px-2" : "h-10 px-3",
              on ? "text-primary" : "text-muted hover:text-navy",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-xl bg-background shadow-soft"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked, onChange, label, disabled, tone = "primary",
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; tone?: "primary" | "mint" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-50",
        checked ? (tone === "mint" ? "bg-mint" : "bg-primary") : "bg-[#d9d2ec]",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={cn("size-6 rounded-full bg-white shadow-soft", checked && "ml-auto")}
      />
    </button>
  );
}
