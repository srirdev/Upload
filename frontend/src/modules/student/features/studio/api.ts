import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { configureDocument, setBinding } from "@/modules/student/api";
import type { OrderDetail, Quotation } from "@/modules/student/api/types";
import type { StudioDraft } from "@/modules/student/features/studio/config";
import { api } from "@/shared/api/client";

/** The proposal body for `/quotation/preview`: unsaved studio settings, priced server-side, never written. */
export function proposal(order: OrderDetail, draft: StudioDraft) {
  return {
    documents: order.documents
      .filter((d) => draft.docs[d.id]?.pageCount)
      .map((d) => {
        const dd = draft.docs[d.id]!;
        return { id: d.id, copies: dd.copies, paper_size: dd.paperSize, page_count: d.page_count_auto ? null : dd.pageCount, rules: dd.rules };
      }),
    binding: draft.binding,
    cover_page: draft.cover.enabled,
  };
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Live price for the draft (debounced so dragging a copies stepper doesn't spam the API). */
export function useLiveQuote(order: OrderDetail, draft: StudioDraft) {
  const body = useDebounced(JSON.stringify(proposal(order, draft)), 350);
  return useQuery({
    queryKey: ["student", "quote-preview", order.id, body, order.chosen_shop?.id, order.coupon_code],
    queryFn: () => api<Quotation>(`/orders/${order.id}/quotation/preview`, { method: "POST", body, headers: { "Content-Type": "application/json" } }),
    placeholderData: (prev) => prev,
    retry: false,
    staleTime: 30_000,
  });
}

/** Problems to fix before the configuration can be saved (shown inline; the server re-validates). */
export function validateDraft(order: OrderDetail, draft: StudioDraft): string[] {
  const out: string[] = [];
  for (const d of order.documents) {
    const dd = draft.docs[d.id];
    if (!dd?.pageCount) out.push(`Enter the number of pages for ${d.filename}`);
  }
  if (draft.cover.enabled) {
    if (!draft.cover.subjectName.trim()) out.push("Enter the subject name for the cover page");
    if (!draft.cover.subjectCode.trim()) out.push("Enter the subject code for the cover page");
  }
  return out;
}

/**
 * Saves the studio's configuration to the order (documents, then binding + cover). This is the only place the
 * studio writes; the preview itself never changes the order.
 */
export async function saveDraft(order: OrderDetail, draft: StudioDraft) {
  const errors: Record<string, string> = {};
  const results = await Promise.allSettled(
    order.documents.map((d) => {
      const dd = draft.docs[d.id]!;
      return configureDocument(order.id, d.id, {
        copies: dd.copies,
        paper_size: dd.paperSize,
        orientation: dd.orientation,
        page_count: d.page_count_auto ? undefined : dd.pageCount,
        rules: dd.rules,
      });
    }),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") errors[order.documents[i]!.id] = (r.reason as Error).message;
  });
  if (Object.keys(errors).length) return { errors };
  const c = draft.cover;
  await setBinding(order.id, {
    binding: draft.binding,
    cover_page: c.enabled,
    subject_name: c.enabled ? c.subjectName.trim() : null,
    subject_code: c.enabled ? c.subjectCode.trim() : null,
    cover_template: c.template,
    cover_color: c.color,
    cover_title: c.enabled ? c.title.trim() || null : null,
  });
  return { errors };
}
