import { FileUp, UploadCloud } from "lucide-react";
import { motion } from "motion/react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Drag-and-drop (or tap-to-browse) file zone. Purely presentational: the caller validates and uploads.
 * `variant="hero"` is the big gradient version used as a page's primary action.
 */
export function Dropzone({
  onFiles, accept, multiple = true, disabled, title, hint, variant = "default", className,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title: string;
  hint?: string;
  variant?: "default" | "hero";
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  const hero = variant === "hero";
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-4xl border-2 border-dashed px-6 py-10 text-center transition-all",
        hero ? "border-white/40 bg-brand text-white shadow-lift" : "border-primary/30 bg-background hover:border-primary hover:bg-primary-soft/40",
        over && (hero ? "scale-[1.01] border-white" : "border-primary bg-primary-soft/60"),
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={title}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <motion.span
        animate={over ? { y: -6, scale: 1.08 } : { y: 0, scale: 1 }}
        className={cn("flex size-16 items-center justify-center rounded-3xl", hero ? "glass-dark ring-1 ring-white/30" : "bg-primary text-white shadow-glow")}
      >
        {over ? <FileUp className="size-8" aria-hidden /> : <UploadCloud className="size-8" aria-hidden />}
      </motion.span>
      <span className={cn("font-display text-lg font-bold", hero ? "text-white" : "text-navy")}>{title}</span>
      {hint && <span className={cn("max-w-sm text-sm", hero ? "text-white/85" : "text-muted")}>{hint}</span>}
    </label>
  );
}

/** Thin animated progress bar for an in-flight upload (0–1). */
export function UploadProgress({ name, fraction }: { name: string; fraction: number }) {
  const pct = Math.round(fraction * 100);
  return (
    <div className="rounded-2xl bg-background p-3 shadow-soft ring-1 ring-border/60">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-navy">{name}</span>
        <span className="shrink-0 font-semibold text-primary tabular">{pct}%</span>
      </div>
      <div role="progressbar" aria-label={`Uploading ${name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-primary-soft">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-orange" animate={{ width: `${pct}%` }} transition={{ ease: "easeOut" }} />
      </div>
    </div>
  );
}
