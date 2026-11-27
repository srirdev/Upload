/**
 * Print Preview Studio: the editable configuration and the (illustrative) physical simulation maths.
 * The draft mirrors exactly what is saved on the order; nothing here changes the order until the student saves.
 */
import type {
  Binding, ColorMode, CoverColor, CoverTemplate, Gsm, OrderDetail, OrderDocument, Orientation, PaperSize, PrintRule, Sided,
} from "@/modules/student/api/types";

export interface DocDraft {
  copies: number;
  paperSize: PaperSize;
  orientation: Orientation;
  pageCount: number | null;
  rules: PrintRule[];
}

export interface CoverDraft {
  enabled: boolean;
  template: CoverTemplate;
  color: CoverColor;
  subjectName: string;
  subjectCode: string;
  title: string;
}

export interface StudioDraft {
  docs: Record<string, DocDraft>;
  binding: Binding;
  cover: CoverDraft;
}

export const DEFAULT_RULE = { color: "bw", gsm: 80, sided: "single" } as const satisfies Omit<PrintRule, "page_from" | "page_to">;

export const docDraft = (d: OrderDocument): DocDraft => ({
  copies: d.copies,
  paperSize: d.paper_size,
  orientation: d.orientation ?? "auto",
  pageCount: d.page_count,
  rules: d.rules.length ? d.rules : d.page_count ? [{ page_from: 1, page_to: d.page_count, ...DEFAULT_RULE }] : [],
});

/** The draft as saved on the order right now (the studio's starting point and its "Reset"). */
export const draftFromOrder = (o: OrderDetail): StudioDraft => ({
  docs: Object.fromEntries(o.documents.map((d) => [d.id, docDraft(d)])),
  binding: o.binding,
  cover: {
    enabled: o.cover_page,
    template: o.cover_template ?? "classic",
    color: o.cover_color ?? "navy",
    subjectName: o.subject_name ?? "",
    subjectCode: o.subject_code ?? "",
    title: o.cover_title ?? "",
  },
});

/** Keeps ranges contiguous: the first starts at 1, each starts after the previous, the last ends at pageCount. */
export function normaliseRules(rules: PrintRule[], pageCount: number): PrintRule[] {
  let from = 1;
  return rules.map((r, i) => {
    const last = i === rules.length - 1;
    const to = last ? pageCount : Math.min(Math.max(r.page_to, from), pageCount);
    const out = { ...r, page_from: from, page_to: to };
    from = to + 1;
    return out;
  });
}

export const ruleFor = (rules: PrintRule[], page: number): PrintRule | undefined =>
  rules.find((r) => page >= r.page_from && page <= r.page_to) ?? rules[rules.length - 1];

/** True when every range shares the same colour/GSM/sides (the simple editor can show it). */
export const uniform = (rules: PrintRule[]) =>
  rules.every((r) => r.color === rules[0]?.color && r.gsm === rules[0]?.gsm && r.sided === rules[0]?.sided);

export const sameDraft = (a: StudioDraft, b: StudioDraft) => JSON.stringify(a) === JSON.stringify(b);

/* ---- Paper ------------------------------------------------------------------------------------ */

/** ISO 216 portrait dimensions in millimetres. */
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };

/** Sheet dimensions for a page: `auto` follows the page's own shape (landscape pages print landscape). */
export function sheetMm(paper: PaperSize, orientation: Orientation, pageIsLandscape: boolean) {
  const { w, h } = PAPER_MM[paper];
  const landscape = orientation === "landscape" || (orientation === "auto" && pageIsLandscape);
  return landscape ? { w: h, h: w, landscape } : { w, h, landscape };
}

/**
 * Illustrative paper properties per weight. Typical office paper is ~0.1 mm per sheet; these are
 * approximations for the simulation only, not measurements.
 */
export const GSM_LOOK: Record<Gsm, { mm: number; showThrough: number; edge: number; label: string; feel: string }> = {
  70: { mm: 0.09, showThrough: 0.12, edge: 1, label: "70 GSM", feel: "Light, thin. Some show-through on double-sided pages." },
  80: { mm: 0.1, showThrough: 0.06, edge: 1.5, label: "80 GSM", feel: "Standard office paper. Good for most documents." },
  100: { mm: 0.12, showThrough: 0.02, edge: 2.5, label: "100 GSM", feel: "Thick, premium feel. Little show-through." },
};

/** Physical sheets for one copy of a document under its rules (double-sided ranges use one sheet per 2 pages). */
export function sheetsPerCopy(d: DocDraft): number {
  if (!d.pageCount) return 0;
  return d.rules.reduce((n, r) => {
    const pages = Math.max(0, r.page_to - r.page_from + 1);
    return n + (r.sided === "double" ? Math.ceil(pages / 2) : pages);
  }, 0);
}

/** Illustrative stack height in mm across all copies (paper thickness by GSM). */
export function stackMm(d: DocDraft): number {
  if (!d.pageCount) return 0;
  const perCopy = d.rules.reduce((mm, r) => {
    const pages = Math.max(0, r.page_to - r.page_from + 1);
    const sheets = r.sided === "double" ? Math.ceil(pages / 2) : pages;
    return mm + sheets * GSM_LOOK[r.gsm].mm;
  }, 0);
  return perCopy * d.copies;
}

/**
 * Leaves for the flip view. A leaf is one physical sheet with a front and a back.
 * Double-sided ranges put consecutive pages on front/back; single-sided sheets have a blank back.
 * `cover` prepends the generated cover page (printed single-sided).
 */
export interface LeafFace {
  page: number | null; // 1-based document page, null = blank side
  kind: "page" | "blank" | "cover";
}
export interface Leaf {
  front: LeafFace;
  back: LeafFace;
  rule?: PrintRule;
}

export function buildLeaves(d: DocDraft, cover: boolean): Leaf[] {
  const leaves: Leaf[] = [];
  if (cover) leaves.push({ front: { page: null, kind: "cover" }, back: { page: null, kind: "blank" } });
  if (!d.pageCount) return leaves;
  let p = 1;
  while (p <= d.pageCount) {
    const rule = ruleFor(d.rules, p);
    const duplex = rule?.sided === "double" && p + 1 <= d.pageCount && ruleFor(d.rules, p + 1)?.sided === "double";
    leaves.push({
      rule,
      front: { page: p, kind: "page" },
      back: duplex ? { page: p + 1, kind: "page" } : { page: null, kind: "blank" },
    });
    p += duplex ? 2 : 1;
  }
  return leaves;
}

/* ---- Binding & cover ---------------------------------------------------------------------------- */

export const BINDINGS: { value: Binding; label: string; hint: string }[] = [
  { value: "none", label: "No binding", hint: "Loose sheets, neatly stacked" },
  { value: "spiral", label: "Spiral", hint: "Lies flat, easy to flip" },
  { value: "calico", label: "Calico", hint: "Cloth-taped hard cover" },
  { value: "soft", label: "Soft binding", hint: "Glued, flexible card cover" },
  { value: "hard", label: "Hard binding", hint: "Rigid boards, for theses" },
];

export const COVER_TEMPLATES: { value: CoverTemplate; label: string; hint: string }[] = [
  { value: "classic", label: "Classic", hint: "Centred, double border" },
  { value: "modern", label: "Modern", hint: "Bold colour band" },
  { value: "minimal", label: "Minimal", hint: "Clean, left-aligned" },
];

/** Must match backend COVER_RGB (app/modules/orders/enums.py) so the printed cover matches the preview. */
export const COVER_COLORS: Record<CoverColor, { label: string; rgb: [number, number, number] }> = {
  navy: { label: "Navy", rgb: [27, 42, 74] },
  maroon: { label: "Maroon", rgb: [122, 30, 46] },
  forest: { label: "Forest", rgb: [28, 84, 58] },
  royal: { label: "Royal blue", rgb: [36, 76, 168] },
  charcoal: { label: "Charcoal", rgb: [52, 52, 58] },
  violet: { label: "Violet", rgb: [88, 40, 160] },
};
export const coverHex = (c: CoverColor) => `rgb(${COVER_COLORS[c].rgb.join(" ")})`;

export type { ColorMode, Gsm, Sided };
