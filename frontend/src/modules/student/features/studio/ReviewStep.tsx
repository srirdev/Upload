import { ArrowRight, BookMarked, CheckCircle2, FileText, Palette, Pencil } from "lucide-react";
import { useProfile, useQuotation } from "@/modules/student/api";
import type { OrderDetail } from "@/modules/student/api/types";
import { BindingArt } from "@/modules/student/features/studio/BindingPanel";
import {
  BINDINGS, COVER_COLORS, COVER_TEMPLATES, coverHex, docDraft, GSM_LOOK, sheetsPerCopy, stackMm,
} from "@/modules/student/features/studio/config";
import { CoverArt, coverText } from "@/modules/student/features/studio/CoverArt";
import type { StudioTab } from "@/modules/student/features/studio/StudioStep";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { PageLoader, Skeleton } from "@/shared/components/ui/states";
import { rupees } from "@/shared/utils/format";

/**
 * Order summary before payment. Built only from what is SAVED on the order (never from an unsaved draft),
 * so what the student confirms here is exactly what the shop receives.
 */
export function ReviewStep({ order, onEdit, onNext }: { order: OrderDetail; onEdit: (tab: StudioTab) => void; onNext: () => void }) {
  const profile = useProfile().data;
  const quote = useQuotation(order.id, true, [order.binding, order.cover_page, ...order.documents.map((d) => JSON.stringify(d))].join("|"));
  if (!profile) return <PageLoader />;

  const binding = BINDINGS.find((b) => b.value === order.binding)!;
  const tmpl = COVER_TEMPLATES.find((t) => t.value === (order.cover_template ?? "classic"))!;
  const color = order.cover_color ?? "navy";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 text-success" aria-hidden />
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy md:text-2xl">Review your print</h2>
            <p className="text-sm text-muted">Saved settings. The shop prints exactly this.</p>
          </div>
        </div>

        {order.documents.map((d) => {
          const dd = docDraft(d);
          return (
            <Card key={d.id} pad="default">
              <div className="flex items-start justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 font-semibold text-navy">
                  <FileText className="size-5 shrink-0 text-primary" aria-hidden /> <span className="truncate">{d.filename}</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => onEdit("print")}><Pencil className="size-4" /> Edit</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{d.page_count} pages</Badge>
                <Badge>{d.copies} cop{d.copies === 1 ? "y" : "ies"}</Badge>
                <Badge>{d.paper_size}</Badge>
                <Badge>{(d.orientation ?? "auto") === "auto" ? "Orientation: auto" : d.orientation === "portrait" ? "Portrait" : "Landscape"}</Badge>
                <Badge tone="neutral">{sheetsPerCopy(dd)} sheets per copy · ≈ {stackMm(dd).toFixed(1)} mm</Badge>
              </div>
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr><th className="py-1 font-semibold">Pages</th><th className="py-1 font-semibold">Colour</th><th className="py-1 font-semibold">Sides</th><th className="py-1 font-semibold">Paper</th></tr>
                </thead>
                <tbody>
                  {d.rules.map((r) => (
                    <tr key={r.page_from} className="border-t border-border">
                      <td className="py-1.5 tabular text-navy">{r.page_from === r.page_to ? r.page_from : `${r.page_from}–${r.page_to}`}</td>
                      <td className="py-1.5">{r.color === "color" ? "Colour" : "B&W"}</td>
                      <td className="py-1.5">{r.sided === "double" ? "Double" : "Single"}</td>
                      <td className="py-1.5">{GSM_LOOK[r.gsm].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card pad="default">
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-2 font-semibold text-navy"><BookMarked className="size-5 text-primary" aria-hidden /> Binding</p>
              <Button variant="ghost" size="sm" onClick={() => onEdit("binding")}><Pencil className="size-4" /> Edit</Button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-16 w-20 items-center justify-center rounded-2xl bg-surface"><BindingArt kind={order.binding} color={coverHex(color)} /></span>
              <div><p className="font-bold text-navy">{binding.label}</p><p className="text-xs text-muted">{binding.hint}</p></div>
            </div>
          </Card>
          <Card pad="default">
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-2 font-semibold text-navy"><Palette className="size-5 text-primary" aria-hidden /> Cover page</p>
              <Button variant="ghost" size="sm" onClick={() => onEdit("cover")}><Pencil className="size-4" /> Edit</Button>
            </div>
            {order.cover_page ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="w-20 shrink-0 overflow-hidden rounded-lg shadow-soft ring-1 ring-black/5">
                  <CoverArt footer={false} template={order.cover_template ?? "classic"} color={color}
                    text={coverText({
                      title: order.cover_title ?? "", subjectName: order.subject_name ?? "", subjectCode: order.subject_code ?? "",
                      fullName: profile.full_name, registerNumber: profile.register_number, department: profile.department,
                      year: profile.year, college: profile.college_name, filename: "", orderCode: order.code,
                    })} />
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-bold text-navy">{tmpl.label} · {COVER_COLORS[color].label}</p>
                  {order.cover_title && <p className="truncate text-ink-2">{order.cover_title}</p>}
                  <p className="truncate text-muted">{order.subject_name} ({order.subject_code})</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No cover page.</p>
            )}
          </Card>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card tone="midnight" pad="lg" aria-live="polite">
          <h3 className="mb-3 font-display text-lg font-bold">Price</h3>
          {quote.isLoading && <Skeleton className="h-28 bg-white/10" />}
          {quote.isError && <p role="alert" className="text-sm">{quote.error.message}</p>}
          {quote.data && (
            <div className="space-y-1.5 text-sm">
              {quote.data.lines.map((l) => (
                <div key={l.label} className="flex justify-between gap-3"><span className="text-white/75">{l.label}</span><span className="tabular">{rupees(l.amount)}</span></div>
              ))}
              <div className="flex justify-between gap-3"><span className="text-white/75">Delivery</span><span className="tabular">{rupees(quote.data.delivery_fee)}</span></div>
              <div className="flex items-end justify-between border-t border-white/15 pt-3">
                <span className="text-white/80">Total</span>
                <span className="font-display text-3xl font-extrabold tabular">{rupees(quote.data.total)}</span>
              </div>
              <p className="pt-1 text-[11px] text-white/60">Pick a delivery slot and compare shops on the next step.</p>
            </div>
          )}
        </Card>
        <Button size="lg" className="w-full" onClick={onNext}>
          Choose slot and pay <ArrowRight className="size-5" aria-hidden />
        </Button>
      </aside>
    </div>
  );
}
