import { useMemo, useState } from "react";
import { BadgeIndianRupee, CalendarDays, CheckCircle2, Clock3, Hourglass, Package, Route, TrendingUp } from "lucide-react";
import { useEarnings, useHistory } from "@/modules/rider/api";
import type { HistoryItem, Payout } from "@/modules/rider/api/types";
import { WalletArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Card, PageHeader, SectionHeader } from "@/shared/components/ui/card";
import { BarsChart, byDay, ChartCard, rupeeFmt, TrendChart } from "@/shared/components/ui/charts";
import { FadeIn, Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { StatTile } from "@/shared/components/ui/stat";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/shared/components/ui/states";
import { Tabs } from "@/shared/components/ui/tabs";
import { formatDate, rupees } from "@/shared/utils/format";

type View = "earnings" | "performance";

export function EarningsPage() {
  const q = useEarnings();
  const history = useHistory();
  const [view, setView] = useState<View>("earnings");

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const e = q.data!;
  const daily = history.data ? byDay(history.data, (h) => h.completed_at, (h) => Number(h.payout ?? 0)) : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Delivery Partner" title="Earnings" subtitle="What you've earned, what's on the way, and how your runs are going." />
      <Tabs<View>
        label="Earnings view"
        value={view}
        onChange={setView}
        items={[{ value: "earnings", label: "Earnings" }, { value: "performance", label: "Performance" }]}
        className="w-fit"
      />

      {view === "earnings" ? (
        <div className="space-y-6">
          <FadeIn>
            <section className="bg-midnight relative overflow-hidden rounded-4xl p-6 text-white shadow-lift sm:p-8">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-orange/25 blur-3xl" />
              <div className="relative flex items-center justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold text-white/70">Earned today</p>
                  <p className="font-display text-5xl font-extrabold text-sun tabular">{rupees(e.today)}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="glass-dark rounded-2xl px-3 py-2 text-sm ring-1 ring-white/15">
                      <span className="text-white/70">This week </span><b className="tabular">{rupees(e.this_week)}</b>
                    </span>
                    <span className="glass-dark rounded-2xl px-3 py-2 text-sm ring-1 ring-white/15">
                      <span className="text-white/70">Awaiting payout </span><b className="tabular">{rupees(e.unsettled)}</b>
                    </span>
                  </div>
                </div>
                <WalletArt className="hidden h-28 w-auto shrink-0 sm:block" />
              </div>
            </section>
          </FadeIn>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <FadeIn delay={0.05}>
              <ChartCard
                title="Daily earnings"
                subtitle="Completed runs, last 14 days"
                series={[{ key: "value", name: "Earnings" }]}
                data={daily}
                format={rupeeFmt}
                empty={{ title: "No earnings yet", hint: "Your daily earnings chart fills in as you complete runs." }}
              >
                <TrendChart
                  data={daily}
                  series={[{ key: "value", name: "Earnings" }]}
                  format={rupeeFmt}
                />
              </ChartCard>
            </FadeIn>

            <FadeIn delay={0.1}>
              <Card pad="lg" className="h-full">
                <SectionHeader title="Last trip" subtitle="How your most recent payout adds up" />
                {e.last_trip ? (
                  <dl className="space-y-3 text-sm">
                    {([
                      ["Base trip fee", e.last_trip.base_fee],
                      ["Additional shop pickups", e.last_trip.extra_shop_fees],
                      ["Per-packet bonus", e.last_trip.packet_bonus],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-muted">{k}</dt>
                        <dd className="font-semibold text-navy tabular">{v ? rupees(v) : "—"}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 rounded-2xl bg-sun-soft px-3 py-2.5 font-display text-base font-bold text-navy">
                      <dt>Trip total</dt>
                      <dd className="tabular">{e.last_trip.total ? rupees(e.last_trip.total) : "—"}</dd>
                    </div>
                    <p className="text-xs text-muted">A minimum trip guarantee applies; the total is never below it.</p>
                  </dl>
                ) : (
                  <EmptyState compact title="No trips yet" hint="Complete a run to see its fee breakdown." />
                )}
              </Card>
            </FadeIn>
          </div>

          <FadeIn delay={0.12}>
            <Card pad="lg">
              <SectionHeader title="Payouts" subtitle="Settled to your UPI ID twice a week" />
              {e.payouts.length === 0 ? (
                <EmptyState compact art={WalletArt} title="No payouts yet" hint="Payouts are made twice a week." />
              ) : (
                <ul className="divide-y divide-border">
                  {e.payouts.map((p) => <PayoutRow key={p.id} p={p} />)}
                </ul>
              )}
            </Card>
          </FadeIn>
        </div>
      ) : (
        <Performance history={history.data} loading={history.isLoading} error={history.error?.message} retry={() => history.refetch()} />
      )}
    </div>
  );
}

function PayoutRow({ p }: { p: Payout }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary">
        <CalendarDays className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy">{formatDate(p.period_start)} – {formatDate(p.period_end)}</p>
        <p className="truncate text-xs text-muted">
          {p.batch_count} run{p.batch_count === 1 ? "" : "s"}{p.upi_reference && ` · UPI ref ${p.upi_reference}`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-display font-bold text-navy tabular">{rupees(p.amount)}</span>
        <StatusPill kind={p.status === "paid" ? "done" : "waiting"}>{p.status === "paid" ? "Paid" : "Pending"}</StatusPill>
      </div>
    </li>
  );
}

/** Analytics derived only from the rider's real run history. */
function Performance({ history, loading, error, retry }: { history?: HistoryItem[]; loading: boolean; error?: string; retry: () => void }) {
  const stats = useMemo(() => {
    const items = history ?? [];
    const done = items.filter((h) => h.status === "completed");
    const paid = done.filter((h) => h.payout !== null);
    const earned = paid.reduce((a, h) => a + Number(h.payout), 0);
    const packets = done.reduce((a, h) => a + h.packet_count, 0);
    const days = byDay(done, (h) => h.completed_at, () => 1, 14);
    return {
      runs: done.length,
      closedEmpty: items.filter((h) => h.status === "cancelled").length,
      packets,
      avgPayout: paid.length ? earned / paid.length : null,
      perRun: done.length ? packets / done.length : null,
      unsettled: items.filter((h) => !h.settled && h.status === "completed").length,
      activeDays: days.filter((d) => Number(d.value) > 0).length,
      packetsByDay: byDay(done, (h) => h.completed_at, (h) => h.packet_count, 14),
    };
  }, [history]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!history?.length) {
    return <EmptyState title="No runs yet" hint="Your performance shows up here after your first completed delivery." />;
  }

  return (
    <div className="space-y-6">
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatTile label="Runs completed" value={stats.runs} icon={CheckCircle2} tone="mint" hint={stats.closedEmpty ? `${stats.closedEmpty} closed empty` : undefined} /></StaggerItem>
        <StaggerItem><StatTile label="Packets delivered" value={stats.packets} icon={Package} tone="violet" hint={stats.perRun !== null ? `${stats.perRun.toFixed(1)} per run` : undefined} /></StaggerItem>
        <StaggerItem><StatTile label="Average payout" value={stats.avgPayout !== null ? rupees(stats.avgPayout.toFixed(0)) : "—"} icon={BadgeIndianRupee} tone="sun" hint="per completed run" /></StaggerItem>
        <StaggerItem><StatTile label="Active days" value={stats.activeDays} icon={TrendingUp} tone="orange" hint="in the last 14 days" /></StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Packets delivered"
          subtitle="Per day, last 14 days"
          series={[{ key: "value", name: "Packets" }]}
          data={stats.packetsByDay}
          empty={{ title: "Nothing delivered recently", hint: "Deliveries from the last 14 days show up here." }}
        >
          <BarsChart data={stats.packetsByDay} series={[{ key: "value", name: "Packets" }]} />
        </ChartCard>

        <Card pad="lg">
          <SectionHeader title="At a glance" />
          <ul className="space-y-4">
            <Insight icon={Route} title={`${stats.runs + stats.closedEmpty} runs finished`} detail={`${stats.runs} delivered, ${stats.closedEmpty} closed with nothing ready`} />
            <Insight icon={Hourglass} title={`${stats.unsettled} run${stats.unsettled === 1 ? "" : "s"} awaiting payout`} detail="Included in your next settlement" />
            <Insight icon={Clock3} title="Shelf photos on record" detail={`${history.filter((h) => h.shelf_photo_url).length} of your runs have a stored shelf photo`} />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Insight({ icon: Icon, title, detail }: { icon: typeof Route; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-navy">{title}</p>
        <p className="text-sm text-muted">{detail}</p>
      </div>
    </li>
  );
}
