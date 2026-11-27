import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/states";
import { UploadProgress } from "@/shared/components/ui/upload";
import { cn } from "@/shared/utils/cn";

/** Document capture/upload tile (camera on phones, file picker elsewhere) with real upload progress. */
export function KycUpload({ label, hint, done, pending, progress, onFile }: {
  label: string;
  hint: string;
  done: boolean;
  pending: boolean;
  /** 0–1 while uploading. */
  progress?: number;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  return (
    <div className={cn("rounded-3xl p-4 ring-1 transition-colors", done ? "bg-mint-soft ring-mint/40" : "bg-background ring-border")}>
      <div className="flex items-center gap-3">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", done ? "bg-mint text-navy" : "bg-primary-soft text-primary")}>
          {done ? <CheckCircle2 className="size-6" aria-hidden /> : <FileText className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-navy">{label}</p>
          <p className="text-xs text-muted">{done ? "Uploaded" : hint}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          capture="environment"
          hidden
          aria-label={`Upload ${label}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setName(f.name);
              onFile(f);
            }
            e.target.value = "";
          }}
        />
        <Button size="sm" variant={done ? "outline" : "default"} disabled={pending} onClick={() => input.current?.click()}>
          {pending ? <Spinner className="text-primary" /> : done ? <><RefreshCw className="size-4" aria-hidden /> Replace</> : <><Camera className="size-4" aria-hidden /> Upload</>}
        </Button>
      </div>
      {pending && progress !== undefined && <div className="mt-3"><UploadProgress name={name ?? label} fraction={progress} /></div>}
    </div>
  );
}
