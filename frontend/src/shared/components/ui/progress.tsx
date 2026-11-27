import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils/cn";

export interface Step {
  label: string;
  /** Optional detail under the label (time, place). */
  detail?: string | null;
}

/**
 * Animated progress tracker. `current` is the index of the step in progress (steps before it are done);
 * pass `current >= steps.length` when everything is done. `problem` marks the current step as failed.
 */
export function ProgressSteps({
  steps, current, orientation = "vertical", problem, className,
}: { steps: Step[]; current: number; orientation?: "vertical" | "horizontal"; problem?: boolean; className?: string }) {
  const pct = steps.length > 1 ? (Math.min(current, steps.length - 1) / (steps.length - 1)) * 100 : 0;

  if (orientation === "horizontal") {
    return (
      <div className={cn("relative", className)}>
        <div className="absolute left-4 right-4 top-4 h-1 rounded-full bg-primary-soft" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-orange"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <ol className="relative flex justify-between">
          {steps.map((s, i) => (
            <li key={s.label} className="flex w-0 flex-1 flex-col items-center text-center first:items-start first:text-left last:items-end last:text-right">
              <Dot state={i < current ? "done" : i === current ? (problem ? "problem" : "now") : "todo"} index={i} />
              <span className={cn("mt-2 text-[11px] font-semibold leading-tight sm:text-xs", i <= current ? "text-navy" : "text-muted")}>{s.label}</span>
              {s.detail && <span className="mt-0.5 hidden text-[11px] text-muted sm:block">{s.detail}</span>}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <ol className={cn("relative", className)}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? (problem ? "problem" : "now") : "todo";
        return (
          <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-4 top-9 -bottom-0 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
                <motion.span
                  className="block w-full bg-primary"
                  initial={{ height: 0 }}
                  animate={{ height: i < current ? "100%" : 0 }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                />
              </span>
            )}
            <Dot state={state} index={i} />
            <div className="min-w-0 pt-1">
              <p className={cn("text-sm font-semibold", state === "todo" ? "text-muted" : "text-navy")}>
                {s.label}
                {state === "now" && <span className="sr-only"> (current)</span>}
              </p>
              {s.detail && <p className="text-xs text-muted">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ state, index }: { state: "done" | "now" | "todo" | "problem"; index: number }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-background",
        state === "done" && "bg-primary text-white",
        state === "now" && "bg-orange text-navy",
        state === "problem" && "bg-danger text-white",
        state === "todo" && "bg-surface text-muted",
      )}
    >
      {state === "now" && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-orange/60" aria-hidden />}
      {state === "done" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <span className="relative">{index + 1}</span>}
    </motion.span>
  );
}
