import { Bike, Clock3, Package, Route, Store } from "lucide-react";
import type { ReactNode } from "react";
import type { Run } from "@/modules/rider/api/types";
import { coords, MapView, type MapPoint } from "@/shared/components/map";
import { StatusPill, type StatusKind } from "@/shared/components/ui/badge";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { useNow } from "@/shared/hooks/useNow";
import { cn } from "@/shared/utils/cn";
import { countdown, formatTime, rupees } from "@/shared/utils/format";

const STATUS: Partial<Record<Run["status"], { kind: StatusKind; label: string }>> = {
  offered: { kind: "new", label: "New run offer" },
  accepted: { kind: "progress", label: "Picking up" },
  out_for_delivery: { kind: "progress", label: "On the way" },
  completed: { kind: "done", label: "Delivered" },
};

/** Midnight hero: where the run goes, when it's due and what it pays. */
export function RunHero({ run, children }: { run: Run; children?: ReactNode }) {
  const now = useNow(30_000);
  const left = countdown(run.slot.delivery_at, now);
  const status = STATUS[run.status];
  return (
    <section className="bg-midnight relative overflow-hidden rounded-4xl p-5 text-white shadow-lift sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-orange/25 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-2">
        {status && <StatusPill kind={status.kind} live={run.status !== "completed"} className="bg-white text-navy">{status.label}</StatusPill>}
        <span className="glass-dark rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-white/20">Batch {run.code}</span>
        {run.mode === "direct" && <span className="glass-dark rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-white/20">Direct delivery</span>}
      </div>
      <div className="relative mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{run.college.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
            <Clock3 className="size-4 shrink-0" aria-hidden />
            {run.slot.label} · deliver by {formatTime(run.slot.delivery_at)}
            {left && <span className="font-semibold text-sun">· {left} left</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Guaranteed payout</p>
          <p className="font-display text-4xl font-extrabold text-sun tabular">{rupees(run.guaranteed_payout)}</p>
        </div>
      </div>
      <dl className="relative mt-5 grid grid-cols-3 gap-2">
        <HeroStat icon={Store} label="Pickup shops" value={String(run.shop_count)} />
        <HeroStat icon={Package} label="Packets" value={String(run.packet_count)} />
        <HeroStat icon={Route} label="Route" value={run.route_distance_km ? `${run.route_distance_km} km` : "—"} />
      </dl>
      {children && <div className="relative mt-5">{children}</div>}
    </section>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: typeof Bike; label: string; value: string }) {
  return (
    <div className="glass-dark rounded-2xl px-3 py-2.5 ring-1 ring-white/15">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg font-bold tabular">{value}</dd>
    </div>
  );
}

const STEPS = [{ label: "Accepted" }, { label: "Pickups" }, { label: "On the way" }, { label: "Shelf photo" }, { label: "Delivered" }];

/** Where the rider is in the run, derived from the run's real status and shelf-photo count. */
export function runStep(run: Run) {
  if (run.status === "offered") return 0;
  if (run.status === "accepted") return 1;
  if (run.status === "out_for_delivery") return run.shelf_photo_count > 0 ? 4 : 2;
  return STEPS.length;
}

export function RunProgress({ run, className }: { run: Run; className?: string }) {
  return (
    <div className={cn("rounded-3xl bg-background px-4 pb-4 pt-5 shadow-soft ring-1 ring-border/60", className)}>
      <h2 className="sr-only">Delivery progress</h2>
      <ProgressSteps steps={STEPS} current={runStep(run)} orientation="horizontal" />
    </div>
  );
}

/** Pickup stops (numbered in route order) then the college drop. Points without coordinates are left out. */
export function runPoints(run: Run, focus: "route" | "drop"): MapPoint[] {
  const pts: MapPoint[] = [];
  if (focus === "route") {
    run.shops.forEach((s, i) => {
      const c = coords(s.latitude, s.longitude);
      if (c) {
        pts.push({
          id: s.shop_id, ...c, kind: "shop", badge: String(i + 1), label: s.shop_name,
          detail: `${s.area} · ${s.orders.length} packet${s.orders.length === 1 ? "" : "s"}`, href: s.maps_url,
        });
      }
    });
  }
  const c = coords(run.college.latitude, run.college.longitude);
  if (c) pts.push({ id: "college", ...c, kind: "drop", label: run.college.name, detail: `Drop at ${run.college.security_cabin}`, href: run.college.maps_url });
  return pts;
}

export function RunMap({
  run, focus = "route", className, activeId, onSelect,
}: { run: Run; focus?: "route" | "drop"; className?: string; activeId?: string | null; onSelect?: (id: string) => void }) {
  return (
    <MapView
      points={runPoints(run, focus)}
      route={focus === "route"}
      activeId={activeId}
      onSelect={onSelect}
      className={className ?? "h-60 sm:h-72"}
      emptyHint="Shop and college locations aren't on the map yet. Use the Navigate buttons below."
    />
  );
}
