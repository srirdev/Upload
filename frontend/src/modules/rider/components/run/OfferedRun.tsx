import { useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import type { useRunAction } from "@/modules/rider/api";
import type { Run } from "@/modules/rider/api/types";
import { RunHero, RunMap } from "@/modules/rider/components/run/RunParts";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { FadeIn } from "@/shared/components/ui/motion";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { rupees } from "@/shared/utils/format";

type Actions = ReturnType<typeof useRunAction>;

/** A run offered to this rider: what it pays and where it goes, with accept (primary) and decline (confirmed). */
export function OfferedRun({ run, a }: { run: Run; a: Actions }) {
  const [confirmDecline, setConfirmDecline] = useState(false);
  const busy = a.accept.isPending || a.decline.isPending;

  const accept = () =>
    a.accept.mutate(run.id, {
      onSuccess: () => toast.success("Run accepted", { description: `Head to ${run.shops[0]?.shop_name ?? "your first pickup"}.` }),
      onError: toastError,
    });
  const decline = () =>
    a.decline.mutate(run.id, {
      onSuccess: () => {
        setConfirmDecline(false);
        toast("Run declined", { description: "It will be offered to another partner." });
      },
      onError: toastError,
    });

  return (
    <div className="space-y-5">
      <FadeIn>
        <RunHero run={run}>
          <p className="text-sm text-white/80">A new delivery run is waiting for you. Accept it to lock in the payout.</p>
        </RunHero>
      </FadeIn>

      <div className="grid gap-5 lg:grid-cols-2">
        <FadeIn delay={0.05}>
          <RunMap run={run} className="h-60 sm:h-80" />
        </FadeIn>
        <FadeIn delay={0.1}>
          <Card>
            <SectionHeader title="Route" subtitle={`${run.shop_count} pickup${run.shop_count === 1 ? "" : "s"}, then the college`} />
            <ol className="space-y-3">
              {run.shops.map((s, i) => (
                <li key={s.shop_id} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-navy">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{s.shop_name}</p>
                    <p className="truncate text-xs text-muted">{s.area}{s.landmark && ` · ${s.landmark}`}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2">
                    {s.orders.length} packet{s.orders.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mint text-navy">
                  <MapPin className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{run.college.security_cabin}</p>
                  <p className="truncate text-xs text-muted">{run.college.name}</p>
                </div>
              </li>
            </ol>
          </Card>
        </FadeIn>
      </div>

      <div className="sticky bottom-24 z-20 md:bottom-6">
        <div className="glass grid grid-cols-[1fr_2fr] gap-3 rounded-3xl p-3 shadow-lift ring-1 ring-white/70">
          <Button variant="outline" size="lg" disabled={busy} onClick={() => setConfirmDecline(true)}>
            <X className="size-5" aria-hidden /> Decline
          </Button>
          <Button size="lg" disabled={busy} onClick={accept}>
            {a.accept.isPending ? <Spinner className="text-white" /> : <><Check className="size-5" aria-hidden /> Accept · {rupees(run.guaranteed_payout)}</>}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDecline}
        onOpenChange={setConfirmDecline}
        title="Decline this run?"
        description="It will be offered to another delivery partner. You'll keep receiving new offers while you're online."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDecline(false)}>Keep it</Button>
            <Button variant="danger" disabled={a.decline.isPending} onClick={decline}>
              {a.decline.isPending ? <Spinner className="text-white" /> : "Decline run"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Batch {run.code} · {run.packet_count} packet{run.packet_count === 1 ? "" : "s"} · {rupees(run.guaranteed_payout)}
        </p>
      </Modal>
    </div>
  );
}
