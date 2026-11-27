import { useState, type ReactNode } from "react";
import {
  ArrowLeft, CalendarClock, CheckCircle2, CircleHelp, CreditCard, MapPin, Package, Palette, Store, XCircle,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { openDocument, useOrder, useOrderAction } from "@/modules/student/api";
import type { OrderDetail, OrderDocument } from "@/modules/student/api/types";
import { DocumentCard } from "@/modules/student/components/DocumentCard";
import { OrderStatusPill } from "@/modules/student/components/OrderCard";
import { BINDING_LABEL, timelineSteps } from "@/modules/student/components/status";
import { CampusArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { FadeIn } from "@/shared/components/ui/motion";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { ErrorState, Skeleton, Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { formatDate, formatTime, rupees } from "@/shared/utils/format";

/** Fields the print studio adds; read defensively so older orders (and older APIs) still render. */
type StudioDoc = OrderDocument & { orientation?: "auto" | "portrait" | "landscape" };
type StudioOrder = OrderDetail & { cover_template?: string; cover_color?: string; cover_title?: string | null };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function docSpec(d: StudioDoc) {
  const colors = new Set(d.rules.map((r) => r.color));
  const sides = new Set(d.rules.map((r) => r.sided));
  const gsm = [...new Set(d.rules.map((r) => r.gsm))];
  const parts = [
    `${d.page_count ?? "?"} pages × ${d.copies}`,
    d.paper_size,
    colors.size > 1 ? "Colour + B&W" : colors.has("color") ? "Colour" : colors.size ? "B&W" : null,
    sides.size > 1 ? "Mixed sides" : sides.has("double") ? "Double-sided" : sides.size ? "Single-sided" : null,
    gsm.length === 1 ? `${gsm[0]} GSM` : null,
    d.orientation && d.orientation !== "auto" ? cap(d.orientation) : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const order = useOrder(orderId);
  const cancel = useOrderAction("cancel");
  const collect = useOrderAction("collect");
  const [confirming, setConfirming] = useState(false);

  const back = (
    <button
      type="button"
      aria-label="Back to orders"
      onClick={() => navigate("/student/orders")}
      className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background text-navy shadow-soft ring-1 ring-border/60 hover:bg-surface"
    >
      <ArrowLeft className="size-5" />
    </button>
  );

  if (order.isLoading)
    return (
      <div role="status" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-16 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    );
  if (order.isError) return <ErrorState message={order.error.message} onRetry={() => order.refetch()} />;

  const o = order.data! as StudioOrder;
  const atCabin = o.status === "delivered" || o.status === "collected";
  const closed = o.status === "cancelled" || o.status === "rejected";
  const awaiting = o.status === "awaiting_payment";
  const { steps, current } = timelineSteps(o.timeline);

  const doCancel = () =>
    cancel.mutate(o.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success("Order cancelled. Your refund is on its way.");
      },
      onError: toastError,
    });
  const doCollect = () =>
    collect.mutate(o.id, { onSuccess: () => toast.success("Enjoy your prints! Marked as collected."), onError: toastError });

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center gap-3">
        {back}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Placed {formatDate(o.created_at, { day: "numeric", month: "short", year: "numeric" })}</p>
          <h1 className="truncate font-display text-2xl font-extrabold text-navy md:text-3xl">{o.code}</h1>
        </div>
        <OrderStatusPill status={o.status} />
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-6">
          {awaiting && (
            <Card tone="sun" pad="lg" className="flex flex-wrap items-center gap-4">
              <CreditCard className="size-8 text-sun-ink" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-navy">Waiting for payment</p>
                <p className="text-sm text-ink-2">Your order isn't sent to a shop until it's paid.</p>
              </div>
              <Button asChild>
                <Link to={`/student/new/${o.id}?step=4`}>Continue to payment</Link>
              </Button>
            </Card>
          )}

          {closed && (
            <Card tone="lavender" pad="lg" className="flex items-start gap-4">
              <XCircle className="mt-0.5 size-7 shrink-0 text-muted" aria-hidden />
              <div>
                <p className="font-display text-lg font-bold text-navy">This order was {o.status}</p>
                <p className="text-sm text-ink-2">
                  {o.payment_status === "refund_pending" && "Your refund is awaiting approval."}
                  {o.payment_status === "refunded" && "Your refund has been processed."}
                  {o.payment_status !== "refund_pending" && o.payment_status !== "refunded" && "Nothing more to do here."}
                </p>
              </div>
            </Card>
          )}

          {atCabin && (
            <Card tone="midnight" pad="lg">
              <div className="relative flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-sun">{o.status === "collected" ? "Collected" : "Ready to collect"}</p>
                  <p className="mt-1 font-display text-4xl font-extrabold tracking-wider">{o.code}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
                    <MapPin className="size-4" aria-hidden /> {o.college.security_cabin}
                  </p>
                  {o.college.collection_instructions && <p className="mt-1 text-sm text-white/70">{o.college.collection_instructions}</p>}
                </div>
                <CampusArt className="hidden h-24 shrink-0 sm:block" />
              </div>
              {o.shelf_photo_url && (
                <img
                  src={o.shelf_photo_url}
                  alt={`Shelf at ${o.college.security_cabin} where packet ${o.code} was placed`}
                  className="relative mt-4 max-h-72 w-full rounded-2xl object-cover ring-1 ring-white/15"
                />
              )}
              {o.can_collect && (
                <Button size="lg" variant="success" className="relative mt-4 w-full" disabled={collect.isPending} onClick={doCollect}>
                  {collect.isPending ? <Spinner className="text-navy" /> : <><CheckCircle2 className="size-5" aria-hidden /> Collect my packet</>}
                </Button>
              )}
            </Card>
          )}

          {!closed && !awaiting && steps.length > 0 && (
            <Card pad="lg">
              <SectionHeader title="Order tracking" subtitle="Updates live as your order moves" />
              <ProgressSteps steps={steps} current={current} />
            </Card>
          )}

          <section aria-labelledby="docs">
            <SectionHeader title={<span id="docs">Documents</span>} subtitle={`${o.documents.length} file${o.documents.length === 1 ? "" : "s"}`} />
            <ul className="space-y-3">
              {o.documents.map((d) => (
                <li key={d.id}>
                  <DocumentCard
                    orderId={o.id}
                    doc={d}
                    meta={docSpec(d as StudioDoc)}
                    actions={
                      <Button variant="ghost" size="sm" onClick={() => openDocument(o.id, d.id).catch(toastError)} aria-label={`Open ${d.filename}`}>
                        Open
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <Card pad="lg">
            <SectionHeader title="Print details" />
            <dl className="space-y-3 text-sm">
              <Spec icon={Package} label="Binding" value={BINDING_LABEL[o.binding] ?? cap(o.binding)} />
              {o.cover_page && (
                <Spec
                  icon={Palette}
                  label="Cover page"
                  value={
                    <span className="flex items-center justify-end gap-2">
                      {o.cover_color && <span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: o.cover_color }} aria-hidden />}
                      {[o.cover_title || o.subject_name, o.cover_template && cap(o.cover_template.replace(/[-_]/g, " "))].filter(Boolean).join(" · ") || "Included"}
                    </span>
                  }
                />
              )}
              {o.slot && (
                <Spec icon={CalendarClock} label="Delivery" value={`${formatDate(o.slot.date, { weekday: "short", day: "numeric", month: "short" })} · ${o.slot.label} · ${formatTime(o.slot.delivery_at)}`} />
              )}
              <Spec icon={MapPin} label="Drop point" value={o.college.security_cabin} />
              <Spec icon={Store} label="Print shop" value={o.chosen_shop ? `${o.chosen_shop.shop_name}, ${o.chosen_shop.area}` : "Assigned automatically"} />
            </dl>
          </Card>

          {o.quotation && (
            <Card pad="lg">
              <SectionHeader title={awaiting ? "Amount due" : "Payment"} />
              <div className="space-y-2 text-sm">
                {o.quotation.lines.map((l) => <Line key={l.label} label={l.label} value={rupees(l.amount)} />)}
                <Line label="Delivery" value={rupees(o.quotation.delivery_fee)} />
                {Number(o.quotation.discount) > 0 && <Line label={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}`} value={`−${rupees(o.quotation.discount)}`} />}
                <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3">
                  <span className="font-semibold text-navy">{awaiting ? "Total" : "Total paid"}</span>
                  <span className="font-display text-2xl font-extrabold text-navy tabular">{rupees(o.quotation.total)}</span>
                </div>
              </div>
            </Card>
          )}

          {!closed && !awaiting && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" asChild>
                <Link to={`/student/help?order=${o.id}`}><CircleHelp className="size-4" aria-hidden /> Report an issue</Link>
              </Button>
              {o.can_cancel && (
                <Button variant="danger-soft" className="w-full" onClick={() => setConfirming(true)}>Cancel order</Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Cancel this order?"
        description="Printing hasn't started, so you're eligible for a refund."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep order</Button>
            <Button variant="danger" disabled={cancel.isPending} onClick={doCancel}>
              {cancel.isPending ? <Spinner className="text-white" /> : "Cancel order"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Order {o.code} will be cancelled. Refunds follow our published cancellation policy.</p>
      </Modal>
    </div>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted"><Icon className="size-4 shrink-0 text-primary" aria-hidden /> {label}</dt>
      <dd className="text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="min-w-0 text-muted">{label}</span>
      <span className="shrink-0 font-medium text-navy tabular">{value}</span>
    </div>
  );
}
