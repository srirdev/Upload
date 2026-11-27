import {
  BookOpen, Box, ChevronLeft, ChevronRight, FileText, Info, Loader2, Minus, Plus, RefreshCw, Rows3, ScanSearch,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { OrderDetail, Profile } from "@/modules/student/api/types";
import { BookModel } from "@/modules/student/features/studio/BookModel";
import {
  buildLeaves, PAPER_MM, sheetMm, sheetsPerCopy, stackMm, type Leaf, type StudioDraft,
} from "@/modules/student/features/studio/config";
import { CoverArt, coverText, type CoverText } from "@/modules/student/features/studio/CoverArt";
import { FlipBook } from "@/modules/student/features/studio/FlipBook";
import type { LoadedDoc } from "@/modules/student/features/studio/pdf";
import { SheetFace } from "@/modules/student/features/studio/Sheet";
import { useDocumentSource, useNearViewport, usePageSize } from "@/modules/student/features/studio/useDocument";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/utils/cn";

export type ViewMode = "flip" | "scroll" | "3d";
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2] as const;

/** The large live preview: real pages, print simulation, page flipping, binding and the assembled 3D object. */
export function PreviewStage({
  order, profile, draft, docId, onDocChange, compact, focus,
}: {
  order: OrderDetail;
  profile: Profile;
  draft: StudioDraft;
  docId: string;
  onDocChange: (id: string) => void;
  compact?: boolean;
  /** The settings tab in use: binding shows the assembled 3D object, cover opens on the cover page. */
  focus?: "print" | "binding" | "cover";
}) {
  const doc = order.documents.find((d) => d.id === docId) ?? order.documents[0];
  const dd = doc ? draft.docs[doc.id] : undefined;
  const source = useDocumentSource(order, doc);
  const loaded = source.status === "ready" ? source.doc : undefined;

  const [mode, setMode] = useState<ViewMode>("flip");
  const [zoomIdx, setZoomIdx] = useState(2);
  const [index, setIndex] = useState(0);
  const zoom = ZOOMS[zoomIdx];

  const cover = draft.cover.enabled;
  const leaves = useMemo(() => (dd ? buildLeaves(dd, cover) : []), [dd, cover]);
  useEffect(() => {
    setIndex((i) => Math.min(i, leaves.length));
  }, [leaves.length]);
  useEffect(() => {
    setIndex(0);
  }, [docId]);
  useEffect(() => {
    if (focus === "binding") setMode("3d");
    if (focus === "cover") { setMode("flip"); setIndex(0); }
    if (focus === "print") setMode((m) => (m === "3d" ? "flip" : m));
  }, [focus]);

  // Current right-hand page drives the sheet shape (auto orientation follows that page).
  const rightLeaf = leaves[Math.min(index, leaves.length - 1)];
  const refPage = rightLeaf?.front.page ?? 1;
  const pageSize = usePageSize(loaded, refPage);
  const pageLandscape = !!pageSize && pageSize.w > pageSize.h;
  const sheet = dd ? sheetMm(dd.paperSize, dd.orientation, pageLandscape) : { w: 210, h: 297, landscape: false };

  // Fit the spread to the stage, then apply zoom; A3 is drawn larger than A4 (to scale, within the stage).
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(640);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageW(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const paperScale = dd?.paperSize === "A3" ? 1.18 : 1;
  const maxH = compact ? 360 : 520;
  const fitW = Math.min((stageW - 48) / 2, (maxH * sheet.w) / sheet.h);
  const pageW = Math.max(110, fitW * paperScale * zoom);
  const pageH = (pageW * sheet.h) / sheet.w;

  const text: CoverText = coverText({
    title: draft.cover.title, subjectName: draft.cover.subjectName || "Subject name", subjectCode: draft.cover.subjectCode || "CODE",
    fullName: profile.full_name, registerNumber: profile.register_number, department: profile.department, year: profile.year,
    college: profile.college_name, filename: doc?.filename ?? "", orderCode: order.code,
  });
  const coverNode = <CoverArt text={text} template={draft.cover.template} color={draft.cover.color} />;

  const turnable = leaves.length;
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(turnable, i + 1));
  const onKey = (e: KeyboardEvent) => {
    if (mode !== "flip") return;
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  };

  // Swipe on touch screens.
  const swipe = useRef<number | null>(null);

  const sheets = dd ? sheetsPerCopy(dd) + (cover ? 1 : 0) : 0;
  const stack = dd ? stackMm(dd) : 0;

  return (
    <section aria-label="Live print preview" className="flex min-w-0 flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {order.documents.length > 1 && (
          <select
            aria-label="Document to preview"
            value={doc?.id}
            onChange={(e) => onDocChange(e.target.value)}
            className="h-10 max-w-[14rem] truncate rounded-xl border border-border bg-background px-3 text-sm font-semibold text-navy"
          >
            {order.documents.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
          </select>
        )}
        <div role="radiogroup" aria-label="Preview mode" className="flex rounded-xl bg-surface p-1">
          {([["flip", "Flip", BookOpen], ["scroll", "Scroll", Rows3], ["3d", "3D", Box]] as const).map(([v, l, I]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
              className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                mode === v ? "bg-background text-primary shadow-soft" : "text-muted hover:text-navy")}>
              <I className="size-3.5" aria-hidden /> {l}
            </button>
          ))}
        </div>
        {mode !== "3d" && (
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
            <Button variant="outline" size="icon-sm" aria-label="Zoom out" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => z - 1)}><Minus className="size-4" /></Button>
            <button type="button" onClick={() => setZoomIdx(2)} className="w-14 text-center text-xs font-bold text-ink-2 tabular" aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <Button variant="outline" size="icon-sm" aria-label="Zoom in" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((z) => z + 1)}><Plus className="size-4" /></Button>
          </div>
        )}
      </div>

      {/* stage */}
      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={onKey}
        onTouchStart={(e) => (swipe.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const s = swipe.current;
          const x = e.changedTouches[0]?.clientX;
          if (mode === "flip" && s !== null && x !== undefined && Math.abs(x - s) > 50) (x < s ? next : prev)();
          swipe.current = null;
        }}
        aria-label="Preview stage. Use the left and right arrow keys to turn pages."
        className={cn(
          "relative overflow-auto rounded-4xl bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#efeaf9_60%,#e6dff5_100%)] ring-1 ring-border focus-visible:outline-2 focus-visible:outline-primary",
          compact ? "h-[420px]" : "h-[min(68vh,620px)] min-h-[420px]",
        )}
      >
        {source.status !== "ready" ? (
          <SourceMessage state={source} filename={doc?.filename} />
        ) : !dd || !dd.pageCount ? (
          <Centered icon={<Info className="size-6" />} title="Enter the number of pages" body="We couldn't count the pages in this file. Enter the page count in Print settings to preview it." />
        ) : mode === "flip" ? (
          <div className="flex min-h-full min-w-max items-center justify-center p-6">
            <FlipBook
              leaves={leaves}
              index={index}
              onIndexChange={setIndex}
              doc={loaded}
              pageW={pageW}
              pageH={pageH}
              binding={draft.binding}
              cover={coverNode}
              coverColor={draft.cover.color}
              label={`${doc?.filename}: ${spreadLabel(leaves, index)}`}
            />
          </div>
        ) : mode === "scroll" ? (
          <ScrollPages leaves={leaves} doc={loaded} pageW={Math.min(pageW * 1.2, stageW - 48)} sheetRatio={sheet.h / sheet.w} cover={coverNode} />
        ) : (
          <div className="flex min-h-full items-center justify-center p-6">
            <BookModel
              binding={draft.binding}
              width={Math.min(240, stageW * 0.34) * paperScale}
              height={(Math.min(240, stageW * 0.34) * paperScale * sheet.h) / sheet.w}
              thicknessPx={Math.max(3, Math.min(120, (stack / dd.copies) * ((Math.min(240, stageW * 0.34) * paperScale) / sheet.w)))}
              firstPage={
                <SheetFace face={leaves[0]?.front ?? { page: 1, kind: "page" }} doc={loaded} rule={leaves[0]?.rule} cssWidth={260} cover={coverNode} />
              }
              cover={cover ? coverNode : null}
              coverText={cover ? text : { ...text, heading: draft.cover.title || doc?.filename.replace(/\.[^.]+$/, "") || "" }}
              coverColor={draft.cover.color}
              copies={dd.copies}
            />
          </div>
        )}

        {source.status === "ready" && source.converted && (
          <Badge tone="violet" className="absolute left-4 top-4">Converted from {doc?.filename.split(".").pop()?.toUpperCase()}</Badge>
        )}
      </div>

      {/* flip controls + info */}
      {source.status === "ready" && dd?.pageCount ? (
        <div className="flex flex-wrap items-center gap-3">
          {mode === "flip" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous page" disabled={index <= 0} onClick={prev}><ChevronLeft className="size-5" /></Button>
              <p className="min-w-32 text-center text-sm font-semibold text-navy tabular" aria-live="polite">{spreadLabel(leaves, index)}</p>
              <Button size="icon" aria-label="Next page" disabled={index >= turnable} onClick={next}><ChevronRight className="size-5" /></Button>
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">{dd.paperSize} · {sheet.w} × {sheet.h} mm</Badge>
            <Badge tone="neutral">{sheet.landscape ? "Landscape" : "Portrait"}{dd.orientation === "auto" ? " (auto)" : ""}</Badge>
            <Badge tone="neutral">{sheets} sheet{sheets === 1 ? "" : "s"} per copy</Badge>
            <Badge tone="neutral">≈ {stack.toFixed(1)} mm stack{dd.copies > 1 ? ` (${dd.copies} copies)` : ""}</Badge>
            <SizeCompare paper={dd.paperSize} landscape={sheet.landscape} />
          </div>
        </div>
      ) : null}

      {mode === "flip" && source.status === "ready" && dd?.pageCount ? (
        <Thumbnails leaves={leaves} doc={loaded} index={index} onPick={setIndex} cover={coverNode} ratio={sheet.h / sheet.w} />
      ) : null}

      <p className="flex items-start gap-2 rounded-2xl bg-sun-soft px-4 py-2.5 text-xs text-sun-ink">
        <ScanSearch className="mt-0.5 size-4 shrink-0" aria-hidden />
        Pages are your real document. Paper weight, show-through, colour and binding are illustrative simulations, not exact physical measurements.
      </p>
    </section>
  );
}

export function spreadLabel(leaves: Leaf[], index: number) {
  const left = leaves[index - 1]?.back;
  const right = leaves[index]?.front;
  const name = (f?: { page: number | null; kind: string }) => (!f ? null : f.kind === "cover" ? "Cover" : f.kind === "blank" ? null : `Page ${f.page}`);
  const parts = [name(left), name(right)].filter(Boolean);
  if (index >= leaves.length) return "End of document";
  return `${parts.join(" · ") || "Blank side"} — sheet ${Math.min(index + 1, leaves.length)} of ${leaves.length}`;
}

function SourceMessage({ state, filename }: { state: ReturnType<typeof useDocumentSource>; filename?: string }) {
  if (state.status === "loading") {
    return <Centered icon={<Loader2 className="size-6 animate-spin" />} title="Opening your document…" body={filename} />;
  }
  if (state.status === "converting") {
    return (
      <Centered
        icon={<RefreshCw className="size-6 animate-spin [animation-duration:2.5s]" />}
        title="Preparing a print preview"
        body="We're converting this file to PDF in the background. This usually takes under a minute; the preview appears here by itself."
      />
    );
  }
  if (state.status === "unavailable") return <Centered icon={<FileText className="size-6" />} title="Preview not available" body={state.reason} />;
  if (state.status === "error") {
    return (
      <Centered icon={<FileText className="size-6" />} title="We couldn't open this document" body={`${state.reason} Your upload is safe.`}
        action={<Button variant="outline" onClick={state.retry}><RefreshCw className="size-4" /> Try again</Button>} />
    );
  }
  return null;
}

function Centered({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-2 p-8 text-center" role="status">
      <span className="mb-1 flex size-14 items-center justify-center rounded-3xl bg-primary-soft text-primary">{icon}</span>
      <p className="font-display text-lg font-bold text-navy">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A4 vs A3 outlines to scale; the selected one is filled. */
function SizeCompare({ paper, landscape }: { paper: "A4" | "A3"; landscape: boolean }) {
  const s = 0.06;
  const box = (p: "A4" | "A3") => {
    const { w, h } = PAPER_MM[p];
    return landscape ? { w: h * s, h: w * s } : { w: w * s, h: h * s };
  };
  const a3 = box("A3");
  const a4 = box("A4");
  return (
    <svg width={a3.w + 2} height={a3.h + 2} viewBox={`-1 -1 ${a3.w + 2} ${a3.h + 2}`} aria-label={`${paper} shown against ${paper === "A4" ? "A3" : "A4"} to scale`} role="img">
      <rect x={0} y={0} width={a3.w} height={a3.h} rx={1.5} fill={paper === "A3" ? "#ede4ff" : "none"} stroke="#6d28d9" strokeWidth={1} strokeDasharray={paper === "A3" ? undefined : "2 2"} />
      <rect x={0} y={a3.h - a4.h} width={a4.w} height={a4.h} rx={1.5} fill={paper === "A4" ? "#ede4ff" : "none"} stroke="#6d28d9" strokeWidth={1} strokeDasharray={paper === "A4" ? undefined : "2 2"} />
    </svg>
  );
}

function Thumbnails({ leaves, doc, index, onPick, cover, ratio }: {
  leaves: Leaf[]; doc?: LoadedDoc; index: number; onPick: (i: number) => void; cover: React.ReactNode; ratio: number;
}) {
  const active = useRef<HTMLButtonElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must return a cleanup or nothing.
  useEffect(() => {
    active.current?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="listbox" aria-label="Sheets">
      {leaves.map((leaf, i) => (
        <Thumb key={i} leaf={leaf} i={i} doc={doc} cover={cover} ratio={ratio} selected={i === Math.min(index, leaves.length - 1)}
          refEl={i === Math.min(index, leaves.length - 1) ? active : undefined} onPick={() => onPick(i)} />
      ))}
    </div>
  );
}

function Thumb({ leaf, i, doc, cover, ratio, selected, onPick, refEl }: {
  leaf: Leaf; i: number; doc?: LoadedDoc; cover: React.ReactNode; ratio: number; selected: boolean; onPick: () => void;
  refEl?: React.RefObject<HTMLButtonElement | null>;
}) {
  const box = useRef<HTMLButtonElement>(null);
  const near = useNearViewport(box);
  const label = leaf.front.kind === "cover" ? "Cover" : leaf.back.kind === "page" ? `${leaf.front.page}–${leaf.back.page}` : `${leaf.front.page}`;
  return (
    <button
      ref={(el) => { box.current = el; if (refEl) refEl.current = el; }}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`Sheet ${i + 1}: ${leaf.front.kind === "cover" ? "cover page" : `page ${label}`}`}
      onClick={onPick}
      className={cn("shrink-0 rounded-xl p-1 transition-colors", selected ? "bg-primary ring-2 ring-primary" : "bg-background ring-1 ring-border hover:ring-primary/40")}
    >
      <div className="relative w-14 overflow-hidden rounded-md bg-white shadow-sm" style={{ height: 56 * ratio }}>
        {near && <SheetFace face={leaf.front} doc={doc} rule={leaf.rule} cssWidth={120} cover={cover} />}
        {leaf.back.kind === "page" && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-navy/80 px-1 text-[9px] font-bold text-white">2-sided</span>
        )}
      </div>
      <span className={cn("mt-1 block text-center text-[10px] font-bold tabular", selected ? "text-white" : "text-ink-2")}>{label}</span>
    </button>
  );
}

function ScrollPages({ leaves, doc, pageW, sheetRatio, cover }: { leaves: Leaf[]; doc?: LoadedDoc; pageW: number; sheetRatio: number; cover: React.ReactNode }) {
  const faces = leaves.flatMap((l) => [{ f: l.front, rule: l.rule, other: l.back }, ...(l.back.kind === "page" ? [{ f: l.back, rule: l.rule, other: l.front }] : [])]);
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {faces.map(({ f, rule, other }, i) => (
        <LazyPage key={i} width={pageW} height={pageW * sheetRatio}>
          <SheetFace face={f} doc={doc} rule={rule} cssWidth={pageW} cover={cover} reverse={other.kind === "page" ? other.page : null} />
          <span className="absolute -left-2 top-3 -translate-x-full rounded-full bg-navy/80 px-2 py-0.5 text-[10px] font-bold text-white max-sm:left-2 max-sm:translate-x-0">
            {f.kind === "cover" ? "Cover" : `p.${f.page}`}
          </span>
        </LazyPage>
      ))}
    </div>
  );
}

function LazyPage({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, "600px");
  return (
    <div ref={ref} className="relative shrink-0 rounded-[3px] bg-white shadow-lift" style={{ width, height }}>
      {near ? children : null}
    </div>
  );
}
