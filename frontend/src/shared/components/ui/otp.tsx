import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/shared/utils/cn";

/**
 * One box per digit; typing advances, backspace goes back, paste fills all boxes.
 * Value is a plain string of digits; the whole group is labelled for screen readers.
 */
export function OtpInput({
  value, onChange, length = 4, label, disabled, invalid, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!d) return;
    e.preventDefault();
    onChange(d);
    refs.current[Math.min(d.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          aria-label={`${label} digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          value={d}
          aria-invalid={invalid || undefined}
          onPaste={onPaste}
          onKeyDown={(e) => onKey(i, e)}
          onChange={(e) => {
            const c = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, c);
            if (c && i < length - 1) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "size-14 rounded-2xl border-2 bg-background text-center font-display text-2xl font-bold text-navy tabular transition-colors",
            "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-50",
            d ? "border-primary/50" : "border-border",
            invalid && "border-danger",
          )}
        />
      ))}
    </div>
  );
}

/** Big, readable code display (e.g. the shop's handover code for the rider). */
export function CodeDisplay({ code, label }: { code: string; label: string }) {
  return (
    <div aria-label={`${label}: ${code.split("").join(" ")}`} className="flex justify-center gap-2">
      {code.split("").map((c, i) => (
        <span key={i} aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-navy font-display text-3xl font-extrabold text-white tabular shadow-lift">
          {c}
        </span>
      ))}
    </div>
  );
}
