import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/states";
import { cn } from "@/shared/utils/cn";

/**
 * Charts follow the dataviz rules: categorical hues in a fixed, validated order (never cycled);
 * thin marks (bars <= 24px, 4px rounded data-end, 2px lines); recessive hairline grid; hover tooltips;
 * a legend for 2+ series; text in ink tokens, never series colours; every chart has a table view.
 * Only feed these real API data; pass an empty array to get the empty state.
 */
export const SERIES = ["#7c3aed", "#eb6834", "#1baf7a", "#eda100"] as const;
const GRID = "#ebe6f7";
const AXIS = { fontSize: 12, fill: "#6a6488" };

export interface Datum {
  label: string;
  [series: string]: string | number;
}

export interface SeriesDef {
  key: string;
  name: string;
}

type Fmt = (v: number) => string;
const plain: Fmt = (v) => new Intl.NumberFormat("en-IN").format(v);
export const rupeeFmt: Fmt = (v) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;

/** Card wrapper: title, optional subtitle, legend, chart/table toggle, empty state. */
export function ChartCard({
  title, subtitle, series, data, format = plain, children, empty, className, action,
}: {
  title: string;
  subtitle?: ReactNode;
  series: SeriesDef[];
  data: Datum[];
  format?: Fmt;
  children: ReactNode;
  empty?: { title: string; hint?: string };
  className?: string;
  action?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const hasData = data.some((d) => series.some((s) => Number(d[s.key]) !== 0));
  return (
    <Card className={cn("flex flex-col", className)} pad="lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {hasData && (
            <button
              type="button"
              onClick={() => setTable((t) => !t)}
              aria-pressed={table}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-muted ring-1 ring-border transition-colors hover:text-navy"
            >
              {table ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
              {table ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </div>
      {!hasData ? (
        <EmptyState compact title={empty?.title ?? "No data yet"} hint={empty?.hint ?? "This fills in as activity comes in."} />
      ) : table ? (
        <DataTable series={series} data={data} format={format} />
      ) : (
        <>
          {series.length > 1 && <Legend series={series} />}
          <div className="h-64 w-full">{children}</div>
        </>
      )}
    </Card>
  );
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <span className="size-2.5 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ series, data, format }: { series: SeriesDef[]; data: Datum[]; format: Fmt }) {
  return (
    <div className="max-h-72 overflow-auto rounded-2xl ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Period</th>
            {series.map((s) => <th key={s.key} className="px-3 py-2 text-right font-semibold">{s.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-border">
              <td className="px-3 py-2 text-ink-2">{d.label}</td>
              {series.map((s) => <td key={s.key} className="px-3 py-2 text-right font-medium tabular">{format(Number(d[s.key]))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-navy px-3 py-2 text-xs text-white shadow-lift">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-white/80">{p.name}</span>
          <span className="ml-auto font-semibold tabular">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

const tip = (format: Fmt) => ({
  content: (p: object) => <TooltipBox {...(p as { active?: boolean })} format={format} />,
  cursor: { stroke: "#c4b0f5", strokeWidth: 1, fill: "rgb(237 228 255 / 0.5)" },
});

/** Change over time. One series = soft area; multiple = lines. */
export function TrendChart({ data, series, format = plain }: { data: Datum[]; series: SeriesDef[]; format?: Fmt }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[i]} stopOpacity={series.length === 1 ? 0.22 : 0.08} />
              <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => compactTick(Number(v), format)} />
        <Tooltip {...tip(format)} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={SERIES[i]}
            strokeWidth={2}
            fill={`url(#fill-${s.key})`}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={900}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Magnitude by category or period. */
export function BarsChart({ data, series, format = plain, stacked }: { data: Datum[]; series: SeriesDef[]; format?: Fmt; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => compactTick(Number(v), format)} />
        <Tooltip {...tip(format)} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={SERIES[i]}
            maxBarSize={24}
            stackId={stacked ? "a" : undefined}
            stroke={stacked ? "#fff" : undefined}
            strokeWidth={stacked ? 2 : 0}
            radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
            animationDuration={800}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Share of a whole (max 4 slices; fold the rest into "Other" before passing in). Legend lists values. */
export function DonutChart({
  slices, format = plain, centerLabel,
}: { slices: { name: string; value: number }[]; format?: Fmt; centerLabel?: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="#fff" strokeWidth={2} animationDuration={900}>
              {slices.map((s, i) => <Cell key={s.name} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip content={(p) => <TooltipBox {...(p as object)} format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold text-navy tabular">{format(total)}</span>
          {centerLabel && <span className="text-xs text-muted">{centerLabel}</span>}
        </div>
      </div>
      <ul className="w-full space-y-2">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-full" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            <span className="text-ink-2">{s.name}</span>
            <span className="ml-auto font-semibold text-navy tabular">{format(s.value)}</span>
            <span className="w-10 text-right text-xs text-muted tabular">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tiny trend line for stat tiles (de-emphasised; no axes). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function compactTick(v: number, format: Fmt) {
  if (Math.abs(v) >= 1e5) return format === rupeeFmt ? `₹${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L` : `${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return format === rupeeFmt ? `₹${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return format(v);
}

/* ---- Helpers to turn API lists into chart data (real data only) ------------------------------ */

/** Buckets items into the last `days` calendar days (IST), summing `value(item)`; missing days are 0. */
export function byDay<T>(items: T[], date: (t: T) => string | null | undefined, value: (t: T) => number, days = 14): Datum[] {
  const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const today = new Date();
  const buckets = new Map<string, Datum>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    buckets.set(keyFmt.format(d), { label: fmt.format(d), value: 0 });
  }
  for (const it of items) {
    const raw = date(it);
    if (!raw) continue;
    const b = buckets.get(keyFmt.format(new Date(raw)));
    if (b) b.value = Number(b.value) + value(it);
  }
  return [...buckets.values()];
}
