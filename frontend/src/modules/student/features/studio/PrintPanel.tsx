import { Copy, Layers, Minus, Plus, RectangleHorizontal, RectangleVertical, ScanLine, Trash2, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import type { ColorMode, Gsm, OrderDocument, Orientation, PaperSize, PrintRule, Sided } from "@/modules/student/api/types";
import {
  DEFAULT_RULE, GSM_LOOK, normaliseRules, PAPER_MM, uniform, type DocDraft,
} from "@/modules/student/features/studio/config";
import { Button } from "@/shared/components/ui/button";
import { Select } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/utils/cn";

/** Print settings for one document. Every change updates the live preview and price immediately (unsaved). */
export function PrintPanel({
  doc, draft, onChange, onApplyToAll, error,
}: {
  doc: OrderDocument;
  draft: DocDraft;
  onChange: (p: Partial<DocDraft>) => void;
  onApplyToAll?: () => void;
  error?: string;
}) {
  const pages = draft.pageCount;
  const setRules = (rules: PrintRule[]) => onChange({ rules: pages ? normaliseRules(rules, pages) : rules });
  const setAll = (p: Partial<PrintRule>) => setRules(draft.rules.map((r) => ({ ...r, ...p })));
  const first = draft.rules[0];
  const simple = draft.rules.length <= 1 || uniform(draft.rules);
  const advanced = draft.rules.length > 1;

  return (
    <div className="space-y-5">
      {!doc.page_count_auto && (
        <div>
          <label htmlFor={`pages-${doc.id}`} className="mb-1.5 block text-sm font-semibold text-ink-2">Number of pages</label>
          <Input id={`pages-${doc.id}`} type="number" min={1} max={5000} inputMode="numeric" value={pages ?? ""}
            onChange={(e) => {
              const n = e.target.value ? Math.min(5000, Math.max(1, Number(e.target.value))) : null;
              onChange({ pageCount: n, rules: n ? normaliseRules(draft.rules.length ? draft.rules : [{ page_from: 1, page_to: n, ...DEFAULT_RULE }], n) : [] });
            }} />
          <p className="mt-1 text-xs text-muted">We couldn't count pages for this file, so the price uses the number you enter.</p>
        </div>
      )}

      <Group label="Copies">
        <div className="flex items-center justify-between rounded-2xl bg-surface p-2">
          <Button variant="white" size="icon" aria-label="Fewer copies" disabled={draft.copies <= 1} onClick={() => onChange({ copies: draft.copies - 1 })}><Minus className="size-4" /></Button>
          <span className="font-display text-2xl font-bold text-navy tabular" aria-live="polite" aria-label={`${draft.copies} copies`}>{draft.copies}</span>
          <Button variant="white" size="icon" aria-label="More copies" disabled={draft.copies >= 100} onClick={() => onChange({ copies: draft.copies + 1 })}><Plus className="size-4" /></Button>
        </div>
      </Group>

      <Group label="Paper size">
        <Choice<PaperSize> label="Paper size" value={draft.paperSize} onChange={(v) => onChange({ paperSize: v })}
          options={(["A4", "A3"] as const).map((p) => ({
            value: p, title: p, hint: `${PAPER_MM[p].w} × ${PAPER_MM[p].h} mm`,
            art: <span className="block rounded-[2px] border-2 border-current bg-white" style={{ width: p === "A4" ? 18 : 25, height: p === "A4" ? 25 : 35 }} />,
          }))} />
      </Group>

      <Group label="Orientation">
        <Choice<Orientation> label="Orientation" value={draft.orientation} onChange={(v) => onChange({ orientation: v })} cols={3}
          options={[
            { value: "auto", title: "Auto", hint: "Follows each page", art: <Wand2 className="size-5" /> },
            { value: "portrait", title: "Portrait", hint: "Tall", art: <RectangleVertical className="size-5" /> },
            { value: "landscape", title: "Landscape", hint: "Wide", art: <RectangleHorizontal className="size-5" /> },
          ]} />
      </Group>

      {first && simple && !advanced && (
        <>
          <Group label="Colour">
            <Choice<ColorMode> label="Colour" value={first.color} onChange={(v) => setAll({ color: v })}
              options={[
                { value: "bw", title: "Black & white", hint: "Greyscale toner", art: <span className="block size-6 rounded-full bg-[conic-gradient(#111_0_50%,#bbb_50%_100%)]" /> },
                { value: "color", title: "Colour", hint: "Full colour", art: <span className="block size-6 rounded-full bg-[conic-gradient(#f2690d,#ffc83d,#14b86e,#2563eb,#6d28d9,#f2690d)]" /> },
              ]} />
          </Group>
          <Group label="Sides">
            <Choice<Sided> label="Sides" value={first.sided} onChange={(v) => setAll({ sided: v })}
              options={[
                { value: "single", title: "Single-sided", hint: "Back left blank", art: <ScanLine className="size-5" /> },
                { value: "double", title: "Double-sided", hint: "Fewer sheets", art: <Copy className="size-5" /> },
              ]} />
          </Group>
          <Group label="Paper weight" note="Illustrative">
            <Choice<Gsm> label="Paper weight" value={first.gsm} onChange={(v) => setAll({ gsm: v })} cols={3}
              options={([70, 80, 100] as const).map((g) => ({
                value: g, title: `${g} GSM`, hint: g === 70 ? "Light" : g === 80 ? "Standard" : "Premium",
                art: <span className="block w-7 rounded-[1px] bg-current" style={{ height: GSM_LOOK[g].edge + 1 }} />,
              }))} />
            <p className="mt-2 text-xs text-muted">{GSM_LOOK[first.gsm].feel}</p>
          </Group>
          {pages && pages > 1 && (
            <button type="button" className="flex items-center gap-2 text-sm font-semibold text-primary"
              onClick={() => setRules([{ ...first, page_to: Math.max(1, Math.floor(pages / 2)) }, { ...first, page_from: Math.floor(pages / 2) + 1 }])}>
              <Layers className="size-4" /> Different settings for some pages
            </button>
          )}
        </>
      )}

      {first && advanced && pages && (
        <Group label="Page ranges" note={`${pages} pages`}>
          <div className="space-y-3">
            {draft.rules.map((r, i) => (
              <RuleRow key={i} rule={r} last={i === draft.rules.length - 1}
                removable={draft.rules.length > 1}
                onChange={(p) => setRules(draft.rules.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                onRemove={() => setRules(draft.rules.filter((_, j) => j !== i))} />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="soft" size="sm" disabled={draft.rules[draft.rules.length - 1]!.page_from >= pages}
                onClick={() => {
                  const last = draft.rules[draft.rules.length - 1]!;
                  setRules([...draft.rules.slice(0, -1), { ...last, page_to: last.page_from }, { ...last, page_from: last.page_from + 1 }]);
                }}>
                <Plus className="size-4" /> Add page range
              </Button>
              <button type="button" className="text-sm font-semibold text-muted hover:text-navy"
                onClick={() => setRules([{ ...first, page_from: 1, page_to: pages }])}>
                Use one setting for all pages
              </button>
            </div>
          </div>
        </Group>
      )}

      {onApplyToAll && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onApplyToAll}>
          Apply these settings to all documents
        </Button>
      )}
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

function Group({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-navy">{label}</p>
        {note && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** Card-style single choice with a small illustration (radio semantics). */
export function Choice<T extends string | number>({
  value, onChange, options, label, cols = 2,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; hint?: string; art?: ReactNode }[];
  label: string;
  cols?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-[4.5rem] flex-col items-start gap-1.5 rounded-2xl p-3 text-left ring-1 transition-all",
              on ? "bg-primary-soft text-primary ring-2 ring-primary" : "bg-background text-ink-2 ring-border hover:ring-primary/40",
            )}>
            {o.art && <span className={cn("flex h-7 items-center", on ? "text-primary" : "text-muted")}>{o.art}</span>}
            <span className="text-sm font-bold leading-tight text-navy">{o.title}</span>
            {o.hint && <span className="text-[11px] leading-tight text-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function RuleRow({ rule, last, removable, onChange, onRemove }: {
  rule: PrintRule; last: boolean; removable: boolean; onChange: (p: Partial<PrintRule>) => void; onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-surface p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-ink-2">Pages {rule.page_from} to</span>
        {last ? <b className="text-navy">{rule.page_to}</b> : (
          <Input aria-label={`Last page of range starting at ${rule.page_from}`} type="number" min={rule.page_from}
            className="h-10 w-20 px-3" value={rule.page_to} onChange={(e) => onChange({ page_to: Number(e.target.value) })} />
        )}
        {removable && (
          <button type="button" aria-label="Remove range" onClick={onRemove} className="ml-auto flex size-9 items-center justify-center rounded-xl text-muted hover:bg-background hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select aria-label="Colour" className="h-10 px-3 text-sm" value={rule.color} onChange={(e) => onChange({ color: e.target.value as ColorMode })}>
          <option value="bw">B&W</option><option value="color">Colour</option>
        </Select>
        <Select aria-label="Paper weight" className="h-10 px-3 text-sm" value={rule.gsm} onChange={(e) => onChange({ gsm: Number(e.target.value) as Gsm })}>
          <option value={70}>70 GSM</option><option value={80}>80 GSM</option><option value={100}>100 GSM</option>
        </Select>
        <Select aria-label="Sides" className="h-10 px-3 text-sm" value={rule.sided} onChange={(e) => onChange({ sided: e.target.value as Sided })}>
          <option value="single">Single</option><option value="double">Double</option>
        </Select>
      </div>
    </div>
  );
}
