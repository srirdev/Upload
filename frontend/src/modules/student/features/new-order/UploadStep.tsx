import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Eye, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { deleteDocument, openDocument, queryKeys, uploadDocumentWithProgress } from "@/modules/student/api";
import type { OrderDetail } from "@/modules/student/api/types";
import { DocumentCard } from "@/modules/student/components/DocumentCard";
import { StickyAction } from "@/modules/student/features/new-order/StickyAction";
import { Button } from "@/shared/components/ui/button";
import { Dropzone, UploadProgress } from "@/shared/components/ui/upload";
import { toast, toastError } from "@/shared/components/ui/toast";

const ACCEPT = ".pdf,.docx,.pptx,.jpg,.jpeg,.png";
const EXT = new Set(ACCEPT.split(",").map((e) => e.slice(1)));
const MAX_MB = 25; // UX hint only; the server enforces the real, admin-configured limit

interface Upload {
  key: string;
  name: string;
  fraction: number;
}

export function UploadStep({ order, onNext }: { order: OrderDetail; onNext: () => void }) {
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.order(order.id) });

  async function addFiles(files: File[]) {
    setErrors([]);
    const valid: { file: File; key: string }[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXT.has(ext)) setErrors((e) => [...e, `${file.name}: unsupported type. Use PDF, DOCX, PPTX, JPG or PNG.`]);
      else if (file.size > MAX_MB * 1024 * 1024) setErrors((e) => [...e, `${file.name}: larger than ${MAX_MB} MB.`]);
      else valid.push({ file, key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}` });
    }
    // Queue every valid file at 0% so the student sees the whole batch, then upload one at a time.
    setUploads((u) => [...u, ...valid.map(({ file, key }) => ({ key, name: file.name, fraction: 0 }))]);
    for (const { file, key } of valid) {
      try {
        await uploadDocumentWithProgress(order.id, file, (fraction) =>
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, fraction } : x))),
        );
        await refresh();
      } catch (e) {
        setErrors((errs) => [...errs, `${file.name}: ${(e as Error).message}`]);
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
  }

  async function remove(docId: string, name: string) {
    setRemoving(docId);
    try {
      await deleteDocument(order.id, docId);
      await refresh();
      toast.success(`Removed ${name}`);
    } catch (e) {
      toastError(e);
    } finally {
      setRemoving(null);
    }
  }

  const preview = (docId: string) => openDocument(order.id, docId).catch(toastError);

  const docs = order.documents;
  const empty = docs.length === 0 && uploads.length === 0;
  const pages = docs.reduce((a, d) => a + (d.page_count ?? 0), 0);

  return (
    <div className="space-y-5">
      <Dropzone
        variant={empty ? "hero" : "default"}
        onFiles={addFiles}
        accept={ACCEPT}
        title={empty ? "Drop your files here or tap to browse" : "Add more documents"}
        hint={`PDF, DOCX, PPTX, JPG or PNG · up to ${MAX_MB} MB each`}
        className={empty ? "py-14" : "py-6"}
      />

      {errors.length > 0 && (
        <div className="space-y-1.5 rounded-2xl bg-danger-soft p-3">
          {errors.map((e) => (
            <p key={e} role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
            </p>
          ))}
        </div>
      )}

      {(docs.length > 0 || uploads.length > 0) && (
        <section aria-label="Your documents" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold text-navy">Your documents</h2>
            {docs.length > 0 && (
              <p className="text-sm text-muted">
                {docs.length} file{docs.length > 1 ? "s" : ""}
                {pages > 0 && ` · ${pages} pages`}
              </p>
            )}
          </div>
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {docs.map((d) => {
                const previewable = d.content_type === "application/pdf" || d.content_type.startsWith("image/");
                return (
                  <motion.li key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}>
                    <DocumentCard
                      orderId={order.id}
                      doc={d}
                      actions={
                        <>
                          {previewable && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Preview ${d.filename}`} onClick={() => preview(d.id)}>
                              <Eye className="size-5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-danger hover:bg-danger-soft"
                            aria-label={`Remove ${d.filename}`}
                            disabled={removing === d.id}
                            onClick={() => remove(d.id, d.filename)}
                          >
                            <Trash2 className="size-5" />
                          </Button>
                        </>
                      }
                    />
                  </motion.li>
                );
              })}
              {uploads.map((u) => (
                <motion.li key={u.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <UploadProgress name={u.name} fraction={u.fraction} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <StickyAction>
        <Button size="lg" className="w-full" disabled={docs.length === 0 || uploads.length > 0} onClick={onNext}>
          Continue <ArrowRight className="size-5" aria-hidden />
        </Button>
      </StickyAction>
    </div>
  );
}
