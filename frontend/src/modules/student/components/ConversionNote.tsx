import { useState } from "react";
import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { openDocument } from "@/modules/student/api";
import type { OrderDocument } from "@/modules/student/api/types";
import { toastError } from "@/shared/components/ui/toast";

/** DOCX/PPTX conversion status. Informational only: it never blocks the order. */
export function ConversionNote({ orderId, doc }: { orderId: string; doc: OrderDocument }) {
  const [opening, setOpening] = useState(false);
  if (doc.conversion_status === "pending")
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-sun-ink">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Preparing preview… page count is an estimate, please check it
      </p>
    );
  if (doc.conversion_status === "failed")
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-danger">
        <AlertTriangle className="size-3.5" aria-hidden /> Couldn't convert, please confirm the page count
      </p>
    );
  if (doc.conversion_status !== "done" || !doc.has_preview) return null;
  return (
    <button
      type="button"
      disabled={opening}
      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
      onClick={() => {
        setOpening(true);
        openDocument(orderId, doc.id, true).catch(toastError).finally(() => setOpening(false));
      }}
    >
      <Eye className="size-3.5" aria-hidden /> Preview PDF
    </button>
  );
}
