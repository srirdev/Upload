import { useEffect, useState } from "react";
import type { OrderDetail, OrderDocument } from "@/modules/student/api/types";
import { openDocument, type LoadedDoc } from "@/modules/student/features/studio/pdf";

export type SourceState =
  | { status: "loading" }
  | { status: "ready"; doc: LoadedDoc; converted: boolean }
  | { status: "converting" } // DOCX/PPTX being turned into a PDF preview in the background
  | { status: "unavailable"; reason: string } // can't preview; the original upload is kept and still printed
  | { status: "error"; reason: string; retry: () => void };

const isImage = (d: OrderDocument) => d.content_type.startsWith("image/");
const isPdf = (d: OrderDocument) => d.content_type === "application/pdf";

/** Opens the real uploaded content: the PDF itself, the converted PDF of a DOCX/PPTX, or the image. */
export function useDocumentSource(order: OrderDetail, d: OrderDocument | undefined): SourceState {
  const [state, setState] = useState<SourceState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const converted = !!d && !isPdf(d) && !isImage(d);
  const ready = !!d && (!converted || d.has_preview);
  useEffect(() => {
    if (!d) return;
    if (converted && d.conversion_status === "pending") return setState({ status: "converting" });
    if (converted && !d.has_preview) {
      return setState({
        status: "unavailable",
        reason:
          d.conversion_status === "failed"
            ? "We couldn't convert this file for preview. Your original upload is kept and will be printed as it is."
            : "A preview isn't available for this file. Your original upload is kept and will be printed as it is.",
      });
    }
    let live = true;
    setState({ status: "loading" });
    openDocument(order.id, d.id, d.content_type, converted)
      .then((doc) => live && setState({ status: "ready", doc, converted }))
      .catch((e: Error) =>
        live && setState({ status: "error", reason: e.message || "We couldn't open this document.", retry: () => setAttempt((n) => n + 1) }),
      );
    return () => {
      live = false;
    };
  }, [order.id, d?.id, d?.content_type, d?.conversion_status, converted, ready, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return d ? state : { status: "unavailable", reason: "No document selected." };
}

/** Rendered image URL for one page (null while rendering). Re-renders only when the size bucket changes. */
export function usePageImage(doc: LoadedDoc | undefined, page: number | null, cssWidth: number, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!doc || !page || page > doc.pages || !enabled) return;
    let live = true;
    setFailed(false);
    doc.render(page, cssWidth).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [doc, page, Math.ceil(cssWidth / 120), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { url: page ? url : null, failed };
}

/** Page shape in points; `landscape` drives `auto` orientation. */
export function usePageSize(doc: LoadedDoc | undefined, page: number | null) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!doc || !page || page > doc.pages) return;
    let live = true;
    doc.size(page).then((s) => live && setSize(s)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [doc, page]);
  return size;
}

/** Calls `onVisible` once the element scrolls near the viewport (lazy thumbnails / scroll view). */
export function useNearViewport<T extends Element>(ref: React.RefObject<T | null>, rootMargin = "300px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, rootMargin]);
  return near;
}
