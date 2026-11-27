import type { ReactNode } from "react";
import { FileImage, FileText, Presentation, type LucideIcon } from "lucide-react";
import type { OrderDocument } from "@/modules/student/api/types";
import { ConversionNote } from "@/modules/student/components/ConversionNote";
import type { Tone } from "@/shared/components/ui/badge";
import { IconTile } from "@/shared/components/ui/badge";
import { cn } from "@/shared/utils/cn";
import { formatBytes } from "@/shared/utils/format";

/** File-type identity: icon + tint + short tag (so type is never colour-alone). */
export function docKind(doc: Pick<OrderDocument, "content_type" | "filename">): { icon: LucideIcon; tone: Tone; tag: string } {
  const ext = doc.filename.split(".").pop()?.toUpperCase() ?? "";
  if (doc.content_type.startsWith("image/")) return { icon: FileImage, tone: "mint", tag: ext || "IMG" };
  if (ext === "PPTX") return { icon: Presentation, tone: "orange", tag: "PPTX" };
  if (ext === "DOCX") return { icon: FileText, tone: "violet", tag: "DOCX" };
  return { icon: FileText, tone: "danger", tag: ext || "PDF" };
}

export function pagesLabel(n: number | null) {
  return n ? `${n} page${n > 1 ? "s" : ""}` : "Pages: set in the next step";
}

/** Rich document row: type tile, name, pages · size, conversion status, and caller-supplied actions. */
export function DocumentCard({
  orderId, doc, actions, meta, className,
}: { orderId: string; doc: OrderDocument; actions?: ReactNode; meta?: ReactNode; className?: string }) {
  const kind = docKind(doc);
  return (
    <div className={cn("flex items-center gap-3 rounded-3xl bg-background p-3.5 shadow-soft ring-1 ring-border/60", className)}>
      <div className="relative">
        <IconTile icon={kind.icon} tone={kind.tone} size="lg" />
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-navy px-1.5 text-[9px] font-bold leading-4 text-white">{kind.tag}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-navy" title={doc.filename}>{doc.filename}</p>
        <p className="text-xs text-muted">
          {meta ?? <>{pagesLabel(doc.page_count)} · {formatBytes(doc.size_bytes)}</>}
        </p>
        <ConversionNote orderId={orderId} doc={doc} />
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
