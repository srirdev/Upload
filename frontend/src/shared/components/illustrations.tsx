/**
 * Original UpLOAD illustrations (inline SVG, brand palette, no external assets).
 * Decorative: every one is aria-hidden; the surrounding text carries the meaning.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ "aria-hidden": true, focusable: false, ...p }) as P;

/** Stack of documents flying up into a cloud: the upload hero. */
export function UploadHeroArt(p: P) {
  return (
    <svg viewBox="0 0 220 180" fill="none" {...base(p)}>
      <circle cx="150" cy="70" r="62" fill="#fff" fillOpacity=".12" />
      <circle cx="150" cy="70" r="40" fill="#fff" fillOpacity=".12" />
      <g transform="rotate(-10 70 110)">
        <rect x="34" y="62" width="76" height="98" rx="12" fill="#ede4ff" />
        <rect x="46" y="80" width="44" height="6" rx="3" fill="#c4b0f5" />
        <rect x="46" y="94" width="52" height="6" rx="3" fill="#c4b0f5" />
        <rect x="46" y="108" width="36" height="6" rx="3" fill="#c4b0f5" />
      </g>
      <rect x="62" y="48" width="82" height="106" rx="14" fill="#fff" />
      <path d="M118 48h12a14 14 0 0 1 14 14v12h-14a12 12 0 0 1-12-12z" fill="#ffeadb" />
      <rect x="76" y="70" width="40" height="7" rx="3.5" fill="#6d28d9" />
      <rect x="76" y="86" width="54" height="5" rx="2.5" fill="#d9ccf7" />
      <rect x="76" y="98" width="48" height="5" rx="2.5" fill="#d9ccf7" />
      <rect x="76" y="110" width="54" height="5" rx="2.5" fill="#d9ccf7" />
      <rect x="76" y="128" width="26" height="12" rx="6" fill="#ffc83d" />
      <circle cx="160" cy="132" r="24" fill="#f2690d" />
      <path d="M160 143v-20m0 0-8 8m8-8 8 8" stroke="#140f3c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="186" cy="38" r="5" fill="#ffc83d" />
      <circle cx="40" cy="40" r="4" fill="#fff" fillOpacity=".7" />
      <path d="M196 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" fillOpacity=".85" />
    </svg>
  );
}

/** Printer pushing out a printed page. */
export function PrinterArt(p: P) {
  return (
    <svg viewBox="0 0 120 100" fill="none" {...base(p)}>
      <rect x="30" y="8" width="60" height="30" rx="6" fill="#fff" stroke="#e6dff7" strokeWidth="2" />
      <rect x="14" y="32" width="92" height="40" rx="12" fill="#6d28d9" />
      <rect x="22" y="42" width="12" height="6" rx="3" fill="#ffc83d" />
      <circle cx="92" cy="45" r="4" fill="#14b86e" />
      <rect x="30" y="60" width="60" height="34" rx="5" fill="#fff" stroke="#e6dff7" strokeWidth="2" />
      <rect x="38" y="70" width="34" height="4" rx="2" fill="#f2690d" />
      <rect x="38" y="79" width="44" height="4" rx="2" fill="#d9ccf7" />
    </svg>
  );
}

/** Delivery scooter with a parcel. */
export function ScooterArt(p: P) {
  return (
    <svg viewBox="0 0 160 110" fill="none" {...base(p)}>
      <ellipse cx="82" cy="100" rx="64" ry="6" fill="#140f3c" fillOpacity=".08" />
      <rect x="20" y="30" width="40" height="34" rx="8" fill="#ffc83d" />
      <path d="M20 44h40" stroke="#835c00" strokeOpacity=".35" strokeWidth="3" />
      <path d="M40 30v34" stroke="#835c00" strokeOpacity=".35" strokeWidth="3" />
      <path d="M28 70h62l14-30h16" stroke="#6d28d9" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58 70c0-12 10-20 24-20h24l8 20z" fill="#6d28d9" />
      <path d="M118 40l8-14" stroke="#140f3c" strokeWidth="6" strokeLinecap="round" />
      <circle cx="38" cy="84" r="15" fill="#140f3c" />
      <circle cx="38" cy="84" r="6" fill="#f6f3ff" />
      <circle cx="122" cy="84" r="15" fill="#140f3c" />
      <circle cx="122" cy="84" r="6" fill="#f6f3ff" />
      <path d="M6 54h12M2 64h12" stroke="#f2690d" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Campus building with a security cabin (delivery drop point). */
export function CampusArt(p: P) {
  return (
    <svg viewBox="0 0 160 110" fill="none" {...base(p)}>
      <rect x="22" y="40" width="84" height="58" rx="6" fill="#ede4ff" />
      <path d="M16 44 64 14l48 30z" fill="#6d28d9" />
      <circle cx="64" cy="32" r="6" fill="#ffc83d" />
      {[34, 54, 74, 94].map((x) => (
        <rect key={x} x={x - 4} y="52" width="8" height="34" rx="4" fill="#c4b0f5" />
      ))}
      <rect x="116" y="62" width="32" height="36" rx="6" fill="#f2690d" />
      <rect x="123" y="70" width="18" height="12" rx="3" fill="#fff" />
      <rect x="112" y="56" width="40" height="8" rx="4" fill="#140f3c" />
      <rect x="10" y="96" width="144" height="6" rx="3" fill="#140f3c" fillOpacity=".12" />
    </svg>
  );
}

/** Wallet with coins: earnings and settlements. */
export function WalletArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <circle cx="104" cy="26" r="16" fill="#ffc83d" />
      <text x="104" y="32" textAnchor="middle" fontSize="16" fontWeight="800" fill="#835c00">₹</text>
      <circle cx="82" cy="16" r="10" fill="#ffc83d" fillOpacity=".7" />
      <rect x="14" y="36" width="104" height="66" rx="16" fill="#6d28d9" />
      <rect x="14" y="36" width="104" height="18" rx="9" fill="#5719b8" />
      <rect x="84" y="60" width="44" height="26" rx="10" fill="#f2690d" />
      <circle cx="100" cy="73" r="5" fill="#fff" />
    </svg>
  );
}

/** Open box: empty lists. */
export function EmptyBoxArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <ellipse cx="70" cy="100" rx="48" ry="6" fill="#140f3c" fillOpacity=".07" />
      <path d="M26 44 70 30l44 14v42L70 100 26 86z" fill="#ede4ff" />
      <path d="M70 58v42L26 86V44z" fill="#d9ccf7" />
      <path d="M26 44 70 58l44-14" stroke="#c4b0f5" strokeWidth="2" />
      <path d="M26 44 10 30l44-14 16 14z" fill="#f6f3ff" stroke="#d9ccf7" strokeWidth="2" />
      <path d="M114 44l16-14-44-14-16 14z" fill="#f6f3ff" stroke="#d9ccf7" strokeWidth="2" />
      <path d="M96 14l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#ffc83d" />
      <circle cx="40" cy="14" r="3" fill="#f2690d" />
    </svg>
  );
}

/** Magnifier over a page: no search results. */
export function SearchArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <rect x="22" y="14" width="66" height="84" rx="10" fill="#fff" stroke="#e6dff7" strokeWidth="2" />
      <rect x="32" y="28" width="38" height="5" rx="2.5" fill="#d9ccf7" />
      <rect x="32" y="40" width="46" height="5" rx="2.5" fill="#d9ccf7" />
      <rect x="32" y="52" width="30" height="5" rx="2.5" fill="#d9ccf7" />
      <circle cx="88" cy="64" r="22" fill="#ede4ff" stroke="#6d28d9" strokeWidth="6" />
      <path d="M104 80l16 16" stroke="#6d28d9" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

/** Folded map with pins. */
export function MapArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <path d="M14 26 50 14l40 12 36-12v72l-36 12-40-12-36 12z" fill="#ede4ff" />
      <path d="M50 14v72M90 26v72" stroke="#d9ccf7" strokeWidth="2" />
      <path d="M22 70c20-16 36 10 56-8s30-6 40-14" stroke="#c4b0f5" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 8" />
      <path d="M40 56c-8-10-12-16-12-22a12 12 0 0 1 24 0c0 6-4 12-12 22z" fill="#f2690d" />
      <circle cx="40" cy="34" r="4.5" fill="#fff" />
      <path d="M104 42c-8-10-12-16-12-22a12 12 0 0 1 24 0c0 6-4 12-12 22z" fill="#6d28d9" />
      <circle cx="104" cy="20" r="4.5" fill="#fff" />
    </svg>
  );
}

/** Ticket / coupon: offers and referrals. */
export function GiftArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <rect x="26" y="44" width="88" height="56" rx="10" fill="#f2690d" />
      <rect x="18" y="30" width="104" height="22" rx="8" fill="#ff8a2b" />
      <rect x="62" y="30" width="16" height="70" fill="#ffc83d" />
      <path d="M70 30c-6-16-30-20-30-6 0 8 18 8 30 6zm0 0c6-16 30-20 30-6 0 8-18 8-30 6z" fill="#6d28d9" />
      <path d="M118 8l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffc83d" />
    </svg>
  );
}

/** Shield with a check: approvals, security cabin, all-clear. */
export function ShieldArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <path d="M70 8 108 22v28c0 26-16 44-38 54C48 94 32 76 32 50V22z" fill="#6d28d9" />
      <path d="M70 18 98 28v22c0 20-12 34-28 42z" fill="#5719b8" />
      <path d="m54 56 12 12 22-24" stroke="#ffc83d" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Hourglass: waiting for approval. */
export function WaitingArt(p: P) {
  return (
    <svg viewBox="0 0 140 110" fill="none" {...base(p)}>
      <circle cx="70" cy="55" r="46" fill="#ede4ff" />
      <rect x="44" y="18" width="52" height="8" rx="4" fill="#140f3c" />
      <rect x="44" y="84" width="52" height="8" rx="4" fill="#140f3c" />
      <path d="M50 26h40c0 18-14 22-14 29s14 11 14 29H50c0-18 14-22 14-29s-14-11-14-29z" fill="#fff" stroke="#6d28d9" strokeWidth="3" />
      <path d="M58 80h24c-2-8-8-10-12-12-4 2-10 4-12 12z" fill="#ffc83d" />
      <path d="M60 34h20c-2 6-6 8-10 10-4-2-8-4-10-10z" fill="#ffc83d" fillOpacity=".6" />
    </svg>
  );
}

/* ---- Service category art (small, square) ---------------------------------------------------- */

export function BwPrintArt(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="14" y="8" width="36" height="48" rx="6" fill="#fff" />
      <rect x="20" y="18" width="20" height="4" rx="2" fill="#140f3c" />
      <rect x="20" y="27" width="24" height="3" rx="1.5" fill="#6a6488" />
      <rect x="20" y="34" width="22" height="3" rx="1.5" fill="#6a6488" />
      <rect x="20" y="41" width="18" height="3" rx="1.5" fill="#6a6488" />
    </svg>
  );
}

export function ColorPrintArt(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="14" y="8" width="36" height="48" rx="6" fill="#fff" />
      <circle cx="27" cy="26" r="7" fill="#f2690d" fillOpacity=".9" />
      <circle cx="36" cy="26" r="7" fill="#6d28d9" fillOpacity=".85" />
      <circle cx="31.5" cy="34" r="7" fill="#ffc83d" fillOpacity=".9" />
      <rect x="20" y="45" width="24" height="3" rx="1.5" fill="#6a6488" />
    </svg>
  );
}

export function SpiralArt(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="18" y="8" width="34" height="48" rx="5" fill="#fff" />
      {[14, 22, 30, 38, 46].map((y) => (
        <path key={y} d={`M14 ${y}c0-3 8-3 8 0`} stroke="#140f3c" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      ))}
      <rect x="27" y="20" width="18" height="3" rx="1.5" fill="#6d28d9" />
      <rect x="27" y="28" width="16" height="3" rx="1.5" fill="#d9ccf7" />
    </svg>
  );
}

export function BoundBookArt(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="14" y="8" width="38" height="48" rx="5" fill="#140f3c" />
      <rect x="14" y="8" width="8" height="48" rx="3" fill="#6d28d9" />
      <rect x="28" y="20" width="18" height="4" rx="2" fill="#ffc83d" />
      <rect x="28" y="28" width="14" height="3" rx="1.5" fill="#fff" fillOpacity=".6" />
    </svg>
  );
}

export function A3Art(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="8" y="14" width="48" height="36" rx="5" fill="#fff" />
      <text x="32" y="38" textAnchor="middle" fontSize="15" fontWeight="800" fill="#6d28d9">A3</text>
    </svg>
  );
}

export function CoverPageArt(p: P) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...base(p)}>
      <rect x="14" y="8" width="36" height="48" rx="6" fill="#fff" />
      <rect x="14" y="8" width="36" height="16" rx="6" fill="#f2690d" />
      <rect x="20" y="32" width="24" height="4" rx="2" fill="#140f3c" />
      <rect x="20" y="40" width="16" height="3" rx="1.5" fill="#6a6488" />
    </svg>
  );
}
