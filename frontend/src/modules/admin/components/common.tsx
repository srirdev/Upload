import { useState, useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from "react";
import { ChevronLeft, ChevronRight, ExternalLink as ExternalIcon, Search } from "lucide-react";
import { Button, type ButtonProps } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { StatusKind } from "@/shared/components/ui/badge";
import { DashboardSkeleton, EmptyState, ErrorState, ListSkeleton, Spinner } from "@/shared/components/ui/states";
import { toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";

/* ---- text helpers --------------------------------------------------------------------------- */

export const humanize = (s: string) => {
  const t = s.replace(/[_.]/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Short label for a shop service code: "print_a4_bw" -> "A4 B/W", "binding_spiral" -> "Spiral". */
export const serviceLabel = (code: string) => {
  const [kind, a = "", b] = code.split("_");
  if (kind === "print") return `${a.toUpperCase()} ${b === "bw" ? "B/W" : b === "color" ? "Colour" : humanize(b ?? "")}`.trim();
  return humanize(a || code);
};

export const mapsLink = (lat: string | number, lng: string | number) => `https://www.google.com/maps?q=${lat},${lng}`;

/* ---- status → pill kind (status is never colour-alone: StatusPill adds an icon) -------------- */

export const orderKind = (s: string): StatusKind =>
  ({
    placed: "new", accepted: "new", printing: "progress", packing: "progress", handover_verified: "progress",
    out_for_delivery: "progress", delivered: "waiting", collected: "done", cancelled: "cancelled", rejected: "problem",
    awaiting_payment: "waiting", draft: "info",
  })[s] as StatusKind ?? "info";

export const paymentKind = (s: string): StatusKind =>
  ({ paid: "done", pending: "waiting", unpaid: "waiting", failed: "problem", refund_pending: "waiting", refunded: "cancelled" })[s] as StatusKind ?? "info";

export const approvalKind = (s: string): StatusKind =>
  ({ pending: "waiting", approved: "done", rejected: "problem", suspended: "cancelled" })[s] as StatusKind ?? "info";

export const batchKind = (s: string): StatusKind =>
  ({ unassigned: "problem", offered: "waiting", accepted: "new", out_for_delivery: "progress", completed: "done", cancelled: "cancelled" })[s] as StatusKind ?? "info";

export const complaintKind = (s: string): StatusKind =>
  ({ open: "new", in_review: "progress", resolved: "done", rejected: "cancelled" })[s] as StatusKind ?? "info";

export const refundKind = (s: string): StatusKind =>
  ({ requested: "waiting", approved: "progress", processed: "done", rejected: "cancelled" })[s] as StatusKind ?? "info";

/* ---- layout --------------------------------------------------------------------------------- */

/** Titled card section. */
export function Panel({
  title, subtitle, actions, children, className, pad = "lg",
}: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: "default" | "lg" | "none" }) {
  return (
    <Card pad={pad} className={cn("space-y-4", className)}>
      {(title || actions) && (
        <div className={cn("flex flex-wrap items-start justify-between gap-3", pad === "none" && "px-5 pt-5")}>
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-bold text-navy">{title}</h2>}
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

/** Label/value rows for detail drawers. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border rounded-2xl bg-surface/60 px-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-semibold text-navy">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DrawerSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---- responsive data table ------------------------------------------------------------------ */

const desktopQuery = "(min-width: 768px)";
function subscribe(cb: () => void) {
  const m = window.matchMedia(desktopQuery);
  m.addEventListener?.("change", cb);
  return () => m.removeEventListener?.("change", cb);
}
/** True on tablet/desktop widths. Tables become stacked cards below that. */
export const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(desktopQuery).matches, () => true);

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide this column's label in the phone card (e.g. the primary title cell). */
  primary?: boolean;
}

/**
 * Desktop: a real table. Phones: each row becomes a card (primary cell as title, the rest as label/value).
 * Only one representation is rendered, so screen readers and tests see each value once.
 */
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, highlight, empty, rowLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  highlight?: (r: T) => boolean;
  empty: { title: string; hint?: string; art?: ComponentType<SVGProps<SVGSVGElement>> };
  /** Accessible name for a clickable row/card. */
  rowLabel?: (r: T) => string;
}) {
  const desktop = useIsDesktop();
  if (rows.length === 0) return <EmptyState compact {...empty} />;

  if (!desktop) {
    const primary = columns.find((c) => c.primary) ?? columns[0]!;
    const rest = columns.filter((c) => c !== primary);
    return (
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={rowKey(r)}
            className={cn(
              "rounded-3xl bg-background p-4 shadow-soft ring-1 ring-border/60",
              highlight?.(r) && "ring-2 ring-danger/40",
            )}
          >
            <div className="mb-2 font-semibold text-navy">
              {onRowClick ? (
                <button type="button" className="text-left text-primary" aria-label={rowLabel?.(r)} onClick={() => onRowClick(r)}>
                  {primary.cell(r)}
                </button>
              ) : primary.cell(r)}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {rest.map((c) => (
                <div key={c.header} className={cn(c.header === "" || c.header === "Actions" ? "col-span-2" : "")}>
                  {c.header && c.header !== "Actions" && <dt className="text-xs text-muted">{c.header}</dt>}
                  <dd className="min-w-0 text-ink-2">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5 text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>{columns.map((c) => <th key={c.header} scope="col" className={cn("px-4 py-2 font-semibold", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn(
                "group bg-background shadow-[0_1px_2px_rgb(20_15_60/0.05)] transition-colors [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl",
                onRowClick && "cursor-pointer hover:bg-primary-soft/40",
                highlight?.(r) && "bg-danger-soft/50",
              )}
            >
              {columns.map((c, i) => (
                <td key={c.header} className={cn("px-4 py-3 align-middle", c.className)}>
                  {i === 0 && onRowClick ? (
                    <button
                      type="button"
                      aria-label={rowLabel?.(r)}
                      onClick={(e) => { e.stopPropagation(); onRowClick(r); }}
                      className="text-left font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {c.cell(r)}
                    </button>
                  ) : c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- query wrapper -------------------------------------------------------------------------- */

/** Loading skeleton / error with retry / content for a query result. */
export function QueryBoundary<T>({
  query, children, loader = "list",
}: {
  query: { isLoading: boolean; isError: boolean; error: Error | null; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loader?: "list" | "dashboard" | "inline";
}) {
  if (query.isLoading) {
    if (loader === "dashboard") return <DashboardSkeleton />;
    if (loader === "inline") return <div className="flex justify-center py-6"><Spinner /></div>;
    return <ListSkeleton />;
  }
  if (query.isError) return <ErrorState compact message={query.error?.message} onRetry={() => query.refetch()} />;
  return <>{children(query.data as T)}</>;
}

/* ---- controls ------------------------------------------------------------------------------- */

export function SearchInput({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <Input icon={Search} type="search" aria-label={label} placeholder={placeholder ?? label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Button that opens a confirmation dialog asking for a required reason (reject / suspend style actions).
 * The dialog closes on success; errors show inline and as a toast.
 */
export function ReasonAction({
  label, title, description, confirmLabel, onSubmit, variant = "danger-soft", size = "sm", disabled,
}: {
  label: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  onSubmit: (reason: string) => Promise<unknown>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      setOpen(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
      toastError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button type="button" size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 3 || pending} onClick={submit}>
              {pending ? <Spinner className="text-white" /> : confirmLabel ?? label}
            </Button>
          </>
        }
      >
        <Label htmlFor="reason-input">Reason (required)</Label>
        <Textarea id="reason-input" placeholder="Explain the decision. It is recorded in the audit log." value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
      </Modal>
    </>
  );
}

/** Button that asks "Are you sure?" before running an action. */
export function ConfirmAction({
  label, title, description, confirmLabel, onConfirm, variant = "default", size = "sm", danger, disabled, children,
}: {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  danger?: boolean;
  disabled?: boolean;
  /** Extra content inside the dialog (e.g. amount inputs). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
      toastError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button type="button" size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={typeof description === "string" ? description : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={danger ? "danger" : "default"} disabled={pending} onClick={run}>
              {pending ? <Spinner className="text-white" /> : confirmLabel}
            </Button>
          </>
        }
      >
        {typeof description !== "string" && description}
        {children}
        {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
      </Modal>
    </>
  );
}

export function Pager({ offset, limit, count, onChange }: { offset: number; limit: number; count: number; onChange: (o: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm text-muted">
      <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        <ChevronLeft className="size-4" /> Previous
      </Button>
      <span className="px-2 font-semibold tabular text-ink-2">Page {offset / limit + 1}</span>
      <Button size="sm" variant="outline" disabled={count < limit} onClick={() => onChange(offset + limit)}>
        Next <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
    {children}
    <ExternalIcon className="size-3.5" aria-hidden />
  </a>
);

export const Plain = ({ children }: { children: ReactNode }) => <span className="text-muted">{children}</span>;
