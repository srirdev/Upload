import { RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Binding, CoverColor } from "@/modules/student/api/types";
import { coverHex } from "@/modules/student/features/studio/config";
import type { CoverText } from "@/modules/student/features/studio/CoverArt";
import { cn } from "@/shared/utils/cn";

const VIEWS = [
  { key: "front", label: "Front", yaw: -18, pitch: 8 },
  { key: "angle", label: "Angle", yaw: -42, pitch: 14 },
  { key: "spine", label: "Spine", yaw: 62, pitch: 6 },
  { key: "back", label: "Back", yaw: 160, pitch: 8 },
] as const;

/**
 * The finished, assembled document as a rotatable 3D object (illustrative): loose stack, spiral notebook,
 * calico, soft or hard bound book. Thickness follows the real sheet count and paper weight.
 * Drag to rotate, or pick a preset angle.
 */
export function BookModel({
  binding, width, height, thicknessPx, firstPage, cover, coverText, coverColor, copies,
}: {
  binding: Binding;
  width: number;
  height: number;
  thicknessPx: number;
  /** What the top sheet looks like (cover page if chosen, else page 1). */
  firstPage: ReactNode;
  /** The printed cover page (when the student added one). */
  cover: ReactNode | null;
  coverText: CoverText | null;
  coverColor: CoverColor;
  copies: number;
}) {
  const reduce = useReducedMotion();
  const [yaw, setYaw] = useState<number>(VIEWS[1].yaw);
  const [pitch, setPitch] = useState<number>(VIEWS[1].pitch);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const board = binding === "hard" || binding === "calico";
  const overhang = board ? Math.round(width * 0.03) : 0;
  const W = width + overhang * 2;
  const H = height + overhang * 2;
  const boardT = binding === "hard" ? 7 : binding === "calico" ? 5 : binding === "soft" ? 2 : 0;
  const T = Math.max(binding === "none" ? 2 : 4, Math.min(W * 0.6, thicknessPx + boardT * 2));
  const accent = coverHex(coverColor);

  const coverSurface: CSSProperties =
    binding === "calico"
      ? {
          background: accent,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.09) 0 1px, transparent 1px 3px)",
        }
      : binding === "hard"
        ? { background: `linear-gradient(135deg, rgb(255 255 255 / 0.16), transparent 35%, rgb(0 0 0 / 0.28)), ${accent}` }
        : binding === "soft"
          ? { background: "#fbfaf7" }
          : { background: "#fff" };

  const face = (style: CSSProperties, children?: ReactNode, className?: string) => (
    <div className={cn("absolute overflow-hidden", className)} style={{ backfaceVisibility: "hidden", ...style }}>{children}</div>
  );
  const pageEdges: CSSProperties = {
    background: "#f4f1ea",
    backgroundImage: "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px)",
  };

  const front = (() => {
    if (binding === "none" || binding === "spiral") {
      return (
        <div className="relative h-full w-full">
          {firstPage}
          {binding === "spiral" && (
            <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/35 via-white/5 to-white/25 ring-1 ring-inset ring-white/60" />
          )}
        </div>
      );
    }
    if (binding === "soft") return cover ?? <PrintedTitle text={coverText} color={accent} />;
    return <FoilTitle text={coverText} />;
  })();

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setYaw(d.yaw + (e.clientX - d.x) * 0.5);
    setPitch(Math.max(-30, Math.min(40, d.pitch - (e.clientY - d.y) * 0.3)));
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        style={{ width: W * 1.6, height: H * 1.25, perspective: W * 5 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        role="img"
        aria-label={`3D view of the ${binding === "none" ? "loose stack" : `${binding} bound document`}. Drag to rotate.`}
      >
        {/* floor shadow */}
        <div aria-hidden className="absolute bottom-[4%] h-6 rounded-[50%] bg-navy/25 blur-xl" style={{ width: W * 1.1 }} />
        {/* extra copies, offset behind (loose stacks are cross-stacked the way shops hand them over) */}
        {Array.from({ length: Math.min(copies, 4) - 1 }, (_, i) => (
          <div key={i} aria-hidden className="absolute rounded-[3px] bg-white shadow-soft ring-1 ring-black/5"
            style={{ width: W, height: H, transform: `translate(${(i + 1) * 10}px, ${-(i + 1) * 8}px) rotate(${binding === "none" ? (i % 2 ? -4 : 4) : 0}deg)`, opacity: 0.9 - i * 0.15 }} />
        ))}
        <motion.div
          className="relative"
          style={{ width: W, height: H, transformStyle: "preserve-3d" }}
          animate={{ rotateY: yaw, rotateX: pitch }}
          transition={drag.current || reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
        >
          {/* front */}
          {face({ inset: 0, transform: `translateZ(${T / 2}px)`, borderRadius: binding === "hard" ? "2px 6px 6px 2px" : 3, ...coverSurface }, front)}
          {/* back */}
          {face(
            { inset: 0, transform: `rotateY(180deg) translateZ(${T / 2}px)`, borderRadius: 3, ...(binding === "spiral" ? { background: "#2a2840" } : coverSurface) },
            binding === "none" ? <div className="h-full w-full bg-[#fbfbf9]" /> : null,
          )}
          {/* spine (left) */}
          {face(
            { width: T, height: H, left: (W - T) / 2, top: 0, transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
              ...(binding === "none" || binding === "spiral" ? pageEdges : coverSurface) },
            binding === "spiral" ? <SpiralSpine height={H} /> : binding === "none" ? null : <SpineTitle text={coverText} dark={binding !== "soft"} />,
          )}
          {/* fore-edge (right) */}
          {face({ width: T, height: height, left: (W - T) / 2, top: overhang, transform: `rotateY(90deg) translateZ(${W / 2 - overhang}px)`, ...pageEdges })}
          {/* top & bottom page edges */}
          {face({ width: width, height: T, left: overhang, top: (H - T) / 2, transform: `rotateX(90deg) translateZ(${H / 2 - overhang}px)`, ...pageEdges, backgroundImage: "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px)" })}
          {face({ width: width, height: T, left: overhang, top: (H - T) / 2, transform: `rotateX(-90deg) translateZ(${H / 2 - overhang}px)`, ...pageEdges, backgroundImage: "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px)" })}
        </motion.div>
        {copies > 1 && (
          <span className="absolute right-0 top-0 rounded-full bg-navy px-3 py-1 text-xs font-bold text-white shadow-soft">× {copies} copies</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="View angle">
        {VIEWS.map((v) => {
          const on = Math.round(yaw) === v.yaw && Math.round(pitch) === v.pitch;
          return (
            <button
              key={v.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setYaw(v.yaw); setPitch(v.pitch); }}
              className={cn("h-8 rounded-full px-3 text-xs font-semibold ring-1 transition-colors", on ? "bg-navy text-white ring-navy" : "bg-background text-ink-2 ring-border hover:ring-primary/40")}
            >
              {v.label}
            </button>
          );
        })}
        <button type="button" aria-label="Reset angle" onClick={() => { setYaw(VIEWS[1].yaw); setPitch(VIEWS[1].pitch); }}
          className="flex size-8 items-center justify-center rounded-full text-muted ring-1 ring-border hover:text-navy">
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Gold-foil lettering on calico / hard covers. */
function FoilTitle({ text }: { text: CoverText | null }) {
  const foil: CSSProperties = {
    backgroundImage: "linear-gradient(180deg, #f9e7a8 0%, #d6a740 45%, #f4d47c 60%, #b8862b 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
  return (
    <div className="flex h-full w-full flex-col items-center justify-between px-[8%] py-[12%] text-center" style={{ containerType: "inline-size" }}>
      <p className="font-bold uppercase tracking-[0.12em]" style={{ ...foil, fontSize: "4.2cqw" }}>{text?.college ?? ""}</p>
      <div>
        <p className="font-bold leading-tight" style={{ ...foil, fontSize: "7.5cqw", fontFamily: "Georgia, serif" }}>{text?.heading || "Untitled"}</p>
        {text?.sub && <p className="mt-[3cqw]" style={{ ...foil, fontSize: "4.5cqw" }}>{text.sub}</p>}
      </div>
      <div>
        <p className="font-bold" style={{ ...foil, fontSize: "5cqw" }}>{text?.name ?? ""}</p>
        <p style={{ ...foil, fontSize: "3.8cqw" }}>{text?.details[0] ?? ""}</p>
      </div>
    </div>
  );
}

/** Printed title on a plain soft-binding card when no cover page was chosen. */
function PrintedTitle({ text, color }: { text: CoverText | null; color: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-[3cqw] px-[10%]" style={{ containerType: "inline-size" }}>
      <span className="h-[1.2cqw] w-[18cqw]" style={{ background: color }} />
      <p className="font-bold leading-tight text-[#1c1c26]" style={{ fontSize: "7cqw" }}>{text?.heading || "Soft bound document"}</p>
    </div>
  );
}

function SpineTitle({ text, dark }: { text: CoverText | null; dark: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span
        className={cn("whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.2em]", dark ? "text-[#f1d68a]" : "text-[#1c1c26]")}
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {text?.heading?.slice(0, 40) || ""}
      </span>
    </div>
  );
}

function SpiralSpine({ height }: { height: number }) {
  const n = Math.max(10, Math.round(height / 14));
  return (
    <div className="flex h-full w-full flex-col items-center justify-evenly bg-[#f4f1ea]">
      {Array.from({ length: n }, (_, i) => <span key={i} className="h-[5px] w-[120%] rounded-full bg-gradient-to-b from-[#c4c6cf] to-[#6f7280]" />)}
    </div>
  );
}
