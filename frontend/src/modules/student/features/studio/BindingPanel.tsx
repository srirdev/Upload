import { Check } from "lucide-react";
import type { Binding, CoverColor } from "@/modules/student/api/types";
import { BINDINGS, coverHex } from "@/modules/student/features/studio/config";
import { cn } from "@/shared/utils/cn";

/** Binding choice as illustrated cards; the preview and 3D model switch the moment one is picked. */
export function BindingPanel({ value, onChange, color, prices }: {
  value: Binding;
  onChange: (b: Binding) => void;
  color: CoverColor;
  /** Optional per-binding price labels from the live quote. */
  prices?: Partial<Record<Binding, string>>;
}) {
  return (
    <div role="radiogroup" aria-label="Binding" className="grid grid-cols-2 gap-3">
      {BINDINGS.map((b) => {
        const on = b.value === value;
        return (
          <button key={b.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(b.value)}
            className={cn(
              "group relative flex flex-col items-start gap-2 overflow-hidden rounded-3xl p-3 text-left ring-1 transition-all",
              b.value === "none" && "col-span-2 flex-row items-center",
              on ? "bg-primary-soft ring-2 ring-primary" : "bg-background ring-border hover:-translate-y-0.5 hover:shadow-soft hover:ring-primary/40",
            )}>
            <span className={cn("flex items-center justify-center rounded-2xl bg-surface", b.value === "none" ? "h-16 w-20" : "h-20 w-full")}>
              <BindingArt kind={b.value} color={coverHex(color)} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-navy">{b.label}</span>
              <span className="block text-[11px] leading-tight text-muted">{b.hint}</span>
              {prices?.[b.value] && <span className="mt-1 block text-xs font-semibold text-primary">{prices[b.value]}</span>}
            </span>
            {on && (
              <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-white">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Small drawings of each binding (decorative). */
export function BindingArt({ kind, color }: { kind: Binding; color: string }) {
  const common = { viewBox: "0 0 80 60", className: "h-14 w-auto", "aria-hidden": true } as const;
  if (kind === "none") {
    return (
      <svg {...common}>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={20 + i * 4} y={10 - i * 3} width="36" height="44" rx="2" fill="#fff" stroke="#d9ccf7" strokeWidth="1.5" transform={`rotate(${(i - 1) * 4} 40 30)`} />
        ))}
        <rect x="32" y="18" width="18" height="3" rx="1.5" fill="#c4b0f5" />
        <rect x="32" y="25" width="22" height="2.5" rx="1.25" fill="#e6dff7" />
      </svg>
    );
  }
  if (kind === "spiral") {
    return (
      <svg {...common}>
        <rect x="24" y="6" width="38" height="48" rx="2" fill="#fff" stroke="#d9ccf7" strokeWidth="1.5" />
        <rect x="24" y="6" width="38" height="48" rx="2" fill="url(#clear)" opacity=".4" />
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M20 ${10 + i * 5.6}c0-3 8-3 8 0`} stroke="#6f7280" strokeWidth="2" fill="none" strokeLinecap="round" />
        ))}
        <defs><linearGradient id="clear" x1="0" x2="1"><stop offset="0" stopColor="#e6f0ff" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
      </svg>
    );
  }
  if (kind === "soft") {
    return (
      <svg {...common}>
        <path d="M22 8h38a2 2 0 0 1 2 2v44H24a4 4 0 0 1-4-4V10a2 2 0 0 1 2-2z" fill="#fbfaf7" stroke="#d9ccf7" strokeWidth="1.5" />
        <rect x="20" y="8" width="5" height="46" fill="#ece8f5" />
        <rect x="30" y="20" width="12" height="2" rx="1" fill={color} />
        <rect x="30" y="25" width="24" height="3.5" rx="1.75" fill="#3b3560" />
      </svg>
    );
  }
  const board = kind === "hard";
  return (
    <svg {...common}>
      <rect x="18" y="5" width="46" height="50" rx={board ? 3 : 2} fill={color} />
      {kind === "calico" && (
        <g opacity=".18" stroke="#fff" strokeWidth=".6">
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M18 ${7 + i * 4}h46`} />)}
        </g>
      )}
      <rect x="18" y="5" width={board ? 7 : 6} height="50" fill="#000" opacity=".22" />
      <rect x="64" y="8" width="3" height="44" fill="#f4f1ea" />
      <rect x="32" y="18" width="24" height="3.5" rx="1.75" fill="#e7c46a" />
      <rect x="35" y="25" width="18" height="2.5" rx="1.25" fill="#e7c46a" opacity=".8" />
      <rect x="36" y="42" width="16" height="2" rx="1" fill="#e7c46a" opacity=".7" />
    </svg>
  );
}
