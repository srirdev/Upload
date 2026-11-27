import { useState } from "react";
import { BookOpen, Percent, Save, Settings2, Truck, Upload } from "lucide-react";
import { adminSend, useAdminGet, useAdminMutation } from "@/modules/admin/api";
import type { BindingPrice, Config, Rate } from "@/modules/admin/api/types";
import { Panel, QueryBoundary, humanize } from "@/modules/admin/components/common";
import { IconTile } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";

type F = { key: keyof Config; label: string; unit: string };
const GROUPS: { title: string; icon: typeof Percent; tone: "violet" | "orange" | "mint" | "sun"; fields: F[] }[] = [
  {
    title: "Customer pricing", icon: Percent, tone: "violet",
    fields: [
      { key: "commission_percent", label: "Platform commission", unit: "%" },
      { key: "delivery_fee", label: "Delivery fee", unit: "₹" },
      { key: "cover_page_fee", label: "Cover page fee (per copy)", unit: "₹" },
      { key: "gateway_fee_percent", label: "Estimated gateway fee", unit: "%" },
    ],
  },
  {
    title: "Rider pay", icon: Truck, tone: "orange",
    fields: [
      { key: "rider_base_fee", label: "Base trip fee", unit: "₹" },
      { key: "rider_extra_shop_fee", label: "Fee per additional shop", unit: "₹" },
      { key: "rider_packet_bonus", label: "Per-packet bonus", unit: "₹" },
      { key: "rider_min_guarantee", label: "Minimum trip guarantee", unit: "₹" },
      { key: "no_wait_minutes", label: "No-wait rule", unit: "min" },
    ],
  },
  {
    title: "Operations", icon: Upload, tone: "mint",
    fields: [
      { key: "late_refund_percent", label: "Suggested late-delivery refund", unit: "%" },
      { key: "max_upload_mb", label: "Max upload size", unit: "MB" },
      { key: "slot_hold_minutes", label: "Unpaid slot hold", unit: "min" },
    ],
  },
];

export function PlatformSettings() {
  const q = useAdminGet<Config>("/config");
  return <QueryBoundary query={q}>{(c) => <ConfigForm key={JSON.stringify(c)} config={c} />}</QueryBoundary>;
}

function ConfigForm({ config }: { config: Config }) {
  const initial = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = useAdminMutation(() => adminSend("PUT", "/config", draft), () => toast.success("Settings saved", { description: "They apply to new orders and trips." }));
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <Panel key={g.title} title={<span className="flex items-center gap-3"><IconTile icon={g.icon} tone={g.tone} size="sm" />{g.title}</span>}>
            <div className="space-y-4">
              {g.fields.map((f) => (
                <FormField key={f.key} label={`${f.label} (${f.unit})`}>
                  {(id) => (
                    <Input id={id} inputMode="decimal" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  )}
                </FormField>
              ))}
            </div>
          </Panel>
        ))}
      </div>
      <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(undefined, { onError: toastError })} onReset={() => setDraft(initial)} label="Save settings" error={save.error?.message} />
    </div>
  );
}

/** Sticky save bar that appears once something changed. */
function SaveBar({ dirty, pending, onSave, onReset, label, error }: { dirty: boolean; pending: boolean; onSave: () => void; onReset: () => void; label: string; error?: string }) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-navy px-5 py-3 text-white shadow-lift">
      <p className="text-sm">{error ? <span className="font-semibold text-sun">{error}</span> : dirty ? "You have unsaved changes." : "All changes saved."}</p>
      <div className="flex gap-2">
        {dirty && <Button variant="glass" size="sm" onClick={onReset}>Discard</Button>}
        <Button variant="white" size="sm" disabled={!dirty || pending} onClick={onSave}>
          {pending ? <Spinner /> : <><Save className="size-4" /> {label}</>}
        </Button>
      </div>
    </div>
  );
}

interface Pricing { rates: Rate[]; binding: BindingPrice[] }

export function PricingSettings() {
  const q = useAdminGet<Pricing>("/config/rates");
  return <QueryBoundary query={q}>{(p) => <PricingForm key={JSON.stringify(p)} pricing={p} />}</QueryBoundary>;
}

const rateKey = (r: Rate) => `${r.paper_size}|${r.gsm}|${r.color}|${r.sided}`;

function PricingForm({ pricing }: { pricing: Pricing }) {
  const initRates = Object.fromEntries(pricing.rates.map((r) => [rateKey(r), r.price_per_page]));
  const initBinding = Object.fromEntries(pricing.binding.map((b) => [b.binding, b.price]));
  const [rates, setRates] = useState<Record<string, string>>(initRates);
  const [binding, setBinding] = useState<Record<string, string>>(initBinding);
  const dirty = JSON.stringify(rates) !== JSON.stringify(initRates) || JSON.stringify(binding) !== JSON.stringify(initBinding);
  const save = useAdminMutation(
    async () => {
      const changedRates = pricing.rates.filter((r) => rates[rateKey(r)] !== r.price_per_page).map((r) => ({ ...r, price_per_page: rates[rateKey(r)] }));
      const changedBinding = pricing.binding.filter((b) => binding[b.binding] !== b.price).map((b) => ({ binding: b.binding, price: binding[b.binding] }));
      if (changedRates.length) await adminSend("PUT", "/config/rates", changedRates);
      if (changedBinding.length) await adminSend("PUT", "/config/binding", changedBinding);
      return changedRates.length + changedBinding.length;
    },
    (n) => toast.success(n ? `Updated ${n} price${n === 1 ? "" : "s"}` : "No changes to save", { description: n ? "Existing quotations are not affected." : undefined }),
  );
  const papers = [...new Set(pricing.rates.map((r) => r.paper_size))];

  return (
    <div className="space-y-5">
      <Panel title={<span className="flex items-center gap-3"><IconTile icon={Settings2} size="sm" />Standard printing prices (per page)</span>} subtitle="Shops start from these; students see them when they take the standard price.">
        <div className="grid gap-4 lg:grid-cols-2">
          {papers.map((paper) => (
            <div key={paper} className="overflow-hidden rounded-2xl ring-1 ring-border">
              <p className="bg-surface px-4 py-2 font-display text-sm font-bold text-navy">{paper}</p>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-4 py-2 text-left font-semibold">Colour</th><th className="px-4 py-2 text-left font-semibold">Sides</th><th className="px-4 py-2 text-left font-semibold">GSM</th><th className="px-4 py-2 text-right font-semibold">₹ / page</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pricing.rates.filter((r) => r.paper_size === paper).map((r) => (
                    <tr key={rateKey(r)}>
                      <td className="px-4 py-2">{r.color === "color" ? "Colour" : "B&W"}</td>
                      <td className="px-4 py-2">{humanize(r.sided)}</td>
                      <td className="px-4 py-2 tabular">{r.gsm}</td>
                      <td className="px-4 py-1.5 text-right">
                        <Input
                          aria-label={`Price for ${r.paper_size} ${r.gsm} GSM ${r.color} ${r.sided}`}
                          className="ml-auto h-10 w-24 text-right"
                          inputMode="decimal"
                          value={rates[rateKey(r)]}
                          onChange={(e) => setRates({ ...rates, [rateKey(r)]: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={<span className="flex items-center gap-3"><IconTile icon={BookOpen} tone="orange" size="sm" />Binding (per bound copy)</span>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pricing.binding.map((b) => (
            <FormField key={b.binding} label={`${humanize(b.binding)} (₹)`}>
              {(id) => <Input id={id} inputMode="decimal" value={binding[b.binding]} onChange={(e) => setBinding({ ...binding, [b.binding]: e.target.value })} />}
            </FormField>
          ))}
        </div>
      </Panel>
      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        onSave={() => save.mutate(undefined, { onError: toastError })}
        onReset={() => { setRates(initRates); setBinding(initBinding); }}
        label="Save prices"
        error={save.error?.message}
      />
    </div>
  );
}
