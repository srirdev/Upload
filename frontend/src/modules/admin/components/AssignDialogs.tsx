import { useState } from "react";
import { Bike, Store } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { AdminRider, AdminShop } from "@/modules/admin/api/types";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { EmptyState, ListSkeleton, Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { SearchInput } from "@/modules/admin/components/common";
import { cn } from "@/shared/utils/cn";

/** Selectable option card used by both pickers. */
function Choice({ selected, onSelect, title, detail, badge }: { selected: boolean; onSelect: () => void; title: string; detail: string; badge?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
        selected ? "bg-primary-soft ring-2 ring-primary" : "bg-background ring-border hover:ring-primary/40",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-navy">{title}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
      {badge && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">{badge}</span>}
    </button>
  );
}

/** Pick an approved shop for an order that no shop has accepted yet. */
export function AssignShopDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const shops = useAdminGet<AdminShop[]>("/shops?status=approved");
  const [shopId, setShopId] = useState("");
  const [q, setQ] = useState("");
  const assign = useAdminMutation(() => adminSend("POST", `/orders/${orderId}/assign-shop`, { shop_id: shopId }), () => {
    toast.success("Order reassigned");
    onClose();
  });
  const list = (shops.data ?? []).filter((s) => `${s.shop_name} ${s.area}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reassign order to a shop"
      description="Only approved shops are listed. The shop is notified straight away."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!shopId || assign.isPending} onClick={() => assign.mutate(undefined, { onError: toastError })}>
            {assign.isPending ? <Spinner className="text-white" /> : <><Store className="size-4" /> Assign shop</>}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchInput label="Search shops" value={q} onChange={setQ} />
        {shops.isLoading ? <ListSkeleton rows={2} /> : list.length === 0 ? (
          <EmptyState compact title="No approved shops" hint={shops.error?.message ?? "Approve a shop first."} />
        ) : (
          <div role="radiogroup" aria-label="Approved shop" className="max-h-80 space-y-2 overflow-y-auto p-0.5">
            {list.map((s) => (
              <Choice key={s.id} selected={shopId === s.id} onSelect={() => setShopId(s.id)} title={s.shop_name}
                detail={`${s.area}${s.colleges.length ? ` · ${s.colleges.join(", ")}` : ""}`} badge={s.is_open ? "Open" : "Closed"} />
            ))}
          </div>
        )}
        {assign.error && <p role="alert" className="text-sm font-medium text-danger">{assign.error.message}</p>}
      </div>
    </Modal>
  );
}

/** Assign (or replace with) a specific rider, e.g. a backup rider, before the trip departs. */
export function AssignRiderDialog({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const riders = useAdminGet<AdminRider[]>("/riders?kyc=approved");
  const [riderId, setRiderId] = useState("");
  const [q, setQ] = useState("");
  const assign = useAdminMutation(() => adminSend("POST", `/batches/${batchId}/assign-rider`, { rider_id: riderId }), () => {
    toast.success("Rider assigned to the run");
    onClose();
  });
  const list = (riders.data ?? [])
    .filter((r) => `${r.full_name} ${r.base_area}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.is_online) - Number(a.is_online));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assign a rider"
      description="Approved delivery partners, online riders first."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!riderId || assign.isPending} onClick={() => assign.mutate(undefined, { onError: toastError })}>
            {assign.isPending ? <Spinner className="text-white" /> : <><Bike className="size-4" /> Assign rider</>}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchInput label="Search riders" value={q} onChange={setQ} />
        {riders.isLoading ? <ListSkeleton rows={2} /> : list.length === 0 ? (
          <EmptyState compact title="No approved riders" hint={riders.error?.message ?? "Approve a delivery partner's KYC first."} />
        ) : (
          <div role="radiogroup" aria-label="Approved rider" className="max-h-80 space-y-2 overflow-y-auto p-0.5">
            {list.map((r) => (
              <Choice
                key={r.id}
                selected={riderId === r.id}
                onSelect={() => setRiderId(r.id)}
                title={r.full_name}
                detail={`${r.base_area} · ${r.primary_colleges.length ? `Primary: ${r.primary_colleges.join(", ")}` : r.backup_colleges.length ? `Backup: ${r.backup_colleges.join(", ")}` : "No zone"}`}
                badge={r.is_online ? "Online" : "Offline"}
              />
            ))}
          </div>
        )}
        {assign.error && <p role="alert" className="text-sm font-medium text-danger">{assign.error.message}</p>}
      </div>
    </Modal>
  );
}

