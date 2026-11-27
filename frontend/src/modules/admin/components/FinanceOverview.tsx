import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { CalendarRange, CreditCard, IndianRupee, Printer, Receipt, RotateCcw, Truck, Users, X } from "lucide-react";
import { adminGet, qs, useAdminGet } from "@/modules/admin/api";
import type { LedgerEntry, LedgerSummary } from "@/modules/admin/api/types";
import { DataTable, Field, Pager, Panel, QueryBoundary, humanize } from "@/modules/admin/components/common";
import { WalletArt } from "@/shared/components/illustrations";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { ChartCard, DonutChart, TrendChart, rupeeFmt, type Datum } from "@/shared/components/ui/charts";
import { Input } from "@/shared/components/ui/input";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { Skeleton } from "@/shared/components/ui/states";
import { StatTile } from "@/shared/components/ui/stat";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { formatDateTime, rupees } from "@/shared/utils/format";

const TILES: { key: keyof LedgerSummary; label: string; icon: typeof IndianRupee; tone: "violet" | "orange" | "mint" | "sun" | "danger" | "neutral" }[] = [
  { key: "gross_revenue", label: "Gross customer revenue", icon: IndianRupee, tone: "violet" },
  { key: "printing_charges", label: "Printing charges", icon: Printer, tone: "violet" },
  { key: "delivery_fee", label: "Delivery fees", icon: Truck, tone: "orange" },
  { key: "platform_commission", label: "Platform commission", icon: Receipt, tone: "mint" },
  { key: "shop_entitlement", label: "Shop entitlement", icon: Users, tone: "neutral" },
  { key: "rider_payout", label: "Rider payouts", icon: Truck, tone: "neutral" },
  { key: "gateway_fee", label: "Payment gateway charges", icon: CreditCard, tone: "sun" },
  { key: "refund", label: "Refunds", icon: RotateCcw, tone: "danger" },
];
const TYPES = ["gross_revenue", "printing_charges", "delivery_fee", "discount", "shop_entitlement", "platform_commission", "rider_payout", "gateway_fee", "refund", "shop_refund_recovery"];
const LIMIT = 50;
const TREND_DAYS = 14;

/** YYYY-MM-DD in IST for `daysAgo` days before today. */
const istDay = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - daysAgo * 86_400_000));
const shortDay = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const num = (v: string | undefined) => Math.abs(Number(v ?? 0));

/** Revenue vs net margin per day: one server-computed summary per day (exact, not sampled from the ledger). */
function useDailyTrend() {
  const days = Array.from({ length: TREND_DAYS }, (_, i) => istDay(TREND_DAYS - 1 - i));
  const results = useQueries({
    queries: days.map((d) => {
      const path = `/finance/summary${qs({ start: d, end: d })}`;
      return { queryKey: ["admin", path], queryFn: () => adminGet<LedgerSummary>(path), staleTime: 60_000 };
    }),
  });
  const loading = results.some((r) => r.isLoading);
  const data: Datum[] = days.map((d, i) => ({
    label: shortDay(d),
    revenue: Number(results[i]?.data?.gross_revenue ?? 0),
    margin: Number(results[i]?.data?.net_platform_margin ?? 0),
  }));
  return { loading, data };
}

export function FinanceOverview() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);
  const summary = useAdminGet<LedgerSummary>(`/finance/summary${qs({ start, end })}`);
  const ledger = useAdminGet<LedgerEntry[]>(`/finance/ledger${qs({ start, end, type, limit: LIMIT, offset })}`);
  const trend = useDailyTrend();
  const reset = (fn: () => void) => { fn(); setOffset(0); };
  const range = start || end ? `${start || "the beginning"} to ${end || "today"}` : "All time";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" icon={CalendarRange} value={start} onChange={(e) => reset(() => setStart(e.target.value))} /></Field>
        <Field label="To"><Input type="date" icon={CalendarRange} value={end} onChange={(e) => reset(() => setEnd(e.target.value))} /></Field>
        {(start || end) && <Button variant="ghost" onClick={() => reset(() => { setStart(""); setEnd(""); })}><X className="size-4" /> All time</Button>}
      </div>

      <QueryBoundary query={summary} loader="dashboard">
        {(s) => (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <Card tone="brand" pad="lg" className="flex flex-col justify-between gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Badge className="bg-white/15 text-white ring-1 ring-white/25">{range}</Badge>
                    <p className="mt-4 text-sm text-white/80">Net platform margin</p>
                    <p className="mt-1 font-display text-5xl font-extrabold tabular">{rupees(s.net_platform_margin)}</p>
                  </div>
                  <WalletArt className="hidden h-24 shrink-0 sm:block" />
                </div>
                <p className="max-w-md text-xs text-white/75">Revenue less shop entitlement, rider payouts, gateway charges and refunds, plus recoveries from shops.</p>
                {(s.discount !== "0.00" || s.shop_refund_recovery !== "0.00") && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/15 px-3 py-1">Coupon discounts {rupees(s.discount)}</span>
                    <span className="rounded-full bg-white/15 px-3 py-1">Recovered from shops {rupees(s.shop_refund_recovery)}</span>
                  </div>
                )}
              </Card>
              <Card pad="lg">
                <h3 className="mb-4 font-display text-lg font-bold text-navy">Where customer money goes</h3>
                {num(s.gross_revenue) === 0 ? (
                  <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">No revenue in this period yet.</p>
                ) : (
                  <DonutChart
                    format={rupeeFmt}
                    centerLabel="paid out"
                    slices={[
                      { name: "Shop entitlement", value: num(s.shop_entitlement) },
                      { name: "Rider payouts", value: num(s.rider_payout) },
                      { name: "Gateway charges", value: num(s.gateway_fee) },
                      { name: "Refunds", value: num(s.refund) },
                    ]}
                  />
                )}
              </Card>
            </div>

            <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {TILES.map((t) => (
                <StaggerItem key={t.key}><StatTile label={t.label} value={rupees(s[t.key])} icon={t.icon} tone={t.tone} /></StaggerItem>
              ))}
            </Stagger>
          </>
        )}
      </QueryBoundary>

      {trend.loading ? (
        <Skeleton className="h-80 rounded-3xl" />
      ) : (
        <ChartCard
          title="Revenue and margin"
          subtitle={`Last ${TREND_DAYS} days (IST)`}
          series={[{ key: "revenue", name: "Gross revenue" }, { key: "margin", name: "Net margin" }]}
          data={trend.data}
          format={rupeeFmt}
          empty={{ title: "No money moved in the last two weeks", hint: "The chart fills in as orders are paid." }}
        >
          <TrendChart data={trend.data} series={[{ key: "revenue", name: "Gross revenue" }, { key: "margin", name: "Net margin" }]} format={rupeeFmt} />
        </ChartCard>
      )}

      <Panel title="Ledger" subtitle="Every money movement, newest first.">
        <ChipFilter
          label="Ledger type"
          value={type}
          onChange={(v) => reset(() => setType(v))}
          items={[{ value: "", label: "All entries" }, ...TYPES.map((t) => ({ value: t, label: humanize(t) }))]}
        />
        <QueryBoundary query={ledger}>
          {(rows) => (
            <>
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                empty={{ title: "No ledger entries", hint: "Try another type or date range.", art: WalletArt }}
                columns={[
                  { header: "Type", primary: true, cell: (r) => <span className="font-semibold text-navy">{humanize(r.type)}</span> },
                  { header: "When", cell: (r) => formatDateTime(r.created_at) },
                  { header: "Amount", cell: (r) => <span className="font-semibold tabular">{rupees(r.amount)}</span>, className: "text-right" },
                  { header: "Order", cell: (r) => <code className="text-xs text-muted">{r.order_id?.slice(0, 8) ?? "—"}</code> },
                  { header: "Note", cell: (r) => <span className="text-muted">{r.note ?? ""}</span> },
                ]}
              />
              {(rows.length === LIMIT || offset > 0) && <Pager offset={offset} limit={LIMIT} count={rows.length} onChange={setOffset} />}
            </>
          )}
        </QueryBoundary>
      </Panel>
    </div>
  );
}
