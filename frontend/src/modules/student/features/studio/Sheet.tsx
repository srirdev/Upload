import { FileWarning } from "lucide-react";
import type { ReactNode } from "react";
import type { Gsm, PrintRule } from "@/modules/student/api/types";
import { GSM_LOOK, type LeafFace } from "@/modules/student/features/studio/config";
import type { LoadedDoc } from "@/modules/student/features/studio/pdf";
import { usePageImage } from "@/modules/student/features/studio/useDocument";
import { cn } from "@/shared/utils/cn";

/** Paper tint per weight (illustrative): lighter stock is a touch greyer, heavier a touch brighter. */
const PAPER_BG: Record<Gsm, string> = {
  70: "#f7f7f4",
  80: "#fbfbf9",
  100: "#ffffff",
};

/**
 * One printed side of a sheet. The real page image is fitted inside the sheet (portrait pages on a landscape
 * sheet keep their shape, exactly as a printer scales to fit). B&W rules render in greyscale; on double-sided
 * sheets the reverse page shows through faintly, more on lighter paper.
 */
export function SheetFace({
  face, doc, rule, cssWidth, cover, reverse, className, eager = true,
}: {
  face: LeafFace;
  doc?: LoadedDoc;
  rule?: PrintRule;
  cssWidth: number;
  /** The rendered cover page (for `face.kind === "cover"`). */
  cover?: ReactNode;
  /** The page printed on the other side of this sheet (for show-through). */
  reverse?: number | null;
  className?: string;
  eager?: boolean;
}) {
  const gsm = (rule?.gsm ?? 80) as Gsm;
  const look = GSM_LOOK[gsm];
  const { url, failed } = usePageImage(doc, face.kind === "page" ? face.page : null, cssWidth, eager);
  const back = usePageImage(doc, reverse ?? null, cssWidth, eager && !!reverse);
  const bw = rule?.color === "bw";

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} style={{ background: PAPER_BG[gsm] }}>
      {/* paper fibre texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgb(0 0 0 / 0.035) 0.6px, transparent 0.8px), radial-gradient(rgb(0 0 0 / 0.025) 0.6px, transparent 0.8px)",
          backgroundSize: "3px 3px, 5px 5px",
          backgroundPosition: "0 0, 1px 2px",
        }}
      />
      {/* show-through of the reverse side (mirrored), only on double-sided sheets */}
      {reverse && back.url && (
        <img
          src={back.url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{ transform: "scaleX(-1)", opacity: look.showThrough, filter: "grayscale(1) blur(0.4px)", mixBlendMode: "multiply" }}
        />
      )}

      {face.kind === "cover" && <div className="absolute inset-0">{cover}</div>}

      {face.kind === "page" && (
        <>
          {url ? (
            <img
              src={url}
              alt={`Page ${face.page}`}
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-contain transition-[filter] duration-300"
              style={{ filter: bw ? "grayscale(1) contrast(1.08)" : "saturate(1.04)", mixBlendMode: "multiply" }}
            />
          ) : failed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted">
              <FileWarning className="size-6" aria-hidden /> Page {face.page} couldn't be drawn
            </div>
          ) : (
            <div className="skeleton-shimmer absolute inset-[6%] rounded-sm" aria-label={`Loading page ${face.page}`} role="status" />
          )}
        </>
      )}

      {face.kind === "blank" && (
        <div className="absolute inset-x-0 bottom-[6%] text-center text-[10px] font-medium uppercase tracking-[0.18em] text-black/20">
          Blank side
        </div>
      )}
    </div>
  );
}
