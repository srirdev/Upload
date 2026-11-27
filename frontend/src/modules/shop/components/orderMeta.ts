import type { StatusKind } from "@/shared/components/ui/badge";
import type { Step } from "@/shared/components/ui/progress";
import { FINISHED_LABEL, type ShopOrder } from "@/modules/shop/api/types";
import type { PrintRule } from "@/modules/student/api/types";

/** Where an order sits in the shop's pipeline (derived from server status + next action, never guessed). */
export type Stage = "new" | "printing" | "packing" | "handover" | "delivering" | "done";

export function stageOf(o: Pick<ShopOrder, "status" | "next_action">): Stage {
  if (o.status === "placed") return "new";
  if (o.status === "accepted" || o.status === "printing") return "printing";
  if (o.status === "packing") return o.next_action === "handover_otp" ? "handover" : "packing";
  if (o.status === "handover_verified" || o.status === "out_for_delivery") return "delivering";
  return "done";
}

export const STAGE: Record<Stage, { label: string; kind: StatusKind; step: number; stripe: string }> = {
  new: { label: "New order", kind: "new", step: 0, stripe: "bg-primary" },
  printing: { label: "Printing", kind: "progress", step: 1, stripe: "bg-orange" },
  packing: { label: "Binding & packing", kind: "progress", step: 2, stripe: "bg-orange" },
  handover: { label: "Ready for handover", kind: "waiting", step: 3, stripe: "bg-sun" },
  delivering: { label: "Handed over", kind: "done", step: 4, stripe: "bg-mint" },
  done: { label: "Delivered", kind: "done", step: 5, stripe: "bg-mint" },
};

/** Status label: finished orders use the server's exact state ("Out for delivery", "Collected"…). */
export const stageLabel = (o: ShopOrder) => FINISHED_LABEL[o.status] ?? STAGE[stageOf(o)].label;

export const ORDER_STEPS: Step[] = [
  { label: "New" }, { label: "Printing" }, { label: "Packing" }, { label: "Handover" }, { label: "Delivered" },
];

export const ruleText = (r: PrintRule) =>
  `Pages ${r.page_from}–${r.page_to} · ${r.color === "color" ? "Colour" : "B&W"} · ${r.gsm} GSM · ${r.sided === "double" ? "Double-sided" : "Single-sided"}`;

export const BINDING_LABEL: Record<string, string> = { none: "No binding", spiral: "Spiral", calico: "Calico", soft: "Soft cover", hard: "Hard cover" };

export const ORIENTATION_LABEL: Record<string, string> = { portrait: "Portrait", landscape: "Landscape" };

export const COVER_TEMPLATE_LABEL: Record<string, string> = { classic: "Classic", modern: "Modern", minimal: "Minimal" };

/** Swatches for the cover palette keys (display only; the backend renders the real cover PDF). */
export const COVER_COLORS: Record<string, { label: string; hex: string }> = {
  // Must match backend COVER_RGB (orders/enums.py): this is the colour the shop prints.
  navy: { label: "Navy", hex: "#1b2a4a" },
  maroon: { label: "Maroon", hex: "#7a1e2e" },
  forest: { label: "Forest green", hex: "#1c543a" },
  royal: { label: "Royal blue", hex: "#244ca8" },
  charcoal: { label: "Charcoal", hex: "#34343a" },
  violet: { label: "Violet", hex: "#5828a0" },
};

/** Human label for a cover colour key; unknown keys fall back to the raw value, capitalised. */
export const coverColorLabel = (key: string) => COVER_COLORS[key]?.label ?? key.charAt(0).toUpperCase() + key.slice(1);

/** Total printed pages across documents (pages × copies); null if any page count is unknown. */
export function totalPages(o: ShopOrder): number | null {
  let n = 0;
  for (const d of o.documents) {
    if (d.page_count === null) return null;
    n += d.page_count * d.copies;
  }
  return n;
}

/** Free-text match over the fields a shop owner would search by. */
export function matches(o: ShopOrder, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [o.code, o.college_name, o.subject_name ?? "", o.subject_code ?? "", ...o.documents.map((d) => d.filename)]
    .some((f) => f.toLowerCase().includes(s));
}
