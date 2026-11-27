import { useState } from "react";
import { CheckCircle2, Images, Navigation, ShieldCheck } from "lucide-react";
import type { useRunAction } from "@/modules/rider/api";
import type { Run } from "@/modules/rider/api/types";
import { RunHero, RunMap, RunProgress } from "@/modules/rider/components/run/RunParts";
import { CampusArt } from "@/shared/components/illustrations";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { CameraCapture } from "@/shared/components/ui/camera";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { FadeIn } from "@/shared/components/ui/motion";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { UploadProgress } from "@/shared/components/ui/upload";

type Actions = ReturnType<typeof useRunAction>;

/** Out for delivery: drop point, packets for the shelf, camera shelf photo, then complete. */
export function DeliveryRun({ run, a, onDone }: { run: Run; a: Actions; onDone: (r: Run) => void }) {
  const [progress, setProgress] = useState(0);
  const codes = run.shops.flatMap((s) => s.orders.filter((o) => o.status === "picked_up").map((o) => o.code));
  const photos = run.shelf_photo_count;

  const upload = (file: File) => {
    setProgress(0);
    a.photo.mutate(
      { id: run.id, file, onProgress: setProgress },
      { onSuccess: () => toast.success("Shelf photo uploaded"), onError: toastError },
    );
  };
  const complete = () =>
    a.complete.mutate(run.id, {
      onSuccess: (r) => onDone(r ?? run),
      onError: toastError,
    });

  return (
    <div className="space-y-5">
      <FadeIn><RunHero run={run} /></FadeIn>
      <FadeIn delay={0.04}><RunProgress run={run} /></FadeIn>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <FadeIn delay={0.08}>
            <Card tone="mint" className="flex items-center gap-4">
              <CampusArt className="h-20 w-auto shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-success">Drop point</p>
                <h2 className="font-display text-lg font-bold text-navy">{run.college.security_cabin}</h2>
                {run.college.drop_instructions && <p className="text-sm text-ink-2">{run.college.drop_instructions}</p>}
              </div>
            </Card>
          </FadeIn>
          <FadeIn delay={0.1}>
            <RunMap run={run} focus="drop" className="h-52 sm:h-64" />
          </FadeIn>
          {run.college.maps_url && (
            <Button variant="dark" size="lg" className="w-full" asChild>
              <a href={run.college.maps_url} target="_blank" rel="noreferrer"><Navigation className="size-5" aria-hidden /> Navigate to college</a>
            </Button>
          )}
        </div>

        <div className="space-y-5">
          <FadeIn delay={0.12}>
            <Card>
              <SectionHeader title="Packets for the shelf" subtitle={`Place all ${codes.length} on the UpLOAD shelf`} />
              <ul className="flex flex-wrap gap-2">
                {codes.map((c) => (
                  <li key={c} className="rounded-xl bg-primary-soft px-3 py-1.5 font-display text-sm font-bold text-primary tabular">{c}</li>
                ))}
              </ul>
            </Card>
          </FadeIn>

          <FadeIn delay={0.14}>
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeader title="Shelf photo" subtitle="Required to complete the delivery" className="mb-0" />
                {photos > 0 && (
                  <Badge tone="mint" icon={Images}>{photos} photo{photos > 1 ? "s" : ""} uploaded</Badge>
                )}
              </div>
              {a.photo.isPending ? (
                <UploadProgress name="Shelf photo" fraction={progress} />
              ) : (
                <CameraCapture
                  key={photos}
                  label={photos > 0 ? "Add another photo" : "Take shelf photo"}
                  hint="Show every packet on the shelf, with the codes visible."
                  onConfirm={upload}
                  busy={a.photo.isPending}
                  confirmLabel="Upload photo"
                />
              )}
            </Card>
          </FadeIn>
        </div>
      </div>

      <div className="sticky bottom-24 z-20 md:bottom-6">
        <div className="glass flex flex-col gap-2 rounded-3xl p-3 shadow-lift ring-1 ring-white/70 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 px-2 text-sm text-ink-2 sm:flex-1" aria-live="polite">
            {photos > 0 ? (
              <><CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> Photo in. You're ready to finish.</>
            ) : (
              <><ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden /> A photo of the shelf is required to complete the delivery.</>
            )}
          </p>
          <Button variant="success" size="lg" disabled={photos < 1 || a.complete.isPending} onClick={complete}>
            {a.complete.isPending ? <Spinner className="text-navy" /> : <><CheckCircle2 className="size-5" aria-hidden /> Complete delivery</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
