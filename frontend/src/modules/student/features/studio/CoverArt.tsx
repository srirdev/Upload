import type { CSSProperties, ReactNode } from "react";
import type { CoverColor, CoverTemplate } from "@/modules/student/api/types";
import { coverHex } from "@/modules/student/features/studio/config";
import { cn } from "@/shared/utils/cn";

/**
 * The cover page exactly as the shop's generated PDF lays it out (backend `shops/documents.py::cover_pdf`):
 * every position and size is in A4 millimetres and scales with the element's width (container query units),
 * so A3 and thumbnails keep the same proportions. Keep the two in sync.
 */
export interface CoverText {
  college: string;
  code: string;
  heading: string;
  sub: string;
  name: string;
  details: string[];
  footer: string;
}

export function coverText(p: {
  title: string; subjectName: string; subjectCode: string; fullName: string; registerNumber: string;
  department: string; year: number | string; college: string; filename: string; orderCode: string;
}): CoverText {
  const title = p.title.trim();
  return {
    college: p.college,
    code: p.subjectCode,
    heading: title || p.subjectName,
    sub: title ? `${p.subjectName} (${p.subjectCode})` : p.subjectCode,
    name: p.fullName,
    details: [`Register No: ${p.registerNumber}`, `${p.department} - Year ${p.year}`],
    footer: `${p.filename}  |  Order ${p.orderCode}`,
  };
}

const INK = "rgb(28 28 38)";
const GREY = "rgb(96 96 110)";
const mm = (v: number) => `${(v / 210) * 100}cqw`;
const pt = (v: number) => mm(v * 0.3528);

function T({
  x, y, w, size, lh, bold, color = INK, align = "left", upper, children, flow,
}: {
  x?: number; y?: number; w: number; size: number; lh: number; bold?: boolean; color?: string;
  align?: "left" | "center"; upper?: boolean; children: ReactNode; flow?: boolean;
}) {
  const style: CSSProperties = {
    position: flow ? "relative" : "absolute",
    left: flow ? undefined : mm(x ?? 0),
    top: flow ? undefined : mm(y ?? 0),
    width: mm(w),
    fontSize: pt(size),
    lineHeight: mm(lh),
    fontWeight: bold ? 700 : 400,
    color,
    textAlign: align,
    textTransform: upper ? "uppercase" : undefined,
    overflowWrap: "anywhere",
  };
  return <div style={style}>{children}</div>;
}

function Block({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: mm(x), top: mm(y), width: mm(w) }}>{children}</div>;
}

export function CoverArt({
  text, template, color, className, footer = true,
}: { text: CoverText; template: CoverTemplate; color: CoverColor; className?: string; footer?: boolean }) {
  const accent = coverHex(color);
  return (
    <div
      className={cn("relative aspect-[210/297] w-full overflow-hidden bg-white", className)}
      style={{ containerType: "inline-size", fontFamily: "Helvetica, Arial, sans-serif" }}
      aria-label={`Cover page, ${template} template`}
      role="img"
    >
      {template === "classic" && (
        <>
          <div style={{ position: "absolute", left: mm(12), top: mm(12), width: mm(186), height: mm(273), border: `${mm(1.6)} solid ${accent}` }} />
          <div style={{ position: "absolute", left: mm(16), top: mm(16), width: mm(178), height: mm(265), border: `${mm(0.4)} solid ${accent}` }} />
          <T x={25} y={34} w={160} size={13} lh={7} bold color={accent} align="center" upper>{text.college}</T>
          <div style={{ position: "absolute", left: mm(80), top: mm(50), width: mm(50), height: mm(0.6), background: accent }} />
          <Block x={25} y={92} w={160}>
            <T flow w={160} size={26} lh={12} bold align="center">{text.heading}</T>
            <div style={{ height: mm(4) }} />
            <T flow w={160} size={15} lh={8} color={GREY} align="center">{text.sub}</T>
          </Block>
          <T x={25} y={172} w={160} size={10} lh={6} color={GREY} align="center">SUBMITTED BY</T>
          <T x={25} y={180} w={160} size={18} lh={10} bold align="center">{text.name}</T>
          {text.details.map((d, i) => (
            <T key={d} x={25} y={193 + i * 8} w={160} size={13} lh={7} color={GREY} align="center">{d}</T>
          ))}
        </>
      )}

      {template === "modern" && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width: mm(58), height: "100%", background: accent }} />
          <T x={8} y={28} w={44} size={22} lh={10} bold color="#fff">{text.code}</T>
          <T x={72} y={30} w={120} size={11} lh={6} bold color={accent} upper>{text.college}</T>
          <Block x={72} y={88} w={120}>
            <T flow w={120} size={28} lh={12} bold>{text.heading}</T>
            <div style={{ height: mm(4) }} />
            <T flow w={120} size={14} lh={7} color={GREY}>{text.sub}</T>
          </Block>
          <div style={{ position: "absolute", left: mm(72), top: mm(186 - 0.6), width: mm(40), height: mm(1.2), background: accent }} />
          <T x={72} y={196} w={120} size={10} lh={6} color={GREY}>SUBMITTED BY</T>
          <T x={72} y={204} w={120} size={17} lh={9} bold>{text.name}</T>
          {text.details.map((d, i) => (
            <T key={d} x={72} y={216 + i * 8} w={120} size={13} lh={7} color={GREY}>{d}</T>
          ))}
        </>
      )}

      {template === "minimal" && (
        <>
          <div style={{ position: "absolute", left: mm(25), top: mm(40), width: mm(30), height: mm(1.6), background: accent }} />
          <T x={25} y={48} w={160} size={11} lh={6} color={GREY}>{text.college}</T>
          <Block x={25} y={104} w={160}>
            <T flow w={160} size={30} lh={13} bold>{text.heading}</T>
            <div style={{ height: mm(4) }} />
            <T flow w={160} size={14} lh={7} color={GREY}>{text.sub}</T>
          </Block>
          <T x={25} y={226} w={160} size={16} lh={8} bold>{text.name}</T>
          {text.details.map((d, i) => (
            <T key={d} x={25} y={236 + i * 7} w={160} size={12} lh={6} color={GREY}>{d}</T>
          ))}
        </>
      )}

      {footer && <T x={15} y={288} w={180} size={8} lh={4} color={GREY} align="center">{text.footer}</T>}
    </div>
  );
}
