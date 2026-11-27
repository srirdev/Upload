import { useState } from "react";
import { CheckCircle2, Receipt } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { RefundRow } from "@/modules/admin/api/types";
import { ConfirmAction, DataTable, Field, QueryBoundary, ReasonAction, humanize, refundKind } from "@/modules/admin/components/common";
import { WalletArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { toast } from "@/shared/components/ui/toast";
import { formatDate, rupees } from "@/shared/utils/format";

const STATUSES = ["requested", "approved", "processed", "rejected"] as const;
type Filter = "" | (typeof STATUSES)[number];

export function RefundsTab() {
  const [status, setStatus] = useState<Filter>("requested");
  const list = useAdminGet<RefundRow[]>(`/refunds${status ? `?status=${status}` : ""}`);
  return (
    <div className="space-y-4">
      <ChipFilter<Filter>
        label="Refund status"
        value={status}
        onChange={setStatus}
        items={[...STATUSES.map((s) => ({ value: s as Filter, label: s === "requested" ? "To review" : humanize(s) })), { value: "", label: "All" }]}
      />
      <QueryBoundary query={list}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={{ title: status === "requested" ? "No refunds waiting" : "No refunds in this state", hint: "Refund requests appear here for review.", art: WalletArt }}
            columns={[
              { header: "Order", primary: true, cell: (r) => <span className="font-semibold text-navy">{r.order_code}</span> },
              { header: "Amount", cell: (r) => <span className="font-semibold tabular">{rupees(r.amount)}</span> },
              { header: "Reason", cell: (r) => <span className="text-muted">{r.reason ?? "—"}</span> },
              {
                header: "Status",
                cell: (r) => (
                  <div className="space-y-1">
                    <StatusPill kind={refundKind(r.status)}>{humanize(r.status)}</StatusPill>
                    {r.provider_ref && <span className="block text-xs text-muted">{r.provider_ref}</span>}
                  </div>
                ),
              },
              { header: "Requested", cell: (r) => formatDate(r.created_at) },
              { header: "Actions", cell: (r) => <RefundActions r={r} />, className: "min-w-56" },
            ]}
          />
        )}
      </QueryBoundary>
    </div>
  );
}

function RefundActions({ r }: { r: RefundRow }) {
  const [amount, setAmount] = useState(r.amount);
  const [deduct, setDeduct] = useState("");
  const [ref, setRef] = useState("");
  const approve = useAdminMutation(() => adminSend("POST", `/refunds/${r.id}/approve`, { amount, deduct_from_shop: deduct || "0" }));
  const reject = useAdminMutation((reason: string) => adminSend("POST", `/refunds/${r.id}/reject`, { reason }));
  const record = useAdminMutation(() => adminSend("POST", `/refunds/${r.id}/record`, { provider_ref: ref }));

  if (r.status === "requested")
    return (
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          label={<><CheckCircle2 className="size-4" /> Approve</>}
          variant="success"
          title={`Approve refund for ${r.order_code}?`}
          confirmLabel="Approve refund"
          onConfirm={async () => { await approve.mutateAsync(undefined); toast.success("Refund approved"); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refund amount (₹)"><Input aria-label="Refund amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Deduct from shop (₹)"><Input aria-label="Deduct from shop" inputMode="decimal" placeholder="0" value={deduct} onChange={(e) => setDeduct(e.target.value)} /></Field>
          </div>
        </ConfirmAction>
        <ReasonAction
          label="Reject"
          title={`Reject refund for ${r.order_code}?`}
          confirmLabel="Reject refund"
          onSubmit={async (reason) => { await reject.mutateAsync(reason); toast.success("Refund rejected"); }}
        />
      </div>
    );
  if (r.status === "approved")
    return (
      <ConfirmAction
        label={<><Receipt className="size-4" /> Record payout</>}
        variant="soft"
        title="Record the refund reference"
        description="Paste the Razorpay refund ID or bank UTR once the money has been sent."
        confirmLabel="Record"
        onConfirm={async () => {
          if (ref.trim().length < 3) throw new Error("Enter the provider reference (at least 3 characters).");
          await record.mutateAsync(undefined);
          toast.success("Refund marked as processed");
        }}
      >
        <Field label="Provider reference"><Input aria-label="Provider reference" placeholder="Razorpay refund ID / UTR" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </ConfirmAction>
    );
  return <span className="text-sm text-muted">{r.decision_note ?? "—"}</span>;
}
