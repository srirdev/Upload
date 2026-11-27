import type { ComponentType, ReactNode, SVGProps } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/shared/components/ui/button";
import { EmptyBoxArt } from "@/shared/components/illustrations";
import { cn } from "@/shared/utils/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-primary", className)} aria-label="Loading" />;
}

/** Shimmering placeholder block. Compose these into the shape of the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-2xl", className)} />;
}

/** A ready-made skeleton for a list of cards. */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-3xl bg-background p-4 shadow-soft ring-1 ring-border/60">
          <Skeleton className="size-12 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a dashboard: a row of tiles and a chart block. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
      </div>
      <Skeleton className="h-72 rounded-3xl" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

type Art = ComponentType<SVGProps<SVGSVGElement>>;

function Centered({
  art: ArtC, icon, title, hint, action, compact, className,
}: { art?: Art; icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "min-h-[40vh] py-10", className)}
    >
      {ArtC ? <ArtC className={cn("mb-3", compact ? "h-20" : "h-28")} /> : icon}
      <p className="font-display text-lg font-bold text-navy">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

/** Friendly empty state with an illustration. Pass `art` to match the context (orders, map, wallet…). */
export const EmptyState = ({ art = EmptyBoxArt, ...p }: { title: string; hint?: ReactNode; action?: ReactNode; art?: Art; compact?: boolean; className?: string }) => (
  <Centered art={art} {...p} />
);

export const ErrorState = ({ message, onRetry, compact }: { message?: string; onRetry?: () => void; compact?: boolean }) => (
  <Centered
    compact={compact}
    icon={
      <span className="mb-3 flex size-16 items-center justify-center rounded-3xl bg-danger-soft text-danger">
        <WifiOff className="size-7" aria-hidden />
      </span>
    }
    title="Something went wrong"
    hint={message ?? "We couldn't load this. Check your connection and try again."}
    action={onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw className="size-4" /> Try again</Button>}
  />
);
