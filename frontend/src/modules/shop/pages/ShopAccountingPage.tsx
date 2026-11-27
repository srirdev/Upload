import { useMemo } from "react";
import { BadgeCheck, CalendarClock, Hourglass, IndianRupee, Receipt, Wallet } from "lucide-react";
import { useAccounting, useDashboard, useShopOrders } from "@/modules/shop/api";
import type { Settlement } from "@/modules/shop/api/types";
import { WalletArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { BarsChart, byDay, ChartCard, rupeeFmt, TrendChart, type Datum } from "@/shared/components/ui/charts";
import { FadeIn } from "@/shared/components/ui/motion";
import { StatTile } from "@/shared/components/ui/stat";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/shared/components/ui/states";
import { formatDate, rupees } from "@/shared/utils/format";

const sum = (xs: Settlement[], f: (s: Settlement) => string) => xs.reduce((a, s) => a + Number(f(s)), 0);
const inr = (n: number) => rupees(n.toFixed(2));

export function ShopAccountingPage() {
  const q = useAccounting();
  const dash = useDashboard();
  const finished = useShopOrders("finished");

  const settlementSeries: Datum[] = useMemo(
    () => [...(q.data?.settlements ?? [])]
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .slice(-12)
      .map((s) => ({ label: formatDate(s.period_start), net: Number(s.net_amount), deductions: Number(s.refund_deductions) })),
    [q.data],
  );
  const daily = useMemo(
    () => byDay(finished.data ?? [], (o) => o.assigned_at, (o) => Number(o.entitlement ?? 0), 14),
    [finished.data],
  );

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const a = q.data!;
  const paid = a.settlements.filter((s) => s.status === "paid");
  const pending = a.settlements.filter((s) => s.status === "pending");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Earnings & payouts" title="Your money, clearly" subtitle="Earnings count once a packet is handed over. Settlements are paid weekly to your UPI or bank account." />

      <FadeIn>
        <section className="bg-midnight relative overflow-hidden rounded-4xl p-6 text-white shadow-lift md:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-orange/25 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white/75"><Hourglass className="size-4" aria-hidden /> Awaiting settlement</p>
              <p className="mt-2 font-display text-5xl font-extrabold tabular">{rupees(a.unsettled_amount)}</p>
              <p className="mt-2 text-sm text-white/75">
                From {a.unsettled_orders} completed order{a.unsettled_orders === 1 ? "" : "s"} · included in your next weekly payout
              </p>
            </div>
            <WalletArt className="h-32 w-auto shrink-0 self-end drop-shadow-xl md:h-40" />
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Earned this week" value={dash.data ? rupees(dash.data.weekly_earnings) : "–"} icon={CalendarClock} tone="violet" hint="Handed over since Monday" />
        <StatTile label="Total earned" value={dash.data ? rupees(dash.data.total_earnings) : "–"} icon={IndianRupee} tone="orange" hint="All handed-over orders" />
        <StatTile label="Paid out" value={inr(sum(paid, (s) => s.net_amount))} icon={BadgeCheck} tone="mint" hint={`${paid.length} settlement${paid.length === 1 ? "" : "s"} paid`} />
        <StatTile label="Payout pending" value={inr(sum(pending, (s) => s.net_amount))} icon={Wallet} tone="sun" hint={`${pending.length} settlement${pending.length === 1 ? "" : "s"} processing`} />
      </FadeIn>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="Weekly settlements"
          subtitle="Net payout and refund deductions per week"
          series={[{ key: "net", name: "Net payout" }, { key: "deductions", name: "Refund deductions" }]}
          data={settlementSeries}
          format={rupeeFmt}
          empty={{ title: "No settlements yet", hint: "Your first weekly settlement will chart here." }}
        >
          <BarsChart data={settlementSeries} series={[{ key: "net", name: "Net payout" }, { key: "deductions", name: "Refund deductions" }]} format={rupeeFmt} />
        </ChartCard>
        <ChartCard
          title="Earnings by day"
          subtitle="Your share of handed-over orders, by the day you received them (last 14 days)"
          series={[{ key: "value", name: "Earnings" }]}
          data={daily}
          format={rupeeFmt}
          empty={{ title: "No completed orders yet", hint: "Hand over your first order to see earnings here." }}
        >
          <TrendChart data={daily} series={[{ key: "value", name: "Earnings" }]} format={rupeeFmt} />
        </ChartCard>
      </div>

      <FadeIn delay={0.1}>
        <Card pad="lg">
          <div className="mb-4 flex items-center gap-2">
            <Receipt className="size-5 text-primary" aria-hidden />
            <h2 className="font-display text-lg font-bold text-navy">Weekly payouts</h2>
          </div>
          {a.settlements.length === 0 ? (
            <EmptyState compact art={WalletArt} title="No payouts yet" hint="Your first weekly settlement will appear here." />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr>
                      {["Week", "Orders", "Entitlement", "Refund deductions", "Net", "Status", "UPI reference"].map((h) => (
                        <th key={h} className={`px-3 py-3 font-semibold ${["Orders", "Entitlement", "Refund deductions", "Net"].includes(h) ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {a.settlements.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-surface/60">
                        <td className="px-3 py-3.5 font-medium text-navy">{formatDate(s.period_start)} – {formatDate(s.period_end)}</td>
                        <td className="px-3 py-3.5 text-right tabular">{s.order_count}</td>
                        <td className="px-3 py-3.5 text-right tabular">{rupees(s.gross_amount)}</td>
                        <td className="px-3 py-3.5 text-right tabular text-danger">{Number(s.refund_deductions) ? `− ${rupees(s.refund_deductions)}` : rupees(s.refund_deductions)}</td>
                        <td className="px-3 py-3.5 text-right font-display font-bold text-navy tabular">{rupees(s.net_amount)}</td>
                        <td className="px-3 py-3.5"><SettlementStatus s={s} /></td>
                        <td className="px-3 py-3.5 font-mono text-xs text-muted">{s.upi_reference ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Phone cards */}
              <ul className="space-y-3 md:hidden">
                {a.settlements.map((s) => (
                  <li key={s.id} className="rounded-2xl p-4 ring-1 ring-border">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">{formatDate(s.period_start)} – {formatDate(s.period_end)}</p>
                      <SettlementStatus s={s} />
                    </div>
                    <p className="mt-2 font-display text-2xl font-extrabold text-navy tabular">{rupees(s.net_amount)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {s.order_count} orders · {rupees(s.gross_amount)} entitlement · {rupees(s.refund_deductions)} deductions
                    </p>
                    {s.upi_reference && <p className="mt-1 font-mono text-xs text-muted">Ref {s.upi_reference}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}

function SettlementStatus({ s }: { s: Settlement }) {
  return s.status === "paid" ? <StatusPill kind="done">Paid</StatusPill> : <StatusPill kind="waiting">Pending</StatusPill>;
}
