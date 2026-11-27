import type { StatusKind } from "@/shared/components/ui/badge";
import type { Step } from "@/shared/components/ui/progress";
import type { Binding, OrderStatus, TimelineStep } from "@/modules/student/api/types";
import { formatDateTime } from "@/shared/utils/format";

/** Visual status kind for an order (icon + colour come from StatusPill). */
export function statusKind(s: OrderStatus): StatusKind {
  switch (s) {
    case "draft":
    case "awaiting_payment":
      return "waiting";
    case "placed":
    case "accepted":
      return "new";
    case "printing":
    case "packing":
    case "handover_verified":
    case "out_for_delivery":
      return "progress";
    case "delivered":
    case "collected":
      return "done";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "problem";
  }
}

/** Compact tracker used on cards (the detail page uses the API's own timeline). */
export const TRACK_STEPS: Step[] = [
  { label: "Placed" },
  { label: "Printing" },
  { label: "Packing" },
  { label: "On the way" },
  { label: "At cabin" },
];

/** Index of the stage in progress; TRACK_STEPS.length once collected. */
export function trackStage(s: OrderStatus): number {
  switch (s) {
    case "printing":
      return 1;
    case "packing":
      return 2;
    case "handover_verified":
    case "out_for_delivery":
      return 3;
    case "delivered":
      return 4;
    case "collected":
      return TRACK_STEPS.length;
    default:
      return 0;
  }
}

/** API timeline → ProgressSteps props (current = first step not yet done). */
export function timelineSteps(timeline: TimelineStep[]): { steps: Step[]; current: number } {
  const firstOpen = timeline.findIndex((t) => !t.done);
  return {
    steps: timeline.map((t) => ({ label: t.label, detail: t.at ? formatDateTime(t.at) : null })),
    current: firstOpen === -1 ? timeline.length : firstOpen,
  };
}

export const BINDING_LABEL: Record<Binding, string> = {
  none: "No binding",
  spiral: "Spiral binding",
  calico: "Calico binding",
  soft: "Soft binding",
  hard: "Hard binding",
};
