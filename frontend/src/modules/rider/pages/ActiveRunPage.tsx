import { useState } from "react";
import { Radar, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { useEarnings, useRider, useRun, useRunAction } from "@/modules/rider/api";
import type { Run } from "@/modules/rider/api/types";
import { GoOnlineButton } from "@/modules/rider/components/AvailabilityToggle";
import { CompletedRun } from "@/modules/rider/components/run/CompletedRun";
import { DeliveryRun } from "@/modules/rider/components/run/DeliveryRun";
import { OfferedRun } from "@/modules/rider/components/run/OfferedRun";
import { PickupRun } from "@/modules/rider/components/run/PickupRun";
import { ScooterArt, WalletArt } from "@/shared/components/illustrations";
import { Card } from "@/shared/components/ui/card";
import { FadeIn } from "@/shared/components/ui/motion";
import { ErrorState, Skeleton } from "@/shared/components/ui/states";
import { rupees } from "@/shared/utils/format";

export function ActiveRunPage() {
  const run = useRun();
  const actions = useRunAction();
  const [finished, setFinished] = useState<Run | null>(null);

  if (finished) return <CompletedRun run={finished} onClose={() => setFinished(null)} />;
  if (run.isLoading) return <RunSkeleton />;
  if (run.isError) return <ErrorState message={run.error.message} onRetry={() => run.refetch()} />;
  const r = run.data;
  if (!r) return <Idle />;
  if (r.status === "offered") return <OfferedRun run={r} a={actions} />;
  if (r.status === "accepted") return <PickupRun run={r} a={actions} />;
  return <DeliveryRun run={r} a={actions} onDone={setFinished} />;
}

/** No run: offline prompt, or "looking for runs" radar while online. */
function Idle() {
  const rider = useRider().data;
  const earnings = useEarnings();
  const online = rider?.is_online ?? false;
  const firstName = rider?.full_name.split(" ")[0];

  return (
    <div className="space-y-5">
      <FadeIn>
        <section className="bg-midnight relative overflow-hidden rounded-4xl p-6 text-white shadow-lift sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-orange/25 blur-3xl" />
          <div className="relative grid items-center gap-6 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-white/70">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
              {online ? (
                <>
                  <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">No active run</h1>
                  <p className="mt-2 max-w-sm text-white/80">
                    New delivery runs for your college appear here as soon as they're ready. Keep this screen open.
                  </p>
                  <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/20">
                    <Wifi className="size-4 text-mint" aria-hidden /> Online · checking every few seconds
                  </p>
                </>
              ) : (
                <>
                  <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">You're offline</h1>
                  <p className="mt-2 max-w-sm text-white/80">Go online to receive delivery runs for your college.</p>
                  <div className="mt-5"><GoOnlineButton /></div>
                </>
              )}
            </div>
            <div className="relative mx-auto flex size-44 items-center justify-center">
              {online && (
                <>
                  <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-orange/30" />
                  <span aria-hidden className="absolute inset-6 animate-pulse-ring rounded-full bg-orange/30 [animation-delay:0.6s]" />
                </>
              )}
              <span className="relative flex size-36 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                {online ? <Radar className="size-14 text-sun" aria-hidden /> : <ScooterArt className="h-24 w-auto" />}
              </span>
            </div>
          </div>
        </section>
      </FadeIn>

      {earnings.data && (
        <FadeIn delay={0.08}>
          <Link to="/rider/earnings" className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-primary">
            <Card interactive className="flex items-center gap-4">
              <WalletArt className="h-16 w-auto shrink-0" />
              <div className="grid flex-1 grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-muted">Today</p>
                  <p className="font-display text-xl font-bold text-navy tabular">{rupees(earnings.data.today)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Awaiting payout</p>
                  <p className="font-display text-xl font-bold text-navy tabular">{rupees(earnings.data.unsettled)}</p>
                </div>
              </div>
            </Card>
          </Link>
        </FadeIn>
      )}
    </div>
  );
}

function RunSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <Skeleton className="h-56 rounded-4xl" />
      <Skeleton className="h-20 rounded-3xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </div>
  );
}
