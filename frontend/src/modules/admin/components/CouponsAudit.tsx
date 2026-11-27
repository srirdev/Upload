import { useMemo, useState } from "react";
import { BadgePercent, Plus, TicketPercent } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { AuditEntry, Coupon } from "@/modules/admin/api/types";
import { Field, Panel, QueryBoundary, SearchInput, humanize } from "@/modules/admin/components/common";
import { GiftArt, SearchArt } from "@/shared/components/illustrations";
import { Badge, StatusPill, type Tone } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { Segmented, Switch } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { EmptyState, Spinner } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { toast, toastError } from "@/shared/components/ui/toast";
import { formatDateTime } from "@/shared/utils/format";

export function CouponsPanel() {
  const list = useAdminGet<Coupon[]>("/coupons");
  const [creating, setCreating] = useState(false);
  const toggle = useAdminMutation((c: Coupon) => adminSend("PUT", "/coupons", { ...c, active: !c.active }), () => toast.success("Coupon updated"));
  return (
    <Panel
      title="Coupons"
      subtitle="Discounts students can apply at checkout. The platform bears the discount."
      actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> New coupon</Button>}
    >
      <QueryBoundary query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState compact art={GiftArt} title="No coupons yet" hint="Create one to run a campus promotion." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((c) => (
                <Card key={c.code} tone={c.active ? "violet" : "lavender"} className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-bold tracking-wider text-navy">{c.code}</p>
                      <p className="font-display text-3xl font-extrabold text-primary">{c.percent_off ? `${c.percent_off}% off` : `₹${c.flat_off} off`}</p>
                    </div>
                    <TicketPercent className="size-8 shrink-0 text-primary/40" aria-hidden />
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-primary/25 pt-3">
                    <div className="space-y-1">
                      <StatusPill kind={c.active ? "done" : "cancelled"}>{c.active ? "Active" : "Inactive"}</StatusPill>
                      <p className="text-xs text-muted">{c.valid_until ? `Until ${formatDateTime(c.valid_until)}` : "No expiry"}</p>
                    </div>
                    <Switch label={`${c.active ? "Deactivate" : "Activate"} ${c.code}`} checked={c.active} disabled={toggle.isPending} onChange={() => toggle.mutate(c, { onError: toastError })} />
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </QueryBoundary>
      {creating && <CouponDialog onClose={() => setCreating(false)} />}
    </Panel>
  );
}

function CouponDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const save = useAdminMutation(
    () => adminSend("PUT", "/coupons", {
      code, active: true, percent_off: kind === "percent" ? value : null, flat_off: kind === "flat" ? value : null,
      valid_until: validUntil ? new Date(`${validUntil}T23:59:59+05:30`).toISOString() : null,
    }),
    () => { toast.success(`Coupon ${code} saved`); onClose(); },
  );
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="New coupon"
      description="Saving an existing code updates it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={code.length < 2 || !value || save.isPending} onClick={() => save.mutate(undefined, { onError: toastError })}>
            {save.isPending ? <Spinner className="text-white" /> : <><BadgePercent className="size-4" /> Save coupon</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Code"><Input className="font-mono uppercase tracking-wider" value={code} maxLength={40} placeholder="WELCOME10" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} /></Field>
        <Field label="Discount type">
          <Segmented<"percent" | "flat"> label="Discount type" value={kind} onChange={setKind} options={[{ value: "percent", label: "Percent" }, { value: "flat", label: "Flat ₹" }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "percent" ? "Percent off" : "Amount off (₹)"}><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field label="Valid until (optional)"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        </div>
        {save.error && <p role="alert" className="text-sm font-medium text-danger">{save.error.message}</p>}
      </div>
    </Modal>
  );
}

/* ---- audit history ------------------------------------------------------------------------- */

const ENTITIES = ["", "order", "shop", "rider", "batch", "refund", "complaint", "coupon", "college", "slot", "platform_config", "rate_card", "shop_settlement", "rider_settlement"];

const verbTone = (action: string): Tone => {
  const v = action.split(".")[1] ?? action;
  if (/reject|suspend/.test(v)) return "danger";
  if (/approve|pay|record/.test(v)) return "mint";
  if (/create|generate|upsert/.test(v)) return "violet";
  return "orange";
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Filterable audit timeline grouped by day (latest 100 entries per filter, from the API). */
export function AuditPanel() {
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const list = useAdminGet<AuditEntry[]>(`/audit${entity ? `?entity=${encodeURIComponent(entity)}` : ""}`);
  return (
    <Panel title="Audit history" subtitle="Every admin decision and settings change, newest first." actions={<SearchInput className="w-full sm:w-64" label="Search audit entries" placeholder="Action, ID or detail" value={q} onChange={setQ} />}>
      <ChipFilter label="Entity" value={entity} onChange={setEntity} items={ENTITIES.map((e) => ({ value: e, label: e ? humanize(e) : "Everything" }))} />
      <QueryBoundary query={list}>{(rows) => <AuditTimeline rows={rows} q={q} />}</QueryBoundary>
    </Panel>
  );
}

function AuditTimeline({ rows, q }: { rows: AuditEntry[]; q: string }) {
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = rows.filter((a) => !needle || `${a.action} ${a.entity} ${a.entity_id ?? ""} ${JSON.stringify(a.data ?? {})}`.toLowerCase().includes(needle));
    const out = new Map<string, AuditEntry[]>();
    for (const a of hit) {
      const d = dayLabel(a.created_at);
      out.set(d, [...(out.get(d) ?? []), a]);
    }
    return [...out.entries()];
  }, [rows, q]);

  if (groups.length === 0) return <EmptyState compact art={SearchArt} title="No audit entries" hint={q ? "Nothing matches that search." : "Admin actions are recorded here."} />;
  return (
    <div className="space-y-6">
      {groups.map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">{day}</h3>
          <ol className="relative space-y-3 border-l-2 border-primary-soft pl-6">
            {items.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[31px] top-3 size-3.5 rounded-full bg-primary ring-4 ring-background" aria-hidden />
                <div className="rounded-2xl bg-background p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={verbTone(a.action)}>{humanize(a.action)}</Badge>
                    <span className="text-sm text-ink-2">{humanize(a.entity)}{a.entity_id && <code className="ml-1 text-xs text-muted">{a.entity_id.slice(0, 8)}</code>}</span>
                    <span className="ml-auto text-xs text-muted">{new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(a.created_at))}</span>
                  </div>
                  {a.data && Object.keys(a.data).length > 0 && (
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {Object.entries(a.data).slice(0, 6).map(([k, v]) => (
                        <div key={k} className="flex min-w-0 gap-2">
                          <dt className="shrink-0 text-muted">{humanize(k)}</dt>
                          <dd className="truncate font-medium text-navy" title={typeof v === "string" ? v : JSON.stringify(v)}>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
