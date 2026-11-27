import { Power } from "lucide-react";
import { useRider, useSetAvailability } from "@/modules/rider/api";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/fields";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";

/** Shared online/offline mutation with feedback. The API refuses to go offline mid-run (409): that message is toasted. */
export function useAvailability() {
  const rider = useRider();
  const set = useSetAvailability();
  const online = rider.data?.is_online ?? false;
  const change = (next: boolean) =>
    set.mutate(next, {
      onSuccess: (r) => (r.is_online ? toast.success("You're online", { description: "New runs for your college will be offered to you." }) : toast("You're offline")),
      onError: toastError,
    });
  return { rider: rider.data, online, change, pending: set.isPending };
}

/** Compact live toggle for the top bar: new delivery runs are only offered while online. */
export function AvailabilityToggle() {
  const { rider, online, change, pending } = useAvailability();
  if (!rider) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-background py-1 pl-3 pr-1.5 shadow-soft ring-1 ring-border/60">
      <StatusPill kind={online ? "done" : "cancelled"} live={online} className="hidden min-[380px]:inline-flex">
        {online ? "Online" : "Offline"}
      </StatusPill>
      <Switch checked={online} onChange={change} disabled={pending} label="Available for deliveries" tone="mint" />
    </div>
  );
}

/** Big "Go online" call to action used on the idle screen. */
export function GoOnlineButton() {
  const { change, pending } = useAvailability();
  return (
    <Button variant="success" size="lg" className="w-full sm:w-auto" disabled={pending} onClick={() => change(true)}>
      {pending ? <Spinner className="text-navy" /> : <><Power className="size-5" aria-hidden /> Go online</>}
    </Button>
  );
}
