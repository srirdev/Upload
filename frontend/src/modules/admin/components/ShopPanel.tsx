import { useState } from "react";
import { Ban, CheckCircle2, MapPin, Navigation, Save, Store } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { AdminShop, College, ShopPerformance } from "@/modules/admin/api/types";
import {
  ConfirmAction, DrawerSection, ExternalLink, Field, KV, QueryBoundary, ReasonAction, approvalKind, humanize, mapsLink, serviceLabel,
} from "@/modules/admin/components/common";
import { MapView, coords } from "@/shared/components/map";
import { Badge, IconTile, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { DonutChart } from "@/shared/components/ui/charts";
import { Drawer } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";
import { formatDate, rupees } from "@/shared/utils/format";

const payout = (s: AdminShop) => s.upi_id ?? (s.bank_account_number ? `${s.bank_account_name ?? ""} · ${s.bank_account_number} / ${s.bank_ifsc ?? ""}` : "Not set");

export function ShopPanel({ shop, onClose }: { shop: AdminShop; onClose: () => void }) {
  const perf = useAdminGet<ShopPerformance>(`/shops/${shop.id}/performance`);
  const colleges = useAdminGet<College[]>("/colleges");
  const [lat, setLat] = useState(shop.latitude);
  const [lng, setLng] = useState(shop.longitude);
  const [zones, setZones] = useState<Set<string> | null>(null);

  const selected = zones ?? new Set(colleges.data?.filter((c) => shop.colleges.includes(c.name)).map((c) => c.id) ?? []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setZones(next);
  };

  const location = useAdminMutation(() => adminSend("PUT", `/shops/${shop.id}/location`, { latitude: lat, longitude: lng }), () => toast.success("Location saved"));
  const saveZones = useAdminMutation(() => adminSend("PUT", `/shops/${shop.id}/colleges`, { college_ids: [...selected] }), () => {
    toast.success("College zones saved");
    setZones(null);
  });
  const suspend = useAdminMutation(() => adminSend("POST", `/shops/${shop.id}/suspend`));
  const approve = useAdminMutation(() => adminSend("POST", `/shops/${shop.id}/approve`));
  const point = coords(lat, lng);

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={shop.shop_name}
      description={`${shop.owner_name} · ${shop.area}${shop.landmark ? ` · ${shop.landmark}` : ""}`}
      footer={
        shop.status === "approved" ? (
          <ConfirmAction
            label={<><Ban className="size-4" /> Suspend shop</>}
            variant="danger-soft"
            size="default"
            danger
            title={`Suspend ${shop.shop_name}?`}
            description="The shop stops receiving new orders until it is approved again."
            confirmLabel="Suspend shop"
            onConfirm={async () => { await suspend.mutateAsync(undefined); toast.success("Shop suspended"); }}
          />
        ) : (
          <ConfirmAction
            label={<><CheckCircle2 className="size-4" /> Approve shop</>}
            size="default"
            title={`Approve ${shop.shop_name}?`}
            description="The shop can open and start receiving orders for its college zones."
            confirmLabel="Approve"
            onConfirm={async () => { await approve.mutateAsync(undefined); toast.success("Shop approved"); }}
          />
        )
      }
    >
      <div className="space-y-7">
        <div className="flex flex-wrap gap-2">
          <StatusPill kind={approvalKind(shop.status)}>{humanize(shop.status)}</StatusPill>
          {shop.status === "approved" && <StatusPill kind={shop.is_open ? "done" : "cancelled"} live={shop.is_open}>{shop.is_open ? "Open now" : "Closed"}</StatusPill>}
          {shop.rejection_reason && <Badge tone="danger">{shop.rejection_reason}</Badge>}
        </div>

        <KV rows={[
          ["Payout to", payout(shop)],
          ["Registered", formatDate(shop.created_at)],
          ["Services", shop.services.length ? shop.services.map(serviceLabel).join(", ") : "None"],
        ]} />

        <DrawerSection title="Performance">
          <QueryBoundary query={perf} loader="inline">
            {(p) => (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total entitlement" value={rupees(p.total_entitlement)} />
                  <MiniStat label="Rejection rate" value={`${Math.round(p.rejection_rate * 100)}%`} />
                </div>
                {p.orders_assigned + p.rejections + p.not_ready_skips === 0 ? (
                  <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">No orders handled yet.</p>
                ) : (
                  <Card tone="flat" pad="default">
                    <DonutChart
                      centerLabel="events"
                      slices={[
                        { name: "Completed", value: p.orders_completed },
                        { name: "In progress", value: Math.max(0, p.orders_assigned - p.orders_completed) },
                        { name: "Rejected", value: p.rejections },
                        { name: "Not-ready skips", value: p.not_ready_skips },
                      ]}
                    />
                  </Card>
                )}
              </div>
            )}
          </QueryBoundary>
        </DrawerSection>

        <DrawerSection title="Map location" action={point && <ExternalLink href={mapsLink(lat, lng)}>Google Maps</ExternalLink>}>
          <MapView className="h-48" points={point ? [{ id: shop.id, ...point, label: shop.shop_name, kind: "shop", detail: shop.area }] : []} emptyHint="Enter valid coordinates to see the pin." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></Field>
            <Field label="Longitude"><Input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></Field>
          </div>
          <Button size="sm" variant="soft" disabled={location.isPending || (lat === shop.latitude && lng === shop.longitude)} onClick={() => location.mutate(undefined, { onError: toastError })}>
            {location.isPending ? <Spinner /> : <><Navigation className="size-4" /> Save location</>}
          </Button>
        </DrawerSection>

        <DrawerSection title="College zones">
          <div className="flex flex-wrap gap-2">
            {colleges.data?.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition-colors",
                    on ? "bg-primary text-white ring-primary" : "bg-background text-ink-2 ring-border hover:ring-primary/40",
                  )}
                >
                  {on && <CheckCircle2 className="size-4" aria-hidden />}
                  {c.name}
                </button>
              );
            })}
            {colleges.data?.length === 0 && <p className="text-sm text-muted">Add a college first.</p>}
          </div>
          <Button size="sm" variant="soft" disabled={saveZones.isPending || zones === null} onClick={() => saveZones.mutate(undefined, { onError: toastError })}>
            {saveZones.isPending ? <Spinner /> : <><Save className="size-4" /> Save zones</>}
          </Button>
        </DrawerSection>
      </div>
    </Drawer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-navy tabular">{value}</p>
    </div>
  );
}

/** Registration awaiting review: everything needed to decide, plus approve / reject. */
export function PendingShopCard({ shop }: { shop: AdminShop }) {
  const approve = useAdminMutation(() => adminSend("POST", `/shops/${shop.id}/approve`));
  const reject = useAdminMutation((reason: string) => adminSend("POST", `/shops/${shop.id}/reject`, { reason }));
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Store} tone="orange" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold text-navy">{shop.shop_name}</p>
          <p className="truncate text-sm text-muted">{shop.owner_name} · {shop.area}{shop.landmark && ` · ${shop.landmark}`}</p>
        </div>
        <StatusPill kind="waiting">Pending</StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <span>Payout: {shop.upi_id ?? "Bank account"}</span>
        <ExternalLink href={mapsLink(shop.latitude, shop.longitude)}><MapPin className="size-3.5" aria-hidden /> View location</ExternalLink>
      </div>
      {shop.services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shop.services.map((s) => <Badge key={s} tone="violet">{serviceLabel(s)}</Badge>)}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button disabled={approve.isPending} onClick={() => approve.mutate(undefined, { onSuccess: () => toast.success(`${shop.shop_name} approved`), onError: toastError })}>
          {approve.isPending ? <Spinner className="text-white" /> : <><CheckCircle2 className="size-4" /> Approve</>}
        </Button>
        <ReasonAction
          label="Reject"
          size="default"
          title={`Reject ${shop.shop_name}?`}
          description="The owner sees this reason and can fix their registration."
          confirmLabel="Reject shop"
          onSubmit={async (r) => { await reject.mutateAsync(r); toast.success("Registration rejected"); }}
        />
      </div>
    </Card>
  );
}

