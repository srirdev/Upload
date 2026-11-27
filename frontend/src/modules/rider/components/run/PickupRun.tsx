import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, MapPin, Navigation, PackageCheck, SkipForward, Timer, Truck } from "lucide-react";
import { motion } from "motion/react";
import type { useRunAction } from "@/modules/rider/api";
import type { Run, RunOrder, RunShop } from "@/modules/rider/api/types";
import { RunHero, RunMap, RunProgress } from "@/modules/rider/components/run/RunParts";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { FadeIn } from "@/shared/components/ui/motion";
import { OtpInput } from "@/shared/components/ui/otp";
import { Meter } from "@/shared/components/ui/stat";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { useNow } from "@/shared/hooks/useNow";
import { cn } from "@/shared/utils/cn";
import { countdown } from "@/shared/utils/format";

type Actions = ReturnType<typeof useRunAction>;
/** Handover codes are 4 digits (shops/service.generate_otp; PickupIn pattern ^\d{4}$). */
const CODE_LENGTH = 4;

export function PickupRun({ run, a }: { run: Run; a: Actions }) {
  const [active, setActive] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const all = run.shops.flatMap((s) => s.orders);
  const picked = all.filter((o) => o.status === "picked_up").length;

  const focusShop = (id: string) => {
    setActive(id);
    document.getElementById(`shop-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const depart = () =>
    a.depart.mutate(run.id, {
      onSuccess: () => toast.success("On the way", { description: `Drop the packets at ${run.college.security_cabin}.` }),
      onError: toastError,
    });
  const closeEmpty = () =>
    a.closeEmpty.mutate(run.id, {
      onSuccess: () => {
        setConfirmEmpty(false);
        toast("Run closed", { description: "No packets were ready, so nothing needs delivering." });
      },
      onError: toastError,
    });

  return (
    <div className="space-y-5">
      <FadeIn><RunHero run={run} /></FadeIn>
      <FadeIn delay={0.04}><RunProgress run={run} /></FadeIn>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        <FadeIn delay={0.08} className="lg:sticky lg:top-24">
          <RunMap run={run} activeId={active} onSelect={(id) => id !== "college" && focusShop(id)} className="h-56 sm:h-72 lg:h-[28rem]" />
        </FadeIn>

        <section aria-label="Pickups" className="space-y-4">
          <SectionHeader
            title="Pickup checklist"
            subtitle={`${picked} of ${all.length} packet${all.length === 1 ? "" : "s"} collected`}
            className="mb-0"
          />
          <Meter value={picked} max={all.length} tone="mint" label="Packets collected" />
          {run.shops.map((s, i) => (
            <ShopPickup key={s.shop_id} index={i} run={run} shop={s} a={a} active={active === s.shop_id} />
          ))}
        </section>
      </div>

      <div className="sticky bottom-24 z-20 md:bottom-6">
        <div className="glass flex flex-col gap-2 rounded-3xl p-3 shadow-lift ring-1 ring-white/70 sm:flex-row sm:items-center">
          <p className="px-2 text-sm text-ink-2 sm:flex-1" aria-live="polite">
            {run.can_close_empty
              ? "No packets to deliver. Close this run to free yourself for new offers."
              : run.can_depart
                ? <><b className="text-navy">All set.</b> Head to {run.college.security_cabin}.</>
                : "Collect or skip every packet to start the delivery."}
          </p>
          {run.can_close_empty ? (
            <Button variant="outline" size="lg" disabled={a.closeEmpty.isPending} onClick={() => setConfirmEmpty(true)}>
              Close empty run
            </Button>
          ) : (
            <Button size="lg" disabled={!run.can_depart || a.depart.isPending} onClick={depart}>
              {a.depart.isPending ? <Spinner className="text-white" /> : <><Truck className="size-5" aria-hidden /> Start delivery to college</>}
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Close this run?"
        description="Every packet was skipped, so there's nothing to deliver. Closing ends the run."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEmpty(false)}>Not yet</Button>
            <Button variant="dark" disabled={a.closeEmpty.isPending} onClick={closeEmpty}>
              {a.closeEmpty.isPending ? <Spinner className="text-white" /> : "Close run"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Batch {run.code}</p>
      </Modal>
    </div>
  );
}

function shopState(shop: RunShop) {
  const pending = shop.orders.some((o) => o.status === "pending");
  if (!pending) {
    return shop.orders.every((o) => o.status === "skipped")
      ? ({ kind: "cancelled", label: "Skipped" } as const)
      : ({ kind: "done", label: "Collected" } as const);
  }
  return shop.arrived_at ? ({ kind: "progress", label: "At the shop" } as const) : ({ kind: "waiting", label: "To visit" } as const);
}

function ShopPickup({ index, run, shop, a, active }: { index: number; run: Run; shop: RunShop; a: Actions; active: boolean }) {
  const qc = useQueryClient();
  const now = useNow();
  const [confirmSkip, setConfirmSkip] = useState(false);
  const left = shop.not_ready_available_at ? countdown(shop.not_ready_available_at, now) : null;
  const waiting = !!shop.arrived_at && left !== null;

  // Refresh once when the no-wait countdown ends so the server's can_mark_not_ready flag arrives promptly.
  const elapsed = useRef(false);
  useEffect(() => {
    if (shop.arrived_at && left === null && !shop.can_mark_not_ready && !elapsed.current) {
      elapsed.current = true;
      qc.invalidateQueries({ queryKey: ["rider", "run"] });
    }
  }, [shop.arrived_at, left, shop.can_mark_not_ready, qc]);

  const state = shopState(shop);
  const pendingOrders = shop.orders.filter((o) => o.status === "pending");
  const hasPending = pendingOrders.length > 0;
  const arriving = a.arrive.isPending && a.arrive.variables?.shop_id === shop.shop_id;
  const skipping = a.notReady.isPending && a.notReady.variables?.shop_id === shop.shop_id;

  // Share of the no-wait window already elapsed (real timestamps from the API).
  const windowMs = shop.arrived_at && shop.not_ready_available_at
    ? new Date(shop.not_ready_available_at).getTime() - new Date(shop.arrived_at).getTime()
    : 0;
  const elapsedMs = shop.arrived_at ? Math.min(windowMs, now - new Date(shop.arrived_at).getTime()) : 0;

  const arrive = () =>
    a.arrive.mutate({ id: run.id, shop_id: shop.shop_id }, {
      onSuccess: () => toast.success(`Arrived at ${shop.shop_name}`, { description: "Ask for each packet's handover code." }),
      onError: toastError,
    });
  const skip = () =>
    a.notReady.mutate({ id: run.id, shop_id: shop.shop_id }, {
      onSuccess: () => {
        setConfirmSkip(false);
        toast("Packets skipped", { description: "They move to the next delivery slot." });
      },
      onError: toastError,
    });

  return (
    <Card
      id={`shop-${shop.shop_id}`}
      pad="none"
      className={cn("scroll-mt-24 transition-shadow", active && "ring-2 ring-primary", !hasPending && "opacity-90")}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl font-display text-base font-extrabold",
            state.kind === "done" ? "bg-mint text-navy" : state.kind === "cancelled" ? "bg-surface text-muted" : "bg-orange text-navy",
          )}
        >
          {state.kind === "done" ? <CheckCircle2 className="size-5" aria-label="Collected" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold text-navy">{shop.shop_name}</h3>
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{shop.area}{shop.landmark && ` · ${shop.landmark}`}</span>
          </p>
        </div>
        <StatusPill kind={state.kind} live={state.kind === "progress"}>{state.label}</StatusPill>
      </div>

      <ul className="space-y-2 px-4">
        {shop.orders.map((o) => <PacketRow key={o.order_id} runId={run.id} order={o} arrived={!!shop.arrived_at} a={a} />)}
      </ul>

      <div className="space-y-3 p-4">
        {hasPending && !shop.arrived_at && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            {shop.maps_url && (
              <Button variant="outline" asChild>
                <a href={shop.maps_url} target="_blank" rel="noreferrer"><Navigation className="size-4" aria-hidden /> Navigate</a>
              </Button>
            )}
            <Button variant="dark" className={cn(!shop.maps_url && "col-span-2")} disabled={arriving} onClick={arrive}>
              {arriving ? <Spinner className="text-white" /> : <><MapPin className="size-4" aria-hidden /> I've arrived</>}
            </Button>
          </div>
        )}

        {hasPending && shop.arrived_at && (
          <div className="space-y-3 rounded-2xl bg-sun-soft p-3.5">
            <div className="flex items-start gap-2.5">
              <Timer className="mt-0.5 size-5 shrink-0 text-sun-ink" aria-hidden />
              <p aria-live="polite" className="text-sm text-navy">
                {waiting
                  ? <>Packets not ready? You can skip them in <b className="tabular">{left}</b>.</>
                  : "Shop not ready? You can skip these packets. They move to the next slot."}
              </p>
            </div>
            {waiting && windowMs > 0 && <Meter value={elapsedMs} max={windowMs} tone="sun" label="No-wait timer" />}
            <Button
              variant="outline"
              className="w-full"
              disabled={!shop.can_mark_not_ready || skipping}
              onClick={() => setConfirmSkip(true)}
            >
              <SkipForward className="size-4" aria-hidden /> Mark not ready and skip
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirmSkip}
        onOpenChange={setConfirmSkip}
        title={`Skip ${pendingOrders.length} packet${pendingOrders.length === 1 ? "" : "s"}?`}
        description={`${shop.shop_name} hasn't handed them over. They will be delivered in the next slot instead.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSkip(false)}>Keep waiting</Button>
            <Button variant="danger" disabled={skipping} onClick={skip}>
              {skipping ? <Spinner className="text-white" /> : "Skip packets"}
            </Button>
          </>
        }
      >
        <ul className="flex flex-wrap gap-2">
          {pendingOrders.map((o) => <li key={o.order_id} className="rounded-xl bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2">{o.code}</li>)}
        </ul>
      </Modal>
    </Card>
  );
}

function PacketRow({ runId, order, arrived, a }: { runId: string; order: RunOrder; arrived: boolean; a: Actions }) {
  const [code, setCode] = useState("");
  const picked = order.status === "picked_up";
  const skipped = order.status === "skipped";
  const mine = a.pickup.variables?.order_id === order.order_id;
  const verifying = a.pickup.isPending && mine;
  const failed = mine && !!a.pickup.error && !a.pickup.isPending;

  const verify = (c: string) => {
    if (c.length !== CODE_LENGTH || a.pickup.isPending) return;
    a.pickup.mutate(
      { id: runId, order_id: order.order_id, code: c },
      {
        onSuccess: () => {
          setCode("");
          toast.success(`Packet ${order.code} collected`);
        },
        onError: () => setCode(""),
      },
    );
  };

  const pill = picked ? (
    <StatusPill kind="done">Picked up</StatusPill>
  ) : skipped ? (
    <StatusPill kind="cancelled">Skipped</StatusPill>
  ) : order.code_ready ? (
    <StatusPill kind="new">Code ready</StatusPill>
  ) : (
    <StatusPill kind="waiting">{order.packed ? "Packed" : "Preparing"}</StatusPill>
  );

  return (
    <li className={cn("rounded-2xl p-3", picked ? "bg-mint-soft" : skipped ? "bg-surface" : "bg-canvas")}>
      <div className="flex items-center gap-3">
        {picked ? (
          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            <PackageCheck className="size-5 text-success" aria-hidden />
          </motion.span>
        ) : (
          <Circle className={cn("size-5", skipped ? "text-border" : "text-muted")} aria-hidden />
        )}
        <span className={cn("font-display font-bold text-navy tabular", skipped && "text-muted line-through")}>{order.code}</span>
        <span className="ml-auto">{pill}</span>
      </div>

      {order.status === "pending" && arrived && order.code_ready && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify(code);
          }}
        >
          <p className="text-center text-xs font-medium text-muted">Ask the shop for the {CODE_LENGTH}-digit handover code</p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (failed) a.pickup.reset();
              if (v.length === CODE_LENGTH) verify(v);
            }}
            length={CODE_LENGTH}
            label={`Handover code for ${order.code}`}
            disabled={verifying}
            invalid={failed}
          />
          {failed && <p role="alert" className="text-center text-sm font-medium text-danger">{a.pickup.error!.message}</p>}
          <Button type="submit" className="w-full" disabled={code.length !== CODE_LENGTH || verifying}>
            {verifying ? <Spinner className="text-white" /> : "Verify and collect"}
          </Button>
        </form>
      )}
      {order.status === "pending" && arrived && !order.code_ready && (
        <p className="mt-2 text-xs text-muted">Waiting for the shop to pack this packet and share its code. This updates on its own.</p>
      )}
    </li>
  );
}
