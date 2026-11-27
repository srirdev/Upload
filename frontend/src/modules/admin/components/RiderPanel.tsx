import { useState } from "react";
import { BadgeCheck, Bike, CheckCircle2, FileText, Save } from "lucide-react";
import { adminGet, adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { AdminRider, College, RiderPerformance } from "@/modules/admin/api/types";
import { DrawerSection, KV, QueryBoundary, ReasonAction, approvalKind, humanize } from "@/modules/admin/components/common";
import { Avatar, IconTile, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { DonutChart } from "@/shared/components/ui/charts";
import { Drawer } from "@/shared/components/ui/dialog";
import { Segmented } from "@/shared/components/ui/fields";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { rupees } from "@/shared/utils/format";

type Zone = "none" | "primary" | "backup";

/** Signed document links are fetched on demand because they expire quickly. */
function KycDocs({ rider }: { rider: AdminRider }) {
  const open = async (which: "dl_url" | "rc_url") => {
    const w = window.open("", "_blank"); // open synchronously so popup blockers allow it
    try {
      const d = await adminGet<{ dl_url: string | null; rc_url: string | null }>(`/riders/${rider.id}/documents`);
      const url = d[which];
      if (url && w) w.location.href = url;
      else w?.close();
    } catch (e) {
      w?.close();
      toastError(e);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {([["dl_url", "Driving licence", rider.has_dl], ["rc_url", "Vehicle RC", rider.has_rc]] as const).map(([key, label, has]) => (
        <button
          key={key}
          type="button"
          disabled={!has}
          onClick={() => open(key)}
          className="flex items-center gap-3 rounded-2xl bg-background p-3 text-left ring-1 ring-border transition-colors hover:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`flex size-10 items-center justify-center rounded-xl ${has ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}`}>
            <FileText className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 text-sm">
            <span className="block font-semibold text-navy">{has ? label : `${label === "Driving licence" ? "Licence" : "RC"} missing`}</span>
            <span className="block text-xs text-muted">{has ? "Open document" : "Not uploaded"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** KYC awaiting review. Approve needs both documents. */
export function KycCard({ rider }: { rider: AdminRider }) {
  const approve = useAdminMutation(() => adminSend("POST", `/riders/${rider.id}/approve`));
  const reject = useAdminMutation((reason: string) => adminSend("POST", `/riders/${rider.id}/reject`, { reason }));
  const ready = rider.has_dl && rider.has_rc;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Avatar name={rider.full_name} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold text-navy">{rider.full_name}</p>
          <p className="truncate text-sm text-muted">{rider.base_area} · {rider.vehicle_number} · {rider.upi_id}</p>
        </div>
        <StatusPill kind="waiting">KYC pending</StatusPill>
      </div>
      <KycDocs rider={rider} />
      <div className="mt-auto flex flex-wrap gap-2">
        <Button disabled={!ready || approve.isPending} onClick={() => approve.mutate(undefined, { onSuccess: () => toast.success(`${rider.full_name} approved`), onError: toastError })}>
          {approve.isPending ? <Spinner className="text-white" /> : <><BadgeCheck className="size-4" /> Verify and approve</>}
        </Button>
        <ReasonAction
          label="Reject"
          size="default"
          title={`Reject ${rider.full_name}'s KYC?`}
          description="The rider sees this reason and can re-upload their documents."
          confirmLabel="Reject KYC"
          onSubmit={async (r) => { await reject.mutateAsync(r); toast.success("KYC rejected"); }}
        />
      </div>
      {!ready && <p className="text-xs text-muted">Both documents are needed before approval.</p>}
    </Card>
  );
}

export function RiderPanel({ rider, onClose }: { rider: AdminRider; onClose: () => void }) {
  const colleges = useAdminGet<College[]>("/colleges");
  const perf = useAdminGet<RiderPerformance>(rider.kyc_status === "approved" ? `/riders/${rider.id}/performance` : null);
  const [zones, setZones] = useState<Record<string, Zone> | null>(null);

  const current: Record<string, Zone> = zones ?? Object.fromEntries(
    (colleges.data ?? []).map((c) => [c.id, rider.primary_colleges.includes(c.name) ? "primary" : rider.backup_colleges.includes(c.name) ? "backup" : "none"]),
  );
  const save = useAdminMutation(
    () => adminSend("PUT", `/riders/${rider.id}/colleges`, {
      primary: Object.entries(current).filter(([, z]) => z === "primary").map(([id]) => id),
      backup: Object.entries(current).filter(([, z]) => z === "backup").map(([id]) => id),
    }),
    () => {
      toast.success("Zones saved");
      setZones(null);
    },
  );

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={rider.full_name} description={`${rider.base_area} · ${rider.vehicle_number}`}>
      <div className="space-y-7">
        <div className="flex flex-wrap gap-2">
          <StatusPill kind={approvalKind(rider.kyc_status)}>KYC {humanize(rider.kyc_status).toLowerCase()}</StatusPill>
          {rider.kyc_status === "approved" && <StatusPill kind={rider.is_online ? "done" : "cancelled"} live={rider.is_online}>{rider.is_online ? "Online" : "Offline"}</StatusPill>}
        </div>
        {rider.kyc_note && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{rider.kyc_note}</p>}
        <KV rows={[["UPI", rider.upi_id], ["Vehicle", rider.vehicle_number], ["Base area", rider.base_area]]} />

        <DrawerSection title="KYC documents"><KycDocs rider={rider} /></DrawerSection>

        {rider.kyc_status === "approved" && (
          <>
            <DrawerSection title="Performance">
              <QueryBoundary query={perf} loader="inline">
                {(p) => (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Tile icon={Bike} label="Runs completed" value={String(p.runs_completed)} />
                      <Tile icon={CheckCircle2} label="Total payout" value={rupees(p.total_payout)} />
                    </div>
                    {p.packets_delivered + p.packets_skipped === 0 ? (
                      <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">No packets carried yet.</p>
                    ) : (
                      <Card tone="flat">
                        <DonutChart centerLabel="packets" slices={[{ name: "Delivered", value: p.packets_delivered }, { name: "Skipped", value: p.packets_skipped }]} />
                      </Card>
                    )}
                  </div>
                )}
              </QueryBoundary>
            </DrawerSection>

            <DrawerSection title="College zones">
              <p className="text-xs text-muted">Backup riders are only offered a run when no primary rider is available.</p>
              <div className="space-y-3">
                {colleges.data?.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-navy">{c.name}</span>
                    <div className="w-64 max-w-full">
                      <Segmented<Zone>
                        size="sm"
                        label={`Zone role for ${c.name}`}
                        value={current[c.id] ?? "none"}
                        onChange={(z) => setZones({ ...current, [c.id]: z })}
                        options={[{ value: "none", label: "None" }, { value: "primary", label: "Primary" }, { value: "backup", label: "Backup" }]}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="soft" disabled={save.isPending || zones === null} onClick={() => save.mutate(undefined, { onError: toastError })}>
                {save.isPending ? <Spinner /> : <><Save className="size-4" /> Save zones</>}
              </Button>
            </DrawerSection>
          </>
        )}
      </div>
    </Drawer>
  );
}

function Tile({ icon, label, value }: { icon: typeof Bike; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
      <IconTile icon={icon} size="sm" />
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-display text-lg font-bold text-navy tabular">{value}</p>
      </div>
    </div>
  );
}
