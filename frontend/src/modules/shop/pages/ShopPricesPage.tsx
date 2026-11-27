import { useState } from "react";
import { BookOpen, Info, Palette, RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRateCard, useSaveRateCard } from "@/modules/shop/api";
import type { RateCard } from "@/modules/shop/api/types";
import { ServicesCard } from "@/modules/shop/components/ShopServices";
import type { ColorMode, Gsm, PaperSize, Sided } from "@/modules/student/api/types";
import { BoundBookArt, BwPrintArt, ColorPrintArt, SpiralArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { FadeIn } from "@/shared/components/ui/motion";
import { DashboardSkeleton, ErrorState, Spinner } from "@/shared/components/ui/states";
import { Tabs } from "@/shared/components/ui/tabs";
import { toast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";

type Rate = RateCard["rates"][number];

const SIZES: PaperSize[] = ["A4", "A3"];
const COLORS: { value: ColorMode; label: string }[] = [
  { value: "bw", label: "Black & white" },
  { value: "color", label: "Colour" },
];
const GSMS: Gsm[] = [70, 80, 100];
const SIDES: { value: Sided; label: string }[] = [
  { value: "single", label: "Single-sided" },
  { value: "double", label: "Double-sided" },
];
const BINDING_LABEL = { spiral: "Spiral", calico: "Calico", soft: "Soft", hard: "Hard" } as const;

const rateKey = (r: Pick<Rate, "paper_size" | "gsm" | "color" | "sided">) => `${r.paper_size}|${r.gsm}|${r.color}|${r.sided}`;
/** UX check only (non-negative, up to 2 decimals); the server enforces the real limits. */
const isPrice = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

interface Draft {
  rates: Record<string, string>;
  bindings: Record<string, string>;
}

const toDraft = (c: RateCard): Draft => ({
  rates: Object.fromEntries(c.rates.map((r) => [rateKey(r), r.price_per_page])),
  bindings: Object.fromEntries(c.bindings.map((b) => [b.binding, b.price])),
});

export function ShopPricesPage() {
  const card = useRateCard();
  const save = useSaveRateCard();
  const [draft, setDraft] = useState<Draft | null>(null); // null = unchanged
  const [saved, setSaved] = useState(false);
  const [picked, setSize] = useState<PaperSize>("A4");

  if (card.isLoading) return <DashboardSkeleton />;
  if (card.isError) return <ErrorState message={card.error.message} onRetry={() => card.refetch()} />;
  const c = card.data!;
  const d = draft ?? toDraft(c);
  const original = toDraft(c);
  const invalid = [...Object.values(d.rates), ...Object.values(d.bindings)].some((v) => !isPrice(v));
  const changed = draft
    ? Object.keys(d.rates).filter((k) => d.rates[k] !== original.rates[k]).length +
      Object.keys(d.bindings).filter((k) => d.bindings[k] !== original.bindings[k]).length
    : 0;
  const sizesPresent = SIZES.filter((s) => c.rates.some((r) => r.paper_size === s));
  const size = sizesPresent.includes(picked) ? picked : (sizesPresent[0] ?? "A4");

  const edit = (part: keyof Draft, k: string, v: string) => {
    setSaved(false);
    setDraft({ ...d, [part]: { ...d[part], [k]: v } });
  };

  function submit() {
    save.mutate(
      {
        rates: c.rates.map((r) => ({ ...r, price_per_page: d.rates[rateKey(r)].trim() })),
        bindings: c.bindings.map((b) => ({ ...b, price: d.bindings[b.binding].trim() })),
      },
      { onSuccess: () => { setDraft(null); setSaved(true); toast.success("Prices saved", { description: "Students now see your new prices." }); } },
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Prices & services"
        title="Your rate card"
        subtitle="Students compare shops on these prices. Printing prices are per page, in rupees; binding is per copy."
      />

      <FadeIn><ServicesCard /></FadeIn>

      <FadeIn delay={0.05} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-navy">Printing</h2>
          {sizesPresent.length > 1 && (
            <Tabs<PaperSize> label="Paper size" value={size} onChange={setSize} items={sizesPresent.map((s) => ({ value: s, label: s }))} />
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {COLORS.map((color) => {
            const Art = color.value === "color" ? ColorPrintArt : BwPrintArt;
            return (
              <Card key={`${size}${color.value}`} pad="lg" role="region" aria-label={`${size} ${color.label}`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className={cn("flex size-12 items-center justify-center rounded-2xl", color.value === "color" ? "bg-orange-soft" : "bg-surface")}>
                    <Art className="size-10" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold text-navy">{size} · {color.label}</h3>
                    <p className="text-xs text-muted">Price per page</p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="pb-2 text-left font-semibold">Paper</th>
                      {SIDES.map((s) => <th key={s.value} className="pb-2 text-left font-semibold">{s.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {GSMS.map((gsm) => (
                      <tr key={gsm}>
                        <td className="py-1.5 pr-3 font-semibold text-ink-2">{gsm} GSM</td>
                        {SIDES.map((s) => {
                          const k = rateKey({ paper_size: size, gsm, color: color.value, sided: s.value });
                          const v = d.rates[k];
                          return (
                            <td key={s.value} className="py-1.5 pr-2">
                              {v === undefined ? <span className="text-muted">—</span> : (
                                <PriceInput value={v} changed={v !== original.rates[k]} onChange={(x) => edit("rates", k, x)}
                                  label={`${size} ${color.label} ${gsm} GSM ${s.label} price per page`} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
        {sizesPresent.length > 1 && (
          <p className="flex items-center gap-1.5 text-xs text-muted"><Info className="size-3.5" aria-hidden /> Switch paper size above to edit {size === "A4" ? "A3" : "A4"} prices. Unsaved edits are kept.</p>
        )}
      </FadeIn>

      {c.bindings.length > 0 && (
        <FadeIn delay={0.1}>
          <Card pad="lg" role="region" aria-label="Binding prices">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft"><BookOpen className="size-6 text-primary" aria-hidden /></span>
              <div>
                <h2 className="font-display text-lg font-bold text-navy">Binding</h2>
                <p className="text-xs text-muted">Price per copy</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {c.bindings.map((b) => {
                const Art = b.binding === "spiral" ? SpiralArt : BoundBookArt;
                return (
                  <div key={b.binding} className="rounded-2xl bg-surface p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Art className="size-8" />
                      <p className="text-sm font-bold text-navy">{BINDING_LABEL[b.binding]}</p>
                    </div>
                    <PriceInput value={d.bindings[b.binding]} changed={d.bindings[b.binding] !== original.bindings[b.binding]}
                      onChange={(x) => edit("bindings", b.binding, x)} label={`${BINDING_LABEL[b.binding]} binding price`} />
                  </div>
                );
              })}
            </div>
          </Card>
        </FadeIn>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-20">
        <div className={cn(
          "flex flex-wrap items-center gap-3 rounded-3xl p-3 pl-5 shadow-lift ring-1 transition-colors",
          draft ? "bg-navy text-white ring-navy" : "bg-background ring-border",
        )}>
          <p className={cn("flex flex-1 items-center gap-2 text-sm font-semibold", draft ? "text-white" : "text-muted")}>
            <Palette className="size-4" aria-hidden />
            {draft ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "All prices saved"}
          </p>
          {invalid && <p role="alert" className="text-sm font-semibold text-sun">Enter every price as 0 or more, with up to 2 decimals.</p>}
          {save.error && <p role="alert" className="text-sm font-semibold text-sun">{save.error.message}</p>}
          <AnimatePresence>
            {saved && !draft && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="text-sm font-semibold text-success">Prices saved</motion.p>
            )}
          </AnimatePresence>
          {draft && (
            <Button variant="glass" onClick={() => { setDraft(null); save.reset(); }}>
              <RotateCcw className="size-4" /> Discard changes
            </Button>
          )}
          <Button variant={draft ? "accent" : "default"} disabled={!draft || invalid || save.isPending} onClick={submit}>
            {save.isPending ? <Spinner /> : <><Save className="size-4" /> Save prices</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PriceInput({ value, onChange, label, changed }: { value: string; onChange: (v: string) => void; label: string; changed?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">₹</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} aria-invalid={!isPrice(value)}
        inputMode="decimal" className={cn("h-11 pl-7 pr-2 text-sm font-semibold tabular", changed && "border-orange bg-orange-soft/40")} />
    </div>
  );
}
