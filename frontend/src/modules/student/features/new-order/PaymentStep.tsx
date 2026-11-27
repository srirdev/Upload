import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Lock, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { checkout, queryKeys, setDelivery, useProfile, useQuotation, useSlots, verifyPayment } from "@/modules/student/api";
import type { OrderDetail, Slot } from "@/modules/student/api/types";
import { ComparePrices } from "@/modules/student/features/new-order/ComparePrices";
import { openRazorpay, PaymentDismissed } from "@/modules/student/features/new-order/razorpay";
import { ApiError } from "@/shared/api/client";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Skeleton, Spinner } from "@/shared/components/ui/states";
import { toast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";
import { formatDate, formatTime, rupees } from "@/shared/utils/format";

export function PaymentStep({ order }: { order: OrderDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useProfile().data!;
  const slots = useSlots(order.college.id, 3);
  const [coupon, setCoupon] = useState(order.coupon_code ?? "");
  const [busy, setBusy] = useState<"slot" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const version = [
    order.slot?.slot_id, order.slot?.date, order.coupon_code, order.binding, order.cover_page,
    order.documents.length, order.chosen_shop?.id,
  ].join("|");
  const quote = useQuotation(order.id, !!order.slot, version);

  const refreshOrder = () => qc.invalidateQueries({ queryKey: queryKeys.order(order.id) });

  async function saveDelivery(slot: Slot | { slot_id: string; date: string }, code: string | null) {
    setBusy("slot");
    setError(null);
    try {
      await setDelivery(order.id, { slot_id: slot.slot_id, slot_date: slot.date, coupon_code: code });
      await refreshOrder();
      if (code && code !== order.coupon_code) toast.success(`Coupon ${code.toUpperCase()} applied`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const c = await checkout(order.id);
      const result = await openRazorpay(c, { name: profile.full_name });
      const placed = await verifyPayment(result);
      qc.setQueryData(queryKeys.order(order.id), placed);
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
      toast.success("Payment received. Your order is placed!");
      navigate(`/student/orders/${order.id}`, { replace: true });
    } catch (e) {
      if (!(e instanceof PaymentDismissed)) setError((e as Error).message);
      // 409: the chosen shop stopped taking orders; show fresh options to choose again.
      if (e instanceof ApiError && e.status === 409) qc.invalidateQueries({ queryKey: queryKeys.shopOptions(order.id) });
      await refreshOrder();
    } finally {
      setBusy(null);
    }
  }

  const byDate = new Map<string, Slot[]>();
  slots.data?.forEach((s) => byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]));
  const selected = order.slot;

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <Card pad="lg">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><CalendarClock className="size-5" aria-hidden /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-navy">Delivery slot</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-4 text-primary" aria-hidden /> Dropped at {order.college.security_cabin}</p>
          </div>
        </div>
        {slots.isLoading && <Skeleton className="h-24" />}
        {slots.data && slots.data.length === 0 && <p className="text-sm text-muted">No slots are set up for your college yet.</p>}
        <div className="space-y-4">
          {[...byDate].map(([date, list]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{formatDate(list[0]!.delivery_at, { weekday: "short", day: "numeric", month: "short" })}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {list.map((s) => {
                  const active = selected?.slot_id === s.slot_id && selected.date === s.date;
                  return (
                    <button key={`${s.slot_id}${s.date}`} type="button" disabled={!s.is_open || busy !== null}
                      aria-pressed={active} onClick={() => saveDelivery(s, order.coupon_code)}
                      className={cn("rounded-2xl p-3 text-left ring-1 transition-all disabled:opacity-40",
                        active ? "bg-primary text-white shadow-glow ring-primary" : "bg-background ring-border hover:ring-primary/40")}>
                      <span className="block text-sm font-bold">{s.label}</span>
                      <span className={cn("text-xs", active ? "text-white/85" : "text-muted")}>
                        {s.is_open ? `Arrives ${formatTime(s.delivery_at)}` : s.remaining === 0 ? "Full" : "Closed"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Card pad="default">
          <div className="flex gap-2">
            <Input icon={Ticket} aria-label="Coupon code" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} maxLength={40} />
            <Button variant="outline" className="h-13" disabled={busy !== null}
              onClick={() => saveDelivery(selected, coupon.trim() || null)}>
              {coupon.trim() || !order.coupon_code ? "Apply" : "Remove"}
            </Button>
          </div>
          {order.coupon_code && <Badge tone="mint" className="mt-2">Coupon {order.coupon_code} applied</Badge>}
        </Card>
      )}

      {selected && <Card pad="lg"><ComparePrices order={order} version={version} /></Card>}

      <Card tone="midnight" pad="lg" aria-live="polite">
        <h2 className="mb-3 font-display text-lg font-bold">Quotation</h2>
        {!selected && <p className="text-sm text-white/75">Choose a slot to see your total.</p>}
        {selected && quote.isLoading && <Skeleton className="h-28 bg-white/10" />}
        {quote.isError && <p role="alert" className="text-sm">{quote.error.message}</p>}
        {quote.data && (
          <div className="space-y-1.5 text-sm">
            {quote.data.lines.map((l) => <Row key={l.label} label={l.label} value={rupees(l.amount)} />)}
            <Row label="Delivery" value={rupees(quote.data.delivery_fee)} />
            {quote.data.discount !== "0.00" && <Row label="Discount" value={`−${rupees(quote.data.discount)}`} />}
            <div className="flex items-end justify-between border-t border-white/15 pt-3">
              <span className="text-white/80">Total</span>
              <span className="font-display text-3xl font-extrabold tabular">{rupees(quote.data.total)}</span>
            </div>
          </div>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-white/65">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Free cancellation before printing starts. Refunds for late delivery or confirmed printing/binding defects follow our published policy.
        </p>
      </Card>

      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/70 bg-canvas/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button size="lg" className="w-full" disabled={!quote.data || busy !== null} onClick={pay}>
          {busy === "pay" ? <Spinner className="text-white" /> : <><Lock className="size-4" aria-hidden /> {quote.data ? `Pay ${rupees(quote.data.total)}` : "Pay"}</>}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="min-w-0 text-white/75">{label}</span>
      <span className="shrink-0 tabular">{value}</span>
    </div>
  );
}
