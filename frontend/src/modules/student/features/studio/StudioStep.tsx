import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookMarked, Expand, Palette, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { queryKeys, useProfile } from "@/modules/student/api";
import type { OrderDetail } from "@/modules/student/api/types";
import { saveDraft, useLiveQuote, validateDraft } from "@/modules/student/features/studio/api";
import { BindingPanel } from "@/modules/student/features/studio/BindingPanel";
import { draftFromOrder, sameDraft, type DocDraft, type StudioDraft } from "@/modules/student/features/studio/config";
import { coverText } from "@/modules/student/features/studio/CoverArt";
import { CoverPanel } from "@/modules/student/features/studio/CoverPanel";
import { PreviewStage } from "@/modules/student/features/studio/PreviewStage";
import { PrintPanel } from "@/modules/student/features/studio/PrintPanel";
import { SummaryPanel } from "@/modules/student/features/studio/SummaryPanel";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { PageLoader, Spinner } from "@/shared/components/ui/states";
import { Tabs } from "@/shared/components/ui/tabs";
import { toast } from "@/shared/components/ui/toast";
import { rupees } from "@/shared/utils/format";

export type StudioTab = "print" | "binding" | "cover";

/** True on large screens. Only one preview stage is ever mounted (each stage renders real pages). */
function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setDesktop(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

/**
 * Print Preview Studio: print, binding and cover settings around a large live preview of the real document.
 * Edits stay in a local draft (live preview + live server price); nothing is written to the order until
 * "Save and continue". "Discard changes" returns to what is saved.
 */
export function StudioStep({
  order, onNext, onDirtyChange, initialTab = "print",
}: { order: OrderDetail; onNext: () => void; onDirtyChange?: (dirty: boolean) => void; initialTab?: StudioTab }) {
  const qc = useQueryClient();
  const profile = useProfile();
  const saved = useMemo(() => draftFromOrder(order), [order]);
  const [draft, setDraft] = useState<StudioDraft>(saved);
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [docId, setDocId] = useState(order.documents[0]?.id ?? "");
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const desktop = useIsDesktop();

  const dirty = !sameDraft(draft, saved);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // A DOCX/PPTX finishing conversion in the background reveals its real page count: adopt it if the student
  // hasn't typed one, so the preview and price use the true count.
  useEffect(() => {
    setDraft((s) => {
      let changed = false;
      const docs = { ...s.docs };
      for (const [id, d] of Object.entries(saved.docs)) {
        if (d.pageCount && !docs[id]?.pageCount) {
          docs[id] = { ...(docs[id] ?? d), pageCount: d.pageCount, rules: d.rules };
          changed = true;
        }
      }
      return changed ? { ...s, docs } : s;
    });
  }, [saved]);
  // Warn before closing the tab with unsaved studio changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const quote = useLiveQuote(order, draft);

  if (profile.isLoading || !profile.data) return <PageLoader />;
  const p = profile.data;
  const doc = order.documents.find((d) => d.id === docId) ?? order.documents[0];
  const dd = doc ? draft.docs[doc.id] : undefined;

  const patchDoc = (id: string, patch: Partial<DocDraft>) =>
    setDraft((s) => ({ ...s, docs: { ...s.docs, [id]: { ...s.docs[id]!, ...patch } } }));
  const applyToAll = () => {
    if (!dd) return;
    setDraft((s) => ({
      ...s,
      docs: Object.fromEntries(
        Object.entries(s.docs).map(([id, x]) => [
          id,
          id === doc!.id || !x.pageCount
            ? x
            : { ...x, copies: dd.copies, paperSize: dd.paperSize, orientation: dd.orientation, rules: [{ ...dd.rules[0]!, page_from: 1, page_to: x.pageCount }] },
        ]),
      ),
    }));
    toast.success("Applied to all documents");
  };

  const text = coverText({
    title: draft.cover.title, subjectName: draft.cover.subjectName || "Subject name", subjectCode: draft.cover.subjectCode || "CODE",
    fullName: p.full_name, registerNumber: p.register_number, department: p.department, year: p.year, college: p.college_name,
    filename: doc?.filename ?? "", orderCode: order.code,
  });

  async function save() {
    const problems = validateDraft(order, draft);
    if (problems.length) {
      setShowErrors(true);
      if (problems.some((x) => x.includes("cover"))) setTab("cover");
      toast.error(problems[0]!);
      return;
    }
    setSaving(true);
    setDocErrors({});
    try {
      const { errors } = await saveDraft(order, draft);
      setDocErrors(errors);
      await qc.invalidateQueries({ queryKey: queryKeys.order(order.id) });
      if (Object.keys(errors).length) {
        setTab("print");
        setDocId(Object.keys(errors)[0]!);
        toast.error("Some print settings need fixing");
        return;
      }
      toast.success("Print settings saved");
      onNext();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const settings = (
    <div className="space-y-5">
      <Tabs<StudioTab>
        label="Studio settings"
        value={tab}
        onChange={setTab}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        items={[
          { value: "print", label: "Print" },
          { value: "binding", label: "Binding" },
          { value: "cover", label: "Cover" },
        ]}
      />
      {tab === "print" && doc && dd && (
        <>
          {order.documents.length > 1 && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Documents">
              {order.documents.map((d) => (
                <button key={d.id} type="button" role="tab" aria-selected={d.id === doc.id} onClick={() => setDocId(d.id)}
                  className={`max-w-[11rem] shrink-0 truncate rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition-colors ${d.id === doc.id ? "bg-navy text-white ring-navy" : "bg-background text-ink-2 ring-border"} ${docErrors[d.id] ? "ring-2 ring-danger" : ""}`}>
                  {d.filename}
                </button>
              ))}
            </div>
          )}
          <PrintPanel doc={doc} draft={dd} onChange={(x) => patchDoc(doc.id, x)} error={docErrors[doc.id]}
            onApplyToAll={order.documents.length > 1 ? applyToAll : undefined} />
        </>
      )}
      {tab === "binding" && (
        <BindingPanel value={draft.binding} color={draft.cover.color} onChange={(b) => setDraft((s) => ({ ...s, binding: b }))} />
      )}
      {tab === "cover" && (
        <CoverPanel cover={draft.cover} profile={p} text={text} showErrors={showErrors}
          onChange={(c) => setDraft((s) => ({ ...s, cover: { ...s.cover, ...c } }))} />
      )}
    </div>
  );

  const stage = (compact?: boolean) => (
    <PreviewStage order={order} profile={p} draft={draft} docId={doc?.id ?? ""} onDocChange={setDocId} compact={compact} focus={tab} />
  );

  const total = quote.data?.total;
  const quoteError = quote.isError ? quote.error.message : null;
  const saveButton = (
    <Button size="lg" className="w-full" disabled={saving} onClick={save}>
      {saving ? <Spinner className="text-white" /> : <>{dirty ? "Save and continue" : "Continue"} <ArrowRight className="size-5" aria-hidden /></>}
    </Button>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-brand text-white shadow-glow"><Printer className="size-5" aria-hidden /></span>
        <div>
          <h2 className="font-display text-xl font-extrabold text-navy md:text-2xl">Print Preview Studio</h2>
          <p className="text-sm text-muted">See exactly how your document will be printed, bound and covered.</p>
        </div>
      </div>

      {/* Desktop: settings | preview | summary. Smaller screens: preview, then settings, then summary. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(320px,370px)_minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <div className="rounded-4xl bg-background p-4 shadow-soft ring-1 ring-border/60 sm:p-5 lg:sticky lg:top-20">{settings}</div>
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          {desktop ? (
            stage()
          ) : (
            <>
              {!previewOpen && stage(true)}
              <Button variant="soft" className="mt-3 w-full" onClick={() => setPreviewOpen(true)}>
                <Expand className="size-4" /> Open full-screen preview
              </Button>
            </>
          )}
        </div>

        <div className="order-3 lg:col-span-2 xl:col-span-1">
          <div className="space-y-4 xl:sticky xl:top-20">
            <SummaryPanel order={order} draft={draft} quote={quote.data} quoteLoading={quote.isFetching} quoteError={quoteError}
              dirty={dirty} onReset={() => { setDraft(saved); setShowErrors(false); setDocErrors({}); toast("Changes discarded"); }} />
            <div className="hidden lg:block">{saveButton}</div>
            <p className="hidden text-center text-xs text-muted lg:block">
              <BookMarked className="mr-1 inline size-3.5" aria-hidden />Saving updates your order. The shop prints exactly these settings.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile action bar: live total + save */}
      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-white/60 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-nav lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{dirty ? "Unsaved · total" : "Total"}</p>
            <p className="font-display text-xl font-extrabold text-navy tabular">{total ? rupees(total) : "—"}</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Full-screen preview" onClick={() => setPreviewOpen(true)}><Palette className="size-5" /></Button>
          <div className="flex-1">{saveButton}</div>
        </div>
      </div>

      <Modal open={previewOpen} onOpenChange={setPreviewOpen} title="Live preview" description={doc?.filename} className="sm:w-[min(64rem,calc(100vw-2rem))]">
        {stage(false)}
      </Modal>
    </div>
  );
}
