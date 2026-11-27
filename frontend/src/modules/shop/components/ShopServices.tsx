import { useState, type ComponentType, type SVGProps } from "react";
import { Check, Pencil, Route } from "lucide-react";
import { useServiceCatalogue, useSetServices, useShop } from "@/modules/shop/api";
import type { ShopService } from "@/modules/shop/api/types";
import { A3Art, BoundBookArt, BwPrintArt, ColorPrintArt, SpiralArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Skeleton, Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";

const GROUPS = [
  { category: "print", title: "Printing" },
  { category: "binding", title: "Binding" },
] as const;

export const ROUTING_NOTE = "Orders are only sent to shops that offer everything the order needs.";
export const NEEDS_PRINT = "Keep at least one printing service selected.";

/** The API requires at least one print_* service. */
export const hasPrint = (codes: string[]) => codes.some((c) => c.startsWith("print_"));

/** Illustration for a service code (purely decorative). */
function artFor(code: string): ComponentType<SVGProps<SVGSVGElement>> {
  if (code.startsWith("print_a3")) return A3Art;
  if (code.includes("color")) return ColorPrintArt;
  if (code.startsWith("print_")) return BwPrintArt;
  if (code === "binding_spiral") return SpiralArt;
  return BoundBookArt;
}

/** Service toggle tiles grouped Printing / Binding (real checkboxes underneath). */
export function ServicePicker({ catalogue, value, onChange }: {
  catalogue: ShopService[]; value: string[]; onChange: (codes: string[]) => void;
}) {
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {GROUPS.map((g) => (
        <fieldset key={g.category} className="space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">{g.title}</legend>
          {catalogue.filter((s) => s.category === g.category).map((s) => {
            const Art = artFor(s.code);
            const on = value.includes(s.code);
            return (
              <label
                key={s.code}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl p-2.5 pr-3.5 ring-1 transition-colors",
                  on ? "bg-primary-soft ring-primary/40" : "bg-background ring-border hover:ring-primary/30",
                )}
              >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", on ? "bg-primary/15" : "bg-surface")}>
                  <Art className="size-9" />
                </span>
                <span className="flex-1 text-sm font-semibold text-navy">{s.label}</span>
                <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={on} onChange={() => toggle(s.code)} />
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/** Registered shop's services: chips first, toggle tiles on demand. */
export function ServicesCard() {
  const shop = useShop().data;
  const catalogue = useServiceCatalogue();
  const save = useSetServices();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  if (!shop) return null;

  const offered = catalogue.data?.filter((s) => shop.services.includes(s.code)) ?? [];
  return (
    <Card pad="lg" aria-label="Services" role="region">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-navy">Services</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Route className="size-3.5" aria-hidden /> {ROUTING_NOTE}</p>
        </div>
        {!draft && catalogue.data && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(shop.services); setSaved(false); }}>
            <Pencil className="size-4" /> Edit services
          </Button>
        )}
      </div>

      {catalogue.isLoading ? <Skeleton className="h-10" /> : catalogue.isError ? (
        <p role="alert" className="text-sm text-danger">{catalogue.error.message}</p>
      ) : draft ? (
        <div className="space-y-4">
          <ServicePicker catalogue={catalogue.data!} value={draft} onChange={setDraft} />
          {!hasPrint(draft) && <p role="alert" className="text-sm font-medium text-danger">{NEEDS_PRINT}</p>}
          {save.error && <p role="alert" className="text-sm font-medium text-danger">{save.error.message}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setDraft(null); save.reset(); }}>Cancel</Button>
            <Button disabled={!hasPrint(draft) || save.isPending}
              onClick={() => save.mutate(draft, {
                onSuccess: () => { setDraft(null); setSaved(true); toast.success("Services saved"); },
                onError: toastError,
              })}>
              {save.isPending ? <Spinner className="text-white" /> : "Save services"}
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Services offered">
          {offered.map((s) => {
            const Art = artFor(s.code);
            return (
              <li key={s.code} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3.5 text-sm font-semibold text-navy">
                <span className="flex size-7 items-center justify-center rounded-full bg-background"><Art className="size-6" /></span>
                {s.label}
              </li>
            );
          })}
          {offered.length === 0 && <li className="text-sm text-muted">No services selected.</li>}
        </ul>
      )}
      {saved && !draft && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check className="size-4" aria-hidden />Services saved
        </p>
      )}
    </Card>
  );
}
