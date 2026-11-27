import { AlertTriangle, BookMarked, FileText, Loader2, Palette, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { OrderDetail, Quotation } from "@/modules/student/api/types";
import {
  BINDINGS, COVER_COLORS, COVER_TEMPLATES, GSM_LOOK, sheetsPerCopy, uniform, type StudioDraft,
} from "@/modules/student/features/studio/config";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import { rupees } from "@/shared/utils/format";

/** Everything selected, and the live price (server-priced, unsaved settings included). */
export function SummaryPanel({
  order, draft, quote, quoteLoading, quoteError, dirty, onReset, className,
}: {
  order: OrderDetail;
  draft: StudioDraft;
  quote?: Quotation;
  quoteLoading: boolean;
  quoteError?: string | null;
  dirty: boolean;
  onReset: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("space-y-4", className)} aria-label="Selected options and price">
      <div className="rounded-4xl bg-background p-5 shadow-soft ring-1 ring-border/60">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-navy">Your print</h3>
          {dirty ? (
            <Badge tone="sun" icon={AlertTriangle}>Unsaved</Badge>
          ) : (
            <Badge tone="mint">Saved</Badge>
          )}
        </div>
        <ul className="space-y-3">
          {order.documents.map((d) => {
            const dd = draft.docs[d.id];
            if (!dd) return null;
            const r = dd.rules[0];
            const mixed = dd.rules.length > 1 && !uniform(dd.rules);
            return (
              <li key={d.id} className="rounded-2xl bg-surface p-3">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-navy">
                  <FileText className="size-4 shrink-0 text-primary" aria-hidden /> <span className="truncate">{d.filename}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{dd.pageCount ?? "?"} pages</Badge>
                  <Badge>{dd.copies} cop{dd.copies === 1 ? "y" : "ies"}</Badge>
                  <Badge>{dd.paperSize}</Badge>
                  {dd.orientation !== "auto" && <Badge>{dd.orientation === "portrait" ? "Portrait" : "Landscape"}</Badge>}
                  {mixed ? <Badge tone="violet">{dd.rules.length} page ranges</Badge> : r && (
                    <>
                      <Badge tone={r.color === "color" ? "orange" : "neutral"}>{r.color === "color" ? "Colour" : "B&W"}</Badge>
                      <Badge>{r.sided === "double" ? "Double-sided" : "Single-sided"}</Badge>
                      <Badge>{GSM_LOOK[r.gsm].label}</Badge>
                    </>
                  )}
                  <Badge tone="neutral">{sheetsPerCopy(dd)} sheets</Badge>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 space-y-2 text-sm">
          <Line icon={BookMarked} label="Binding" value={BINDINGS.find((b) => b.value === draft.binding)?.label ?? draft.binding} />
          <Line icon={Palette} label="Cover page"
            value={draft.cover.enabled
              ? `${COVER_TEMPLATES.find((t) => t.value === draft.cover.template)?.label} · ${COVER_COLORS[draft.cover.color].label}`
              : "None"} />
        </div>
      </div>

      <div className="rounded-4xl bg-midnight p-5 text-white shadow-lift" aria-live="polite">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Price</h3>
          {quoteLoading && <Loader2 className="size-4 animate-spin text-white/70" aria-label="Updating price" />}
        </div>
        {quoteError ? (
          <p role="alert" className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">{quoteError}</p>
        ) : quote ? (
          <div className="space-y-1.5 text-sm">
            {quote.lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-3">
                <span className="min-w-0 text-white/75">{l.label}</span>
                <span className="shrink-0 font-medium tabular">{rupees(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <span className="text-white/75">Delivery</span>
              <span className="font-medium tabular">{rupees(quote.delivery_fee)}</span>
            </div>
            {quote.discount !== "0.00" && (
              <div className="flex justify-between gap-3 text-sun">
                <span>Discount</span><span className="font-medium tabular">−{rupees(quote.discount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-end justify-between border-t border-white/15 pt-3">
              <span className="text-white/80">Total</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={quote.total} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}
                  className="font-display text-3xl font-extrabold tabular">
                  {rupees(quote.total)}
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="pt-1 text-[11px] text-white/60">
              {order.chosen_shop ? `Priced at ${order.chosen_shop.shop_name}'s rates.` : "Standard price. You can compare shops before paying."}
            </p>
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-2xl bg-white/10" />
        )}
      </div>

      {dirty && (
        <Button variant="ghost" className="w-full" onClick={onReset}>
          <RotateCcw className="size-4" /> Discard changes
        </Button>
      )}
    </aside>
  );
}

function Line({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted"><Icon className="size-4 text-primary" aria-hidden /> {label}</span>
      <span className="truncate font-semibold text-navy">{value}</span>
    </div>
  );
}
