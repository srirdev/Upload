import { Camera, ImagePlus, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";

/**
 * Photo capture. On phones `capture="environment"` opens the rear camera directly; on desktop it falls back
 * to a file picker. Shows a preview before the caller uploads it via `onConfirm`.
 */
export function CameraCapture({
  label, hint, onConfirm, busy, confirmLabel = "Use this photo",
}: { label: string; hint?: string; onConfirm: (file: File) => void; busy?: boolean; confirmLabel?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div className="space-y-3">
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={label}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {url ? (
        <div className="overflow-hidden rounded-3xl bg-navy ring-1 ring-border">
          <img src={url} alt="Photo preview" className="max-h-72 w-full object-contain" />
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/30 bg-primary-soft/50 px-6 py-10 text-center",
            "transition-colors hover:border-primary hover:bg-primary-soft",
          )}
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-white shadow-glow">
            <Camera className="size-7" aria-hidden />
          </span>
          <span className="font-display text-base font-bold text-navy">{label}</span>
          {hint && <span className="max-w-xs text-sm text-muted">{hint}</span>}
        </label>
      )}
      {file && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => { setFile(null); if (input.current) input.current.value = ""; input.current?.click(); }}>
            <RotateCcw className="size-4" /> Retake
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={() => onConfirm(file)}>
            <ImagePlus className="size-4" /> {busy ? "Uploading…" : confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
