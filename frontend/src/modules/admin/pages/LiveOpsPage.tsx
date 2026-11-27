import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Bike, CheckCircle2, ClipboardList, Map as MapIcon, MessageSquareWarning, PackageCheck, Printer,
  ReceiptIndianRupee, Store, Truck, Wallet,
} from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import { STAGE_LABEL, type Batch, type CustodyRow, type Stage, type Summary } from "@/modules/admin/api/types";
import { AssignRiderDialog, AssignShopDialog } from "@/modules/admin/components/AssignDialogs";
import { DataTable, ExternalLink, Panel, QueryBoundary, SearchInput, batchKind, humanize } from "@/modules/admin/components/common";
import { OrderPanel } from "@/modules/admin/components/OrderPanel";
import { ShieldArt } from "@/shared/components/illustrations";
import { IconTile, StatusPill, type Tone } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { FadeIn, Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { DashboardSkeleton, ErrorState } from "@/shared/components/ui/states";
import { StatTile } from "@/shared/components/ui/stat";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/utils/cn";
import { formatDate, formatTime, rupees } from "@/shared/utils/format";

const ASSIGNABLE = ["unassigned", "offered", "accepted"];
const STAGES: { stage: Stage; icon: typeof Store; tone: Tone }[] = [
  { stage: "awaiting_shop", icon: Store, tone: "violet" },
  { stage: "production", icon: Printer, tone: "orange" },
  { stage: "pickup", icon: PackageCheck, tone: "sun" },
  { stage: "in_transit", icon: Truck, tone: "orange" },
  { stage: "at_cabin", icon: CheckCircle2, tone: "mint" },
];

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export function LiveOpsPage() {
  const summary = useAdminGet<Summary>("/ops/summary", { refetchInterval: 15_000 });
  const custody = useAdminGet<CustodyRow[]>("/ops/custody", { refetchInterval: 10_000 });
  const [view, setView] = useState<string | null>(null);
  const [shopFor, setShopFor] = useState<string | null>(null);
  const [riderFor, setRiderFor] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {summary.isLoading ? <DashboardSkeleton /> : summary.isError ? (
        <ErrorState message={summary.error?.message} onRetry={() => summary.refetch()} />
      ) : summary.data && <Overview s={summary.data} />}

      <QueryBoundary query={custody}>
        {(rows) => (
          <>
            <StageBoard rows={rows} />
            <CustodyFeed rows={rows} onView={setView} onReassign={setShopFor} onAssignRider={setRiderFor} />
          </>
        )}
      </QueryBoundary>

      <ActiveRuns onAssign={setRiderFor} />

      {view && <OrderPanel orderId={view} onClose={() => setView(null)} />}
      {shopFor && <AssignShopDialog orderId={shopFor} onClose={() => setShopFor(null)} />}
      {riderFor && <AssignRiderDialog batchId={riderFor} onClose={() => setRiderFor(null)} />}
    </div>
  );
}

/** Midnight command-centre hero: today's headline numbers plus everything that needs a human. */
function Overview({ s }: { s: Summary }) {
  const todo: { n: number; label: string; to: string; icon: typeof Store }[] = [
    { n: s.unassigned_orders, label: "orders without a shop", to: "/admin/orders?tab=orders", icon: Store },
    { n: s.unassigned_batches, label: "runs without a rider", to: "/admin/riders", icon: Bike },
    { n: s.open_complaints, label: "open complaints", to: "/admin/orders?tab=complaints", icon: MessageSquareWarning },
    { n: s.refunds_to_review, label: "refunds to review", to: "/admin/orders?tab=refunds", icon: ReceiptIndianRupee },
  ];
  const urgent = todo.filter((t) => t.n > 0);
  return (
    <>
      <FadeIn>
        <Card tone="midnight" pad="lg" className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill kind="done" live className="bg-white/15 text-white">Live · refreshes every 15s</StatusPill>
              </div>
              <h1 className="mt-4 font-display text-3xl font-extrabold md:text-4xl">{greeting()}. Here's today.</h1>
              <p className="mt-1 text-white/70">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <HeroStat label="Orders placed today" value={String(s.orders_today)} />
              <HeroStat label="Delivered today" value={String(s.completed_deliveries)} />
              <HeroStat label="Net margin today" value={rupees(s.net_margin_today)} accent />
            </div>
          </div>
          <div className="rounded-3xl bg-white/8 p-5 ring-1 ring-white/10">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-white/70">
              <AlertTriangle className="size-4 text-sun" aria-hidden /> Needs attention
            </p>
            {urgent.length === 0 ? (
              <div className="flex items-center gap-4">
                <ShieldArt className="h-20 shrink-0" />
                <p className="text-sm text-white/80">All clear. No unassigned orders, empty runs, complaints or refunds waiting.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {urgent.map((t) => (
                  <li key={t.label}>
                    <Link to={t.to} className="group flex items-center gap-3 rounded-2xl bg-white/8 px-3 py-2.5 transition-colors hover:bg-white/15">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-orange text-navy"><t.icon className="size-4" aria-hidden /></span>
                      <span className="flex-1 text-sm"><b className="font-display text-lg tabular">{t.n}</b> {t.label}</span>
                      <ArrowRight className="size-4 text-white/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </FadeIn>
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatTile label="Active runs" value={s.active_batches} icon={Truck} tone="orange" hint="Unassigned, offered, accepted or on the road" /></StaggerItem>
        <StaggerItem><StatTile label="Packets waiting for pickup" value={s.pending_pickups} icon={PackageCheck} tone="sun" hint="On runs a rider has been offered or accepted" /></StaggerItem>
        <StaggerItem><StatTile label="Net margin, all time" value={rupees(s.net_margin_total)} icon={Wallet} tone="mint" /></StaggerItem>
        <StaggerItem>
          <Link to="/admin/map" className="block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-primary">
            <Card tone="brand" interactive className="flex h-full flex-col justify-between gap-3">
              <MapIcon className="size-7" aria-hidden />
              <div>
                <p className="font-display text-lg font-bold">Delivery map</p>
                <p className="text-sm text-white/80">Colleges and shops, live</p>
              </div>
            </Card>
          </Link>
        </StaggerItem>
      </Stagger>
    </>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-white/65">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-extrabold tabular", accent && "text-sun")}>{value}</p>
    </div>
  );
}

/** Pipeline board: how many in-flight orders sit at each stage (click to filter the feed below). */
function StageBoard({ rows }: { rows: CustodyRow[] }) {
  const counts = useMemo(() => {
    const m = new Map<Stage, { n: number; late: number }>();
    for (const r of rows) {
      const c = m.get(r.stage) ?? { n: 0, late: 0 };
      c.n += 1;
      if (r.needs_attention) c.late += 1;
      m.set(r.stage, c);
    }
    return m;
  }, [rows]);
  const max = Math.max(1, ...[...counts.values()].map((c) => c.n));
  return (
    <section aria-label="Orders by stage" className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {STAGES.map(({ stage, icon, tone }, i) => {
        const c = counts.get(stage) ?? { n: 0, late: 0 };
        return (
          <Card key={stage} pad="default" className="relative flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <IconTile icon={icon} tone={tone} size="sm" />
              <span className="text-xs font-bold text-muted">{i + 1}/5</span>
            </div>
            <div>
              <p className="font-display text-3xl font-extrabold text-navy tabular">{c.n}</p>
              <p className="text-sm font-medium text-ink-2">{STAGE_LABEL[stage]}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(c.n / max) * 100}%` }} />
            </div>
            {c.late > 0 && <StatusPill kind="problem">{c.late} need attention</StatusPill>}
          </Card>
        );
      })}
    </section>
  );
}

type StageFilter = "" | Stage | "attention";

function CustodyFeed({
  rows, onView, onReassign, onAssignRider,
}: { rows: CustodyRow[]; onView: (id: string) => void; onReassign: (id: string) => void; onAssignRider: (id: string) => void }) {
  const [stage, setStage] = useState<StageFilter>("");
  const [q, setQ] = useState("");
  const attention = rows.filter((r) => r.needs_attention).length;
  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) =>
    (!stage || (stage === "attention" ? r.needs_attention : r.stage === stage))
    && (!needle || `${r.code} ${r.college} ${r.shop ?? ""} ${r.rider ?? ""}`.toLowerCase().includes(needle)));

  return (
    <Panel
      title={<span className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" aria-hidden /> Custody feed</span>}
      subtitle="Every in-flight order and who holds it right now."
      actions={<SearchInput className="w-full sm:w-64" label="Search in-flight orders" placeholder="Order, college, shop or rider" value={q} onChange={setQ} />}
    >
      <ChipFilter<StageFilter>
        label="Stage"
        value={stage}
        onChange={setStage}
        items={[
          { value: "", label: `All (${rows.length})` },
          ...(attention ? [{ value: "attention" as const, label: <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3.5" aria-hidden /> Needs attention ({attention})</span> }] : []),
          ...STAGES.map((s) => ({ value: s.stage, label: STAGE_LABEL[s.stage] })),
        ]}
      />
      <DataTable
        rows={visible}
        rowKey={(r) => r.order_id}
        onRowClick={(r) => onView(r.order_id)}
        rowLabel={(r) => `Open order ${r.code}`}
        highlight={(r) => r.needs_attention}
        empty={{ title: rows.length ? "Nothing matches" : "No orders in flight right now", hint: rows.length ? "Try another stage or search." : "Paid orders appear here until they reach the security cabin.", art: ShieldArt }}
        columns={[
          { header: "Order", primary: true, cell: (r) => r.code },
          { header: "College", cell: (r) => r.college },
          {
            header: "Stage",
            cell: (r) => (
              <StatusPill kind={r.needs_attention ? "problem" : r.stage === "at_cabin" ? "done" : r.stage === "awaiting_shop" ? "new" : "progress"}>
                {STAGE_LABEL[r.stage] ?? humanize(r.stage)}
              </StatusPill>
            ),
          },
          { header: "Shop", cell: (r) => r.shop ?? <span className="text-muted">Unassigned</span> },
          { header: "Rider", cell: (r) => r.rider ?? <span className="text-muted">{r.batch_mode === "direct" ? "Shop delivering" : "—"}</span> },
          { header: "Delivery", cell: (r) => (r.delivery_at ? <span className="tabular">{formatTime(r.delivery_at)}<span className="block text-xs text-muted">{formatDate(r.delivery_at)}</span></span> : "—") },
          {
            header: "Actions",
            cell: (r) => (
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {r.stage === "awaiting_shop" && <Button size="sm" variant="accent" onClick={() => onReassign(r.order_id)}>Reassign shop</Button>}
                {r.batch_id && r.batch_status && ASSIGNABLE.includes(r.batch_status) && r.batch_mode === "consolidated" && (
                  <Button size="sm" variant="outline" onClick={() => onAssignRider(r.batch_id!)}>Assign backup rider</Button>
                )}
                {r.shelf_photo_url && <ExternalLink href={r.shelf_photo_url}>Shelf photo</ExternalLink>}
              </div>
            ),
          },
        ]}
      />
    </Panel>
  );
}

/** Slot board: runs that are open or on the road, grouped by date. */
function ActiveRuns({ onAssign }: { onAssign: (id: string) => void }) {
  const runs = useAdminGet<Batch[]>("/batches", { refetchInterval: 15_000 });
  return (
    <Panel
      title={<span className="flex items-center gap-2"><Truck className="size-5 text-orange-ink" aria-hidden /> Runs on the board</span>}
      subtitle="Open and on-the-road runs. Unassigned runs need a rider."
      actions={<Button asChild size="sm" variant="ghost"><Link to="/admin/riders">All runs <ArrowRight className="size-4" /></Link></Button>}
    >
      <QueryBoundary query={runs}>
        {(all) => {
          const live = all.filter((b) => ["unassigned", "offered", "accepted", "out_for_delivery"].includes(b.status));
          if (live.length === 0) return <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">No runs open right now.</p>;
          return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {live.map((b) => (
                <div key={b.id} className={cn("flex flex-col gap-3 rounded-3xl p-4 ring-1", b.status === "unassigned" ? "bg-danger-soft/50 ring-danger/30" : "bg-background ring-border")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-navy">{b.code}</p>
                      <p className="truncate text-xs text-muted">{b.college} · {formatDate(b.slot_date)} · {humanize(b.mode)}</p>
                    </div>
                    <StatusPill kind={batchKind(b.status)}>{humanize(b.status)}</StatusPill>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-ink-2">
                    <span className="inline-flex items-center gap-1"><PackageCheck className="size-4" aria-hidden /><b className="tabular">{b.packets}</b> packets</span>
                    <span className="inline-flex min-w-0 items-center gap-1"><Bike className="size-4 shrink-0" aria-hidden /><span className="truncate">{b.rider ?? "No rider"}</span></span>
                  </div>
                  {b.mode === "consolidated" && ASSIGNABLE.includes(b.status) && (
                    <Button size="sm" variant={b.status === "unassigned" ? "accent" : "outline"} onClick={() => onAssign(b.id)}>
                      {b.rider ? "Replace rider" : "Assign rider"}
                    </Button>
                  )}
                  {b.shelf_photo_url && <ExternalLink href={b.shelf_photo_url}>Shelf photo</ExternalLink>}
                </div>
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </Panel>
  );
}
