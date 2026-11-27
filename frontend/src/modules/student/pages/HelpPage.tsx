import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  BookX, Camera, CheckCircle2, Clock3, FileWarning, ImagePlus, Inbox, PackageX, Send, X, type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useComplaints, useCreateComplaint, useOrders } from "@/modules/student/api";
import { CATEGORY_LABEL, type Complaint, type ComplaintCategory } from "@/modules/student/api/types";
import { ShieldArt } from "@/shared/components/illustrations";
import { StatusPill, type StatusKind } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Select, Textarea } from "@/shared/components/ui/fields";
import { Label } from "@/shared/components/ui/label";
import { FadeIn } from "@/shared/components/ui/motion";
import { EmptyState, ListSkeleton, Spinner } from "@/shared/components/ui/states";
import { toast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";
import { formatBytes, formatDate } from "@/shared/utils/format";

const MAX_PHOTOS = 3;

const CATEGORY_ICON: Record<ComplaintCategory, LucideIcon> = {
  damaged_binding: BookX,
  missing_pages: FileWarning,
  not_on_shelf: PackageX,
  late_delivery: Clock3,
};

function ticketKind(status: string): StatusKind {
  if (status === "resolved") return "done";
  if (status === "rejected") return "cancelled";
  if (status === "in_review") return "progress";
  return "new";
}

export function HelpPage() {
  const [params] = useSearchParams();
  const orders = useOrders();
  const complaints = useComplaints();
  const create = useCreateComplaint();
  const eligible = orders.data?.filter((o) => o.status !== "awaiting_payment") ?? [];

  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [category, setCategory] = useState<ComplaintCategory | "">("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ready = orderId && category && description.trim().length >= 5;

  function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const all = [...photos, ...Array.from(e.target.files ?? [])];
    setPhotos(all.slice(0, MAX_PHOTOS));
    setPhotoNote(all.length > MAX_PHOTOS ? `Only ${MAX_PHOTOS} photos can be attached; extra ones were left out.` : null);
    e.target.value = ""; // allow re-picking the same file after removing it
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    create.mutate(
      { order_id: orderId, category, description, photos },
      {
        onSuccess: () => {
          setSent(true);
          setDescription("");
          setCategory("");
          setPhotos([]);
          setPhotoNote(null);
          toast.success("Report sent. We'll update your ticket here.");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <Card tone="midnight" pad="lg" className="flex items-center gap-4">
          <div className="relative min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sun">Help Corner</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">Something not right?</h1>
            <p className="mt-1 max-w-md text-sm text-white/80">
              Tell us what happened with an order. Confirmed printing or delivery problems are refunded under our policy.
            </p>
          </div>
          <ShieldArt className="relative h-24 shrink-0 md:h-28" />
        </Card>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card pad="lg">
          <SectionHeader title="Report an issue" />
          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="order">Order</Label>
              <Select id="order" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">Select an order</option>
                {eligible.map((o) => <option key={o.id} value={o.id}>{o.code} · {formatDate(o.created_at)}</option>)}
              </Select>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-2" id="issue-type">What went wrong?</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="issue-type">
                {(Object.keys(CATEGORY_LABEL) as ComplaintCategory[]).map((c) => {
                  const Icon = CATEGORY_ICON[c];
                  const on = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCategory(c)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-2xl p-3 text-left text-sm font-semibold ring-1 transition-all",
                        on ? "bg-primary-soft text-primary ring-2 ring-primary" : "bg-background text-ink-2 ring-border hover:ring-primary/40",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      {CATEGORY_LABEL[c]}
                    </button>
                  );
                })}
              </div>
            </div>

            {category && (
              <FadeIn className="space-y-5">
                <div>
                  <Label htmlFor="desc">Describe the issue</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What happened, and which pages or documents were affected?" />
                  <p className="mt-1 text-right text-xs text-muted tabular">{description.length}/2000</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photos">Photos (optional)</Label>
                  <p className="-mt-1 text-xs text-muted">Up to {MAX_PHOTOS} JPG or PNG photos, 5 MB each.</p>
                  {photos.length > 0 && (
                    <ul className="space-y-1.5" aria-label="Selected photos">
                      {photos.map((p, i) => (
                        <li key={`${p.name}-${i}`} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2 text-sm">
                          <Camera className="size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-muted">· {formatBytes(p.size)}</span></span>
                          <button
                            type="button"
                            aria-label={`Remove ${p.name}`}
                            onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setPhotoNote(null); }}
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-danger"
                          >
                            <X className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {photos.length < MAX_PHOTOS && (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary-soft/40 px-4 py-4 text-sm font-semibold text-primary transition-colors hover:border-primary">
                      <ImagePlus className="size-5" aria-hidden /> Add photos
                      <input id="photos" type="file" multiple accept="image/jpeg,image/png" onChange={addPhotos} className="sr-only" />
                    </label>
                  )}
                  {photoNote && <p role="status" className="text-xs text-muted">{photoNote}</p>}
                </div>
              </FadeIn>
            )}

            {create.error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-medium text-danger">{create.error.message}</p>}
            {sent && (
              <p role="status" className="flex items-center gap-2 rounded-2xl bg-mint-soft p-3 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Thanks, we've received your report.
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={!ready || create.isPending}>
              {create.isPending ? <Spinner className="text-white" /> : <><Send className="size-4" aria-hidden /> Submit</>}
            </Button>
          </form>
        </Card>

        <section aria-labelledby="tickets" className="min-w-0">
          <SectionHeader title={<span id="tickets">Your tickets</span>} subtitle="Replies from our team show up here" />
          {complaints.isLoading ? (
            <ListSkeleton rows={2} />
          ) : !complaints.data?.length ? (
            <Card tone="flat">
              <EmptyState compact title="No tickets" hint="Issues you report will be tracked here." />
            </Card>
          ) : (
            <div className="space-y-3">{complaints.data.map((c) => <Ticket key={c.id} c={c} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Ticket({ c }: { c: Complaint }) {
  const Icon = CATEGORY_ICON[c.category] ?? Inbox;
  return (
    <article className="space-y-3 rounded-3xl bg-background p-4 text-sm shadow-soft ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-soft text-orange-ink"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy">{CATEGORY_LABEL[c.category]}</p>
          <p className="text-xs text-muted">{c.order_code} · {formatDate(c.created_at)}</p>
        </div>
        <StatusPill kind={ticketKind(c.status)} className="capitalize">{c.status.replace("_", " ")}</StatusPill>
      </div>
      <p className="text-ink-2">{c.description}</p>
      {c.photo_urls.length > 0 && (
        <div className="flex gap-2">
          {c.photo_urls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <img src={u} alt={`Photo ${i + 1} for ${c.order_code}`} className="size-16 rounded-xl object-cover ring-1 ring-border" />
            </a>
          ))}
        </div>
      )}
      {c.admin_response && (
        <p className="rounded-2xl bg-primary-soft p-3 text-ink-2">
          <span className="mb-0.5 block text-xs font-bold text-primary">UpLOAD team</span>
          {c.admin_response}
        </p>
      )}
      {c.refund_status && <p className="text-xs font-semibold text-success">Refund: {c.refund_status.replace("_", " ")}</p>}
    </article>
  );
}
