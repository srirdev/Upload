import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Binding, CoverColor } from "@/modules/student/api/types";
import { coverHex, type Leaf } from "@/modules/student/features/studio/config";
import type { LoadedDoc } from "@/modules/student/features/studio/pdf";
import { SheetFace } from "@/modules/student/features/studio/Sheet";
import { cn } from "@/shared/utils/cn";

/**
 * Two-page spread with a realistic 3D page turn. `index` = number of leaves already turned:
 * the left page shows the back of leaf[index-1], the right page the front of leaf[index].
 * Turning one leaf animates (front face → back face, rotating about the spine, with moving shadows);
 * jumps of more than one leaf (thumbnails) go straight there. Reduced motion: a short crossfade instead.
 */
export function FlipBook({
  leaves, index, onIndexChange, doc, pageW, pageH, binding, cover, coverColor, label,
}: {
  leaves: Leaf[];
  index: number;
  onIndexChange: (i: number) => void;
  doc?: LoadedDoc;
  pageW: number;
  pageH: number;
  binding: Binding;
  cover: ReactNode;
  coverColor: CoverColor;
  label: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(index);
  const [turn, setTurn] = useState<null | { leaf: number; dir: 1 | -1 }>(null);
  const rot = useMotionValue(0);
  const busy = useRef(false);

  useEffect(() => {
    if (index === shown) return;
    if (reduce || Math.abs(index - shown) !== 1) {
      setShown(index);
      return;
    }
    const dir = index > shown ? 1 : -1;
    const leaf = dir === 1 ? shown : shown - 1;
    const target = index;
    busy.current = true;
    rot.set(dir === 1 ? 0 : -180);
    setTurn({ leaf, dir });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setShown(target);
      setTurn(null);
      busy.current = false;
    };
    const controls = animate(rot, dir === 1 ? -180 : 0, { duration: 0.75, ease: [0.45, 0.05, 0.25, 1], onComplete: finish });
    // A new request mid-turn (fast clicking) completes this turn instantly; the next effect run continues from there.
    return () => {
      controls.stop();
      finish();
    };
  }, [index, shown, reduce, rot]);

  // During a forward turn the right side already reveals the next leaf; backward, the left reveals the earlier one.
  const leftLeaf = turn?.dir === -1 ? turn.leaf - 1 : shown - 1;
  const rightLeaf = turn?.dir === 1 ? turn.leaf + 1 : shown;
  const turning = turn ? leaves[turn.leaf] : undefined;

  // Shadows follow the turn: the lifting page darkens towards the spine, the page underneath gets a cast shadow.
  const frontShade = useTransform(rot, [0, -90], [0, 0.35]);
  const backShade = useTransform(rot, [-90, -180], [0.35, 0]);
  const castShadow = useTransform(rot, [0, -90, -180], [0, 0.28, 0]);
  const lift = useTransform(rot, [0, -90, -180], [0, 1, 0]);
  const liftShadow = useTransform(lift, (v) => `0 ${8 + 18 * v}px ${20 + 30 * v}px rgb(20 15 60 / ${0.18 + 0.12 * v})`);

  const face = (l: number, side: "front" | "back") => {
    const leaf = leaves[l];
    if (!leaf) return null;
    const f = side === "front" ? leaf.front : leaf.back;
    const other = side === "front" ? leaf.back : leaf.front;
    return (
      <SheetFace
        face={f}
        doc={doc}
        rule={leaf.rule}
        cssWidth={pageW}
        cover={cover}
        reverse={other.kind === "page" ? other.page : null}
      />
    );
  };

  const bound = binding !== "none";
  const board = binding === "hard" || binding === "calico";
  const turned = shown; // leaves on the left stack
  const remaining = leaves.length - shown;
  const depth = (n: number) => Math.min(10, Math.ceil(n / 3));

  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: pageW * 2, height: pageH, perspective: pageW * 4 }}
      role="group"
      aria-roledescription="page flip viewer"
      aria-label={label}
    >
      {/* cover boards peeking around the pages for hard/calico/soft bindings */}
      {bound && binding !== "spiral" && (
        <div
          aria-hidden
          className="absolute rounded-[6px]"
          style={{
            inset: board ? -10 : -4,
            background: board ? coverHex(coverColor) : "#ece8f5",
            backgroundImage:
              binding === "calico"
                ? "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.06) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.08) 0 2px, transparent 2px 4px)"
                : board
                  ? "linear-gradient(135deg, rgb(255 255 255 / 0.12), transparent 40%, rgb(0 0 0 / 0.18))"
                  : undefined,
            boxShadow: "0 18px 40px -14px rgb(20 15 60 / 0.45)",
          }}
        />
      )}

      {/* left stack (turned leaves) */}
      <div className="absolute left-0 top-0" style={{ width: pageW, height: pageH }}>
        {leftLeaf >= 0 && (
          <motion.div
            key={`l-${leftLeaf}`}
            initial={reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            className="absolute inset-0 overflow-hidden rounded-l-[3px]"
            style={{ boxShadow: stackShadow(depth(turned), "left") }}
          >
            {face(leftLeaf, "back")}
            {bound && <Gutter side="left" />}
          </motion.div>
        )}
      </div>

      {/* right stack (unturned leaves) */}
      <div className="absolute top-0" style={{ left: pageW, width: pageW, height: pageH }}>
        {rightLeaf < leaves.length && rightLeaf >= 0 && (
          <motion.div
            key={`r-${rightLeaf}`}
            initial={reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            className="absolute inset-0 overflow-hidden rounded-r-[3px]"
            style={{ boxShadow: stackShadow(depth(remaining), "right") }}
          >
            {face(rightLeaf, "front")}
            {bound && <Gutter side="right" />}
            {turn && (
              <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black to-transparent" style={{ opacity: castShadow }} />
            )}
          </motion.div>
        )}
      </div>

      {/* the turning leaf */}
      {turning && turn && (
        <motion.div
          className="absolute top-0"
          style={{ left: pageW, width: pageW, height: pageH, rotateY: rot, transformOrigin: "left center", transformStyle: "preserve-3d", zIndex: 20, boxShadow: liftShadow }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-r-[3px]" style={{ backfaceVisibility: "hidden" }}>
            {face(turn.leaf, "front")}
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" style={{ opacity: frontShade }} />
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-l-[3px]" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            {face(turn.leaf, "back")}
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/80 via-black/20 to-transparent" style={{ opacity: backShade }} />
          </div>
        </motion.div>
      )}

      {binding === "spiral" && <SpiralRings height={pageH} x={pageW} />}

      {/* click halves to turn (buttons with labels live in the toolbar for keyboard/screen readers) */}
      <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 left-0 z-30 w-1/2 cursor-w-resize disabled:cursor-default"
        disabled={index <= 0} onClick={() => onIndexChange(Math.max(0, index - 1))} />
      <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 right-0 z-30 w-1/2 cursor-e-resize disabled:cursor-default"
        disabled={index >= leaves.length} onClick={() => onIndexChange(Math.min(leaves.length, index + 1))} />
    </div>
  );
}

/** Layered edge shadows that read as a stack of sheets (thicker = more sheets). */
function stackShadow(layers: number, side: "left" | "right") {
  const dir = side === "right" ? 1 : -1;
  const shadows = Array.from({ length: layers }, (_, i) => `${dir * (i + 1)}px ${i + 1}px 0 ${i % 2 ? "#e9e6ef" : "#f6f4fa"}`);
  return [...shadows, "0 12px 28px -10px rgb(20 15 60 / 0.35)"].join(", ");
}

/** Soft shadow along the binding edge of a bound book. */
function Gutter({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-y-0 w-[12%]", side === "left" ? "right-0" : "left-0")}
      style={{ background: `linear-gradient(to ${side === "left" ? "left" : "right"}, rgb(20 15 60 / 0.18), transparent)` }}
    />
  );
}

/** Metal coil loops along the spine, with punched holes on both pages. */
function SpiralRings({ height, x }: { height: number; x: number }) {
  const count = Math.max(8, Math.round(height / 22));
  const gap = height / count;
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 z-40" style={{ left: x - 14, width: 28, height }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="absolute left-0 w-full" style={{ top: i * gap + gap / 2 - 5, height: 10 }}>
          <span className="absolute left-[2px] top-[3px] size-[5px] rounded-full bg-navy/70" />
          <span className="absolute right-[2px] top-[3px] size-[5px] rounded-full bg-navy/70" />
          <span
            className="absolute inset-x-[3px] top-0 h-[10px] rounded-full border-[2.5px] border-[#8a8d99]"
            style={{ borderBottomColor: "transparent", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.6)", background: "transparent" }}
          />
        </div>
      ))}
    </div>
  );
}
