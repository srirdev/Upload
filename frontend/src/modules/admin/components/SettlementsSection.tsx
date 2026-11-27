import { useState } from "react";
import { CalendarRange, CheckCircle2, Download, HandCoins, Sparkles } from "lucide-react";
import { adminSend, downloadCsv, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { GenerateResult, Settlement } from "@/modules/admin/api/types";
import { ConfirmAction, DataTable, Field, Panel, QueryBoundary } from "@/modules/admin/components/common";
import { WalletArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { toast, toastError } from "@/shared/components/ui/toast";
import { formatDate, rupees } from "@/shared/utils/format";

export type Kind = "shops" | "riders";

/** Raw rows differ between shops and riders; normalise them for one table. */
export interface RawSettlement {
  id: string;
  shop_name?: string;
  rider_name?: string;
  period_start: string;
  period_end: string;
  order_count?: number;
  batch_count?: number;
  gross_amount?: string;
  refund_deductions?: string;
  net_amount?: string;
  amount?: string;
  status: "pending" | "paid";
  upi_reference: string | null;
  payout_to: string;
}

export const normalise = (r: RawSettlement): Settlement => ({
  id: r.id, name: r.shop_name ?? r.rider_name ?? "", period_start: r.period_start, period_end: r.period_end,
  count: r.order_count ?? r.batch_count ?? 0, gross: r.gross_amount ?? null, deductions: r.refund_deductions ?? null,
  net: r.net_amount ?? r.amount ?? "0", status: r.status, upi_reference: r.upi_reference, payout_to: r.payout_to,
});

type Filter = "" | "pending" | "paid";

export function SettlementsSection({ kind }: { kind: Kind }) {
  const [status, setStatus] = useState<Filter>("pending");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const list = useAdminGet<RawSettlement[]>(`/settlements/${kind}${status ? `?status=${status}` : ""}`);
  const generate = useAdminMutation(
    () => adminSend<GenerateResult>("POST", `/settlements/${kind}/generate`, { period_start: start, period_end: end }),
    (r) => toast.success(`Created ${r.created.length} settlement${r.created.length === 1 ? "" : "s"}`, {
      description: r.skipped_existing.length ? `${r.skipped_existing.length} already existed for this period.` : undefined,
    }),
  );
  const exportCsv = () =>
    downloadCsv(`/settlements/${kind}/export.csv?status=pending`, `${kind}-payouts-pending.csv`)
      .then(() => toast.success("Payout CSV downloaded"))
      .catch(toastError);
  const who = kind === "shops" ? "Shop" : "Rider";

  return (
    <div className="space-y-5">
      <Panel
        title={kind === "shops" ? "Generate weekly shop settlements" : "Generate rider settlements"}
        subtitle={kind === "shops" ? "Entitlement for orders completed in the period, less refund recoveries." : "Twice-weekly payouts for completed runs."}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period start"><Input type="date" icon={CalendarRange} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Period end"><Input type="date" icon={CalendarRange} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Button disabled={!start || !end || generate.isPending} onClick={() => generate.mutate(undefined, { onError: toastError })}>
            {generate.isPending ? <Spinner className="text-white" /> : <><Sparkles className="size-4" /> Generate settlements</>}
          </Button>
        </div>
        {generate.error && <p role="alert" className="text-sm font-medium text-danger">{generate.error.message}</p>}
      </Panel>

      <Panel
        title={`${who} payouts`}
        actions={<Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4" /> Export payout CSV</Button>}
      >
        <ChipFilter<Filter>
          label="Settlement status"
          value={status}
          onChange={setStatus}
          items={[{ value: "pending", label: "Pending" }, { value: "paid", label: "Paid" }, { value: "", label: "All" }]}
        />
        <QueryBoundary query={list}>
          {(raw) => {
            const rows = raw.map(normalise);
            return (
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                empty={{ title: status === "pending" ? "Nothing to pay out" : "No settlements", hint: "Generate settlements for a period to see payouts here.", art: WalletArt }}
                columns={[
                  { header: who, primary: true, cell: (r) => <>{r.name}<span className="block text-xs font-normal text-muted">{r.payout_to}</span></> },
                  { header: "Period", cell: (r) => `${formatDate(r.period_start)} – ${formatDate(r.period_end)}` },
                  { header: kind === "shops" ? "Orders" : "Runs", cell: (r) => <span className="tabular">{r.count}</span> },
                  ...(kind === "shops"
                    ? [{ header: "Entitlement", cell: (r: Settlement) => (r.gross ? rupees(r.gross) : "—") },
                       { header: "Deductions", cell: (r: Settlement) => (r.deductions ? rupees(r.deductions) : "—") }]
                    : []),
                  { header: "Net payable", cell: (r) => <span className="font-display text-base font-bold tabular text-navy">{rupees(r.net)}</span> },
                  {
                    header: "Status",
                    cell: (r) => (
                      <div className="space-y-1">
                        <StatusPill kind={r.status === "paid" ? "done" : "waiting"}>{r.status === "paid" ? "Paid" : "Pending"}</StatusPill>
                        {r.upi_reference && <span className="block text-xs text-muted">{r.upi_reference}</span>}
                      </div>
                    ),
                  },
                  { header: "Actions", cell: (r) => (r.status === "pending" ? <PayAction kind={kind} row={r} /> : null) },
                ]}
              />
            );
          }}
        </QueryBoundary>
      </Panel>
    </div>
  );
}

function PayAction({ kind, row }: { kind: Kind; row: Settlement }) {
  const [ref, setRef] = useState("");
  const pay = useAdminMutation(() => adminSend("POST", `/settlements/${kind}/${row.id}/pay`, { upi_reference: ref }));
  return (
    <ConfirmAction
      label={<><HandCoins className="size-4" /> Mark paid</>}
      variant="success"
      title={`Pay ${row.name} ${rupees(row.net)}`}
      description={`Send the money to ${row.payout_to}, then record the UPI reference.`}
      confirmLabel="Mark as paid"
      onConfirm={async () => {
        if (ref.trim().length < 4) throw new Error("Enter the UPI reference (at least 4 characters).");
        await pay.mutateAsync(undefined);
        toast.success(`${row.name} marked as paid`);
      }}
    >
      <Field label="UPI reference"><Input aria-label="UPI reference" icon={CheckCircle2} placeholder="e.g. 4182 9931 0042" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
    </ConfirmAction>
  );
}
