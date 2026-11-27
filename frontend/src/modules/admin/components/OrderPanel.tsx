import { useState, type ReactNode } from "react";
import { CreditCard, FileText, MessageSquareWarning, Store } from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import type { AdminOrder } from "@/modules/admin/api/types";
import { AssignShopDialog } from "@/modules/admin/components/AssignDialogs";
import { DrawerSection, KV, QueryBoundary, humanize, orderKind, paymentKind } from "@/modules/admin/components/common";
import { Badge, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/dialog";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { formatDateTime, rupees } from "@/shared/utils/format";

/** Order lifecycle shown as a tracker; later statuses imply the earlier ones happened. */
const LIFECYCLE = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "printing", label: "Printing" },
  { status: "packing", label: "Packing" },
  { status: "handover_verified", label: "Picked up" },
  { status: "out_for_delivery", label: "On the way" },
  { status: "delivered", label: "At cabin" },
  { status: "collected", label: "Collected" },
];

export function lifecycle(o: Pick<AdminOrder, "status" | "events">) {
  const idx = LIFECYCLE.findIndex((s) => s.status === o.status);
  const at = (status: string) => o.events.find((e) => e.type === status)?.at;
  const steps = LIFECYCLE.map((s) => ({ label: s.label, detail: at(s.status) ? formatDateTime(at(s.status)!) : null }));
  if (idx >= 0) {
    // Activity statuses are still happening; milestone statuses are done and the next step is in progress.
    const ongoing = ["printing", "packing", "out_for_delivery"].includes(o.status);
    return { steps, current: o.status === "collected" ? steps.length : ongoing ? idx : idx + 1, problem: false };
  }
  // Cancelled / rejected: stop at the furthest step the events reached.
  const reached = LIFECYCLE.reduce((m, s, i) => (at(s.status) ? i : m), -1);
  return { steps, current: reached + 1, problem: o.status === "cancelled" || o.status === "rejected" };
}

export function OrderPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const q = useAdminGet<AdminOrder>(`/orders/${orderId}`);
  const [reassign, setReassign] = useState(false);
  const o = q.data;
  return (
    <>
      <Drawer
        open
        onOpenChange={(open) => !open && onClose()}
        title={o ? `Order ${o.code}` : "Order"}
        description={o ? `${o.college} · placed ${formatDateTime(o.created_at)}` : undefined}
        footer={o?.status === "placed" ? (
          <Button variant="accent" onClick={() => setReassign(true)}><Store className="size-4" /> Reassign shop</Button>
        ) : undefined}
      >
        <QueryBoundary query={q}>
          {(o) => {
            const life = lifecycle(o);
            const timeline = [...o.events.map((e) => ({ ...e, src: "order" as const })), ...o.custody.map((e) => ({ ...e, src: "custody" as const }))]
              .sort((a, b) => a.at.localeCompare(b.at));
            return (
              <div className="space-y-7">
                <div className="flex flex-wrap gap-2">
                  <StatusPill kind={orderKind(o.status)}>{humanize(o.status)}</StatusPill>
                  <StatusPill kind={paymentKind(o.payment_status)}>Payment {humanize(o.payment_status).toLowerCase()}</StatusPill>
                  {o.complaints.length > 0 && <Badge tone="danger" icon={MessageSquareWarning}>{o.complaints.length} complaint{o.complaints.length > 1 ? "s" : ""}</Badge>}
                </div>

                <div className="rounded-3xl bg-surface/60 p-4">
                  <ProgressSteps steps={life.steps} current={life.current} problem={life.problem} />
                </div>

                <DrawerSection title="Details">
                  <KV rows={[
                    ["Student", `${o.student.name ?? "—"} · ${o.student.mobile}`],
                    ["Register no.", o.student.register_number ?? "—"],
                    ["Department", o.student.department ?? "—"],
                    ["Slot", o.slot ? `${o.slot.label} · ${o.slot.date}` : "—"],
                    ["Shop", o.shop?.name ?? "Not assigned"],
                    ["Binding", `${humanize(o.binding)}${o.cover_page ? ` + cover${o.subject_code ? ` (${o.subject_code})` : ""}` : ""}`],
                    ...(o.cover_page && (o.cover_template || o.cover_title || o.cover_color)
                      ? [["Cover design", <CoverDesign key="cover" o={o} />] as [string, ReactNode]]
                      : []),
                    ...(o.coupon_code ? [["Coupon", o.coupon_code] as [string, string]] : []),
                  ]} />
                </DrawerSection>

                <DrawerSection title={`Documents (${o.documents.length})`}>
                  <div className="space-y-2">
                    {o.documents.map((d, i) => (
                      <div key={i} className="flex gap-3 rounded-2xl bg-background p-3 ring-1 ring-border">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><FileText className="size-5" aria-hidden /></span>
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-semibold text-navy">{d.filename}</p>
                          <p className="text-xs text-muted">
                            {d.page_count ?? "?"} pages × {d.copies} {d.copies === 1 ? "copy" : "copies"} · {d.paper_size}
                            {d.orientation && ` · ${d.orientation === "auto" ? "Auto orientation" : humanize(d.orientation)}`}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                            {d.rules.map((r, j) => (
                              <li key={j}>Pages {r.page_from}–{r.page_to} · {r.color === "color" ? "Colour" : "B&W"} · {r.gsm} GSM · {humanize(r.sided)}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </DrawerSection>

                {o.quotation && (
                  <DrawerSection title="Money">
                    <KV rows={[
                      ["Printing", rupees(o.quotation.printing_amount)],
                      ["Binding", rupees(o.quotation.binding_amount)],
                      ["Cover pages", rupees(o.quotation.cover_amount)],
                      ["Delivery", rupees(o.quotation.delivery_fee)],
                      ["Discount", `− ${rupees(o.quotation.discount)}`],
                      ["Total paid", <span key="t" className="font-display text-base">{rupees(o.quotation.total)}</span>],
                      ...(o.shop_entitlement ? [["Shop entitlement", rupees(o.shop_entitlement)] as [string, string]] : []),
                      ...(o.commission_amount ? [["Platform commission", rupees(o.commission_amount)] as [string, string]] : []),
                    ]} />
                  </DrawerSection>
                )}

                {(o.payments.length > 0 || o.refunds.length > 0) && (
                  <DrawerSection title="Payments and refunds">
                    <ul className="space-y-2 text-sm">
                      {o.payments.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-background p-3 ring-1 ring-border">
                          <CreditCard className="size-4 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-ink-2">{p.provider_payment_id ?? p.provider_order_id}{!p.is_current && " (superseded)"}</span>
                          <span className="font-semibold tabular">{rupees(p.amount)}</span>
                          <StatusPill kind={paymentKind(p.status)}>{humanize(p.status)}</StatusPill>
                        </li>
                      ))}
                      {o.refunds.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-orange-soft/60 p-3">
                          <span className="min-w-0 flex-1 truncate text-ink-2">Refund{r.provider_ref && ` · ${r.provider_ref}`}</span>
                          <span className="font-semibold tabular">{rupees(r.amount)}</span>
                          <Badge tone="orange">{humanize(r.status)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </DrawerSection>
                )}

                {o.shelf_photo_url && (
                  <DrawerSection title="Shelf photo">
                    <a href={o.shelf_photo_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-3xl ring-1 ring-border">
                      <img src={o.shelf_photo_url} alt={`Shelf photo for order ${o.code}`} className="max-h-72 w-full object-cover" />
                    </a>
                  </DrawerSection>
                )}

                <DrawerSection title="Activity">
                  <ol className="relative space-y-3 border-l-2 border-primary-soft pl-5">
                    {timeline.map((e, i) => (
                      <li key={i} className="relative text-sm">
                        <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-background ${e.src === "custody" ? "bg-orange" : "bg-primary"}`} aria-hidden />
                        <p className="font-semibold text-navy">
                          {humanize(e.type)}
                          {e.src === "custody" && <span className="ml-2 rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">Custody</span>}
                        </p>
                        {e.note && <p className="text-ink-2">{e.note}</p>}
                        <p className="text-xs text-muted">{formatDateTime(e.at)}</p>
                      </li>
                    ))}
                    {timeline.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
                  </ol>
                </DrawerSection>
              </div>
            );
          }}
        </QueryBoundary>
      </Drawer>
      {reassign && <AssignShopDialog orderId={orderId} onClose={() => setReassign(false)} />}
    </>
  );
}

/** Cover page design chosen by the student: template, title and a swatch of the colour. */
function CoverDesign({ o }: { o: Pick<AdminOrder, "cover_template" | "cover_color" | "cover_title"> }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {o.cover_template && <span>{humanize(o.cover_template)}</span>}
      {o.cover_title && <span className="font-normal text-ink-2">“{o.cover_title}”</span>}
      {o.cover_color && (
        <span className="inline-flex items-center gap-1.5 font-normal text-ink-2">
          <span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: /^#[0-9a-f]{3,8}$/i.test(o.cover_color) ? o.cover_color : undefined }} aria-hidden />
          {o.cover_color}
        </span>
      )}
    </span>
  );
}
