import { useState } from "react";
import { Camera, CheckCircle2, ImageOff, IndianRupee, MessageSquareText, Send } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { ComplaintDetail, ComplaintRow } from "@/modules/admin/api/types";
import {
  ConfirmAction, DataTable, DrawerSection, Field, KV, QueryBoundary, ReasonAction, complaintKind, humanize, refundKind,
} from "@/modules/admin/components/common";
import { SearchArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/dialog";
import { Segmented, Textarea } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { toast, toastError } from "@/shared/components/ui/toast";
import { formatDate, formatDateTime, rupees } from "@/shared/utils/format";

const STATUSES = ["open", "in_review", "resolved", "rejected"] as const;
type Filter = "" | (typeof STATUSES)[number];

export function ComplaintsTab() {
  const [status, setStatus] = useState<Filter>("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useAdminGet<ComplaintRow[]>(`/complaints${status ? `?status=${status}` : ""}`);
  return (
    <div className="space-y-4">
      <ChipFilter<Filter>
        label="Complaint status"
        value={status}
        onChange={setStatus}
        items={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: humanize(s) }))]}
      />
      <QueryBoundary query={list}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => setOpen(r.id)}
            rowLabel={(r) => `Open complaint on ${r.order_code}`}
            highlight={(r) => r.status === "open"}
            empty={{ title: status ? "Nothing in this queue" : "No complaints", hint: "Complaints raised by students land here.", art: SearchArt }}
            columns={[
              { header: "Order", primary: true, cell: (r) => r.order_code },
              { header: "Student", cell: (r) => r.student_name ?? "—" },
              { header: "Issue", cell: (r) => humanize(r.category) },
              { header: "Status", cell: (r) => <StatusPill kind={complaintKind(r.status)}>{humanize(r.status)}</StatusPill> },
              { header: "Raised", cell: (r) => formatDate(r.created_at) },
            ]}
          />
        )}
      </QueryBoundary>
      {open && <ComplaintPanel id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ComplaintPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useAdminGet<ComplaintDetail>(`/complaints/${id}`);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={q.data ? `Complaint · ${q.data.order.code}` : "Complaint"}
      description={q.data ? `${humanize(q.data.category)} · raised ${formatDateTime(q.data.created_at)}` : undefined}
    >
      <QueryBoundary query={q}>{(c) => <ComplaintBody key={c.id + c.status} c={c} />}</QueryBoundary>
    </Drawer>
  );
}

function ComplaintBody({ c }: { c: ComplaintDetail }) {
  const [status, setStatus] = useState<"open" | "in_review" | "resolved">(c.status === "open" || c.status === "rejected" ? "in_review" : (c.status as "in_review" | "resolved"));
  const [response, setResponse] = useState(c.admin_response ?? "");
  const [amount, setAmount] = useState("");
  const [deduct, setDeduct] = useState("");

  const update = useAdminMutation(
    (v: { status: string; admin_response: string | null }) => adminSend("PATCH", `/complaints/${c.id}`, v),
    () => toast.success("Response saved"),
  );
  // useAdminMutation refreshes every admin query (lists, counters, this drawer) on success.
  const refund = useAdminMutation(() => adminSend("POST", `/complaints/${c.id}/refund`, { amount, deduct_from_shop: deduct || "0" }));
  const closed = c.status === "resolved" || c.status === "rejected";

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <StatusPill kind={complaintKind(c.status)}>{humanize(c.status)}</StatusPill>
          {c.resolved_at && <StatusPill kind="done">Resolved {formatDateTime(c.resolved_at)}</StatusPill>}
        </div>
        <p className="rounded-3xl bg-surface p-4 text-sm text-navy">
          <MessageSquareText className="mb-1 size-4 text-primary" aria-hidden />
          {c.description}
        </p>
        <KV rows={[
          ["Student", c.student.name ?? "—"],
          ["Order", `${c.order.code} · ${humanize(c.order.status)}`],
          ["Order total", c.order.total ? rupees(c.order.total) : "—"],
        ]} />
      </div>

      <DrawerSection title="Evidence">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy"><Camera className="size-4" aria-hidden /> Student's photos</p>
            {c.evidence_photo_urls.length === 0 ? <NoPhoto text="No photo attached." /> :
              c.evidence_photo_urls.map((u, i) => <Evidence key={u} url={u} alt={`Student photo ${i + 1}`} />)}
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy"><Camera className="size-4" aria-hidden /> Delivery shelf photo</p>
            {c.shelf_photo_urls.length === 0 ? <NoPhoto text="No shelf photo on record." /> :
              c.shelf_photo_urls.map((u, i) => <Evidence key={u} url={u} alt={`Shelf photo ${i + 1}`} />)}
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Custody chain">
        <ol className="relative space-y-3 border-l-2 border-primary-soft pl-5">
          {c.custody.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-orange ring-4 ring-background" aria-hidden />
              <p className="font-semibold text-navy">{humanize(e.type)}</p>
              {e.note && <p className="text-ink-2">{e.note}</p>}
              <p className="text-xs text-muted">{formatDateTime(e.at)}</p>
            </li>
          ))}
          {c.custody.length === 0 && <li className="text-sm text-muted">No custody events.</li>}
        </ol>
      </DrawerSection>

      {c.refunds.length > 0 && (
        <DrawerSection title="Refunds on this order">
          <ul className="space-y-2">
            {c.refunds.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-background p-3 text-sm ring-1 ring-border">
                <span className="font-semibold tabular">{rupees(r.amount)}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.provider_ref ?? r.reason ?? ""}</span>
                <StatusPill kind={refundKind(r.status)}>{humanize(r.status)}</StatusPill>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      <DrawerSection title="Respond to the student">
        <div className="space-y-3">
          <Segmented<"open" | "in_review" | "resolved">
            label="Complaint status"
            value={status}
            onChange={setStatus}
            options={[{ value: "open", label: "Open" }, { value: "in_review", label: "In review" }, { value: "resolved", label: "Resolved" }]}
          />
          <Field label="Message to student">
            <Textarea value={response} maxLength={2000} placeholder="What happened and what we did about it" onChange={(e) => setResponse(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={update.isPending} onClick={() => update.mutate({ status, admin_response: response || null }, { onError: toastError })}>
              {update.isPending ? <Spinner className="text-white" /> : <><Send className="size-4" /> Save response</>}
            </Button>
            {c.status !== "rejected" && (
              <ReasonAction
                label="Reject complaint"
                title="Reject this complaint?"
                description="The reason is sent to the student as our response."
                confirmLabel="Reject with reason"
                variant="danger-soft"
                size="default"
                onSubmit={(reason) => update.mutateAsync({ status: "rejected", admin_response: reason })}
              />
            )}
          </div>
          {update.error && <p role="alert" className="text-sm font-medium text-danger">{update.error.message}</p>}
        </div>
      </DrawerSection>

      {!closed && (
        <section className="space-y-3 rounded-3xl bg-mint-soft/70 p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-navy"><IndianRupee className="size-4" aria-hidden /> Approve a refund</h3>
          <p className="text-xs text-ink-2">
            Order total {c.order.total ? rupees(c.order.total) : "—"}. Late-delivery policy suggests {c.late_refund_percent}%.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refund amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Deduct from shop (₹)"><Input inputMode="decimal" placeholder="0" value={deduct} onChange={(e) => setDeduct(e.target.value)} /></Field>
          </div>
          <ConfirmAction
            label={<><CheckCircle2 className="size-4" /> Approve refund</>}
            variant="success"
            size="default"
            disabled={!amount}
            title="Approve this refund?"
            description={`Refund ₹${amount || "0"} to the student${deduct ? `, recovering ₹${deduct} from the shop` : ""}. Record the provider reference in Refunds once it is sent.`}
            confirmLabel="Approve refund"
            onConfirm={async () => {
              await refund.mutateAsync(undefined);
              toast.success("Refund approved");
              setAmount("");
              setDeduct("");
            }}
          />
        </section>
      )}
    </div>
  );
}

function NoPhoto({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-4 text-sm text-muted">
      <ImageOff className="size-4" aria-hidden /> {text}
    </p>
  );
}

function Evidence({ url, alt }: { url: string; alt: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-border transition-transform hover:scale-[1.01]">
      <img src={url} alt={alt} className="max-h-56 w-full object-cover" />
    </a>
  );
}
