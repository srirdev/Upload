import { useState } from "react";
import {
  BookOpen, Check, CheckCircle2, Clock3, FileDown, FileText, GraduationCap, KeyRound, Layers, Lock, Printer,
  RectangleHorizontal, RectangleVertical, RefreshCw, Tag, Truck, Wallet, X,
} from "lucide-react";
import { motion } from "motion/react";
import { openDocument, openPdf, useOrderAction } from "@/modules/shop/api";
import type { ShopDoc, ShopOrder, Tab } from "@/modules/shop/api/types";
import {
  BINDING_LABEL, COVER_COLORS, COVER_TEMPLATE_LABEL, coverColorLabel, ORDER_STEPS, ORIENTATION_LABEL, ruleText, STAGE,
  stageLabel, stageOf, totalPages,
} from "@/modules/shop/components/orderMeta";
import { Badge, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { CameraCapture } from "@/shared/components/ui/camera";
import { Modal } from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/fields";
import { CodeDisplay } from "@/shared/components/ui/otp";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { useNow } from "@/shared/hooks/useNow";
import { cn } from "@/shared/utils/cn";
import { countdown, formatDateTime, rupees } from "@/shared/utils/format";

/** Files unlock once the shop has accepted (server: FILES_VISIBLE). */
const filesLocked = (o: ShopOrder) => o.status === "placed" || o.status === "accepted";

/**
 * One order, end to end: specs, documents, progress and exactly the action the server says is next.
 * `tab` is accepted for callers' convenience; behaviour is driven by the order itself.
 */
export function ShopOrderCard({ order }: { order: ShopOrder; tab?: Tab }) {
  const stage = stageOf(order);
  const meta = STAGE[stage];
  const pages = totalPages(order);
  const now = useNow(30_000);
  const left = order.delivery_at ? countdown(order.delivery_at, now) : null;
  const urgent = !!order.delivery_at && new Date(order.delivery_at).getTime() - now < 2 * 3600_000;
  const active = stage !== "delivering" && stage !== "done";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col overflow-hidden rounded-3xl bg-background shadow-soft ring-1 ring-border/60"
      aria-label={`Order ${order.code}`}
    >
      <div className={cn("h-1.5", meta.stripe)} aria-hidden />
      <div className="space-y-4 p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-extrabold tracking-tight text-navy">{order.code}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <GraduationCap className="size-4 shrink-0" aria-hidden /> <span className="truncate">{order.college_name}</span>
            </p>
          </div>
          <StatusPill kind={meta.kind} live={stage === "new"}>{stageLabel(order)}</StatusPill>
        </header>

        <div className="flex flex-wrap gap-2">
          {order.delivery_at && (
            <Badge tone={active && urgent ? (left ? "sun" : "danger") : "neutral"} icon={Clock3}>
              Deliver by {formatDateTime(order.delivery_at)}
              {active && <span className="font-bold">{left ? ` · in ${left}` : " · slot time passed"}</span>}
            </Badge>
          )}
          {order.entitlement && (
            <Badge tone="mint" icon={Wallet}>
              You earn <b className="font-bold">{rupees(order.entitlement)}</b>
            </Badge>
          )}
        </div>

        <ProgressSteps steps={ORDER_STEPS} current={meta.step} orientation="horizontal" className="pt-1" />

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Spec icon={FileText} label="Pages to print" value={pages === null ? "—" : String(pages)} />
          <Spec icon={Layers} label="Documents" value={String(order.documents.length)} />
          <Spec icon={BookOpen} label="Binding" value={BINDING_LABEL[order.binding] ?? order.binding} />
          <Spec icon={Tag} label="Cover page" value={order.cover_page ? "Yes" : "No"} />
        </dl>

        <ul className="space-y-2.5" aria-label="Documents">
          {order.documents.map((d) => <DocRow key={d.id} order={order} doc={d} />)}
        </ul>

        {order.cover_page && <CoverSpec order={order} />}
      </div>

      <OrderActions order={order} />
    </motion.article>
  );
}

/** The student's cover design: template, colour swatch, title and subject (only fields that are present). */
function CoverSpec({ order }: { order: ShopOrder }) {
  const color = order.cover_color ? COVER_COLORS[order.cover_color] : undefined;
  const swatch = color?.hex ?? "#140f3c";
  const subject = [order.subject_name, order.subject_code && `(${order.subject_code})`].filter(Boolean).join(" ");
  return (
    <section aria-label="Cover page" className="flex gap-4 rounded-2xl bg-sun-soft p-3.5">
      <div
        aria-hidden
        className="relative flex h-20 w-15 shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow-soft ring-1 ring-border"
      >
        <span
          className={cn(
            "block w-full",
            order.cover_template === "minimal" ? "h-1.5" : order.cover_template === "modern" ? "h-full w-3" : "h-7",
          )}
          style={{ background: swatch }}
        />
        <span className={cn("absolute space-y-1", order.cover_template === "modern" ? "left-5 right-2 top-4" : "inset-x-2 top-9")}>
          <span className="block h-1 rounded-full" style={{ background: swatch, opacity: 0.8 }} />
          <span className="block h-1 w-2/3 rounded-full bg-[#d9ccf7]" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-sun-ink">Cover page</p>
        {order.cover_title && <p className="mt-0.5 truncate font-display text-base font-bold text-navy">{order.cover_title}</p>}
        {subject && <p className="text-sm text-ink-2">Subject: <b className="text-navy">{subject}</b></p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {order.cover_template && (
            <Badge tone="neutral" className="bg-background">{COVER_TEMPLATE_LABEL[order.cover_template] ?? order.cover_template} template</Badge>
          )}
          {order.cover_color && (
            <Badge tone="neutral" className="bg-background">
              <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: swatch }} aria-hidden />
              {coverColorLabel(order.cover_color)}
            </Badge>
          )}
        </div>
      </div>
    </section>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 font-display text-base font-bold capitalize text-navy">{value}</dd>
    </div>
  );
}

/** Document with a mini page preview (size + colour mix), its print rules and file buttons. */
function DocRow({ order, doc }: { order: ShopOrder; doc: ShopDoc }) {
  const locked = filesLocked(order);
  const hasColour = doc.rules.some((r) => r.color === "color");
  const allColour = doc.rules.every((r) => r.color === "color");
  const open = (p: Promise<unknown>) => p.catch(toastError);
  return (
    <li className="flex gap-3 rounded-2xl p-3 ring-1 ring-border">
      <div
        aria-hidden
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-lg bg-white pb-1 shadow-soft ring-1 ring-border",
          doc.paper_size === "A3" ? "h-16 w-12" : "h-14 w-10",
        )}
      >
        <span className="absolute inset-x-1.5 top-2 space-y-1">
          <span className="block h-1 rounded-full bg-[#d9ccf7]" />
          <span className="block h-1 w-3/4 rounded-full bg-[#d9ccf7]" />
        </span>
        <span
          className={cn(
            "absolute inset-x-1.5 top-6 h-3 rounded",
            allColour ? "bg-gradient-to-r from-primary via-orange to-sun" : hasColour ? "bg-gradient-to-r from-navy/70 to-orange" : "bg-navy/60",
          )}
        />
        <span className="relative text-[9px] font-bold text-navy">{doc.paper_size}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="min-w-0 truncate font-semibold text-navy">{doc.filename}</p>
          <p className="shrink-0 text-xs font-medium text-muted tabular">
            {doc.page_count ?? "?"} pp × {doc.copies} · {doc.paper_size}
          </p>
        </div>
        {doc.orientation && ORIENTATION_LABEL[doc.orientation] && (
          <Badge tone="violet" icon={doc.orientation === "landscape" ? RectangleHorizontal : RectangleVertical} className="mt-1.5">
            {ORIENTATION_LABEL[doc.orientation]}
          </Badge>
        )}
        <ul className="mt-1.5 space-y-1 text-xs text-ink-2">
          {doc.rules.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className={cn("size-2 shrink-0 rounded-full", r.color === "color" ? "bg-orange" : "bg-navy")} aria-hidden />
              {ruleText(r)}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {locked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lock className="size-3.5" aria-hidden /> Files unlock once you accept
            </span>
          ) : (
            <>
              <Button size="sm" variant="soft" onClick={() => open(openDocument(order.id, doc.id))}>
                <FileDown className="size-4" /> Download file
              </Button>
              {order.cover_page && (
                <Button size="sm" variant="outline" onClick={() => open(openPdf(`/shops/me/orders/${order.id}/cover.pdf?document_id=${doc.id}`))}>
                  <FileDown className="size-4" /> Cover page
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function OrderActions({ order }: { order: ShopOrder }) {
  const { advance, reject, otp, direct, photo, complete } = useOrderAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [confirmDirect, setConfirmDirect] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const label = () => openPdf(`/shops/me/orders/${order.id}/label.pdf`).catch(toastError);

  const step = (action: "accept" | "printing-done" | "packing-done", done: string, description?: string) =>
    advance.mutate({ id: order.id, action }, { onSuccess: () => toast.success(done, { description }), onError: toastError });

  const footer = "border-t border-border bg-surface/60 px-5 py-4";

  switch (order.next_action) {
    case "accept":
      return (
        <div className={footer}>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={advance.isPending}
              onClick={() => step("accept", `Order ${order.code} accepted`, "Files are unlocked. Time to print.")}>
              {advance.isPending ? <Spinner className="text-white" /> : <><Check className="size-4" /> Accept order</>}
            </Button>
            <Button variant="danger-soft" onClick={() => setRejecting(true)}><X className="size-4" /> Reject</Button>
          </div>
          <Modal
            open={rejecting}
            onOpenChange={(o) => { setRejecting(o); if (!o) reject.reset(); }}
            title={`Reject ${order.code}?`}
            description="The order goes back to UpLOAD to be reassigned. Tell the admin team why."
            footer={
              <>
                <Button variant="outline" onClick={() => setRejecting(false)}>Back</Button>
                <Button variant="danger" disabled={reason.trim().length < 3 || reject.isPending}
                  onClick={() => reject.mutate({ id: order.id, reason: reason.trim() }, {
                    onSuccess: () => { setRejecting(false); toast(`Order ${order.code} rejected`); },
                    onError: toastError,
                  })}>
                  {reject.isPending ? <Spinner className="text-white" /> : "Reject order"}
                </Button>
              </>
            }
          >
            <Textarea aria-label="Reason for rejecting" placeholder="e.g. Colour printer is under repair" value={reason}
              onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
            <p className="mt-1.5 text-xs text-muted">At least 3 characters · shown to the admin team</p>
          </Modal>
        </div>
      );

    case "printing_done":
      return (
        <div className={cn(footer, "flex flex-wrap items-center justify-between gap-3")}>
          <p className="flex items-center gap-2 text-sm text-ink-2"><Printer className="size-4 text-orange-ink" aria-hidden /> Print every document as specified.</p>
          <Button variant="accent" disabled={advance.isPending} onClick={() => step("printing-done", "Printing done", "Next: bind and pack the order.")}>
            {advance.isPending ? <Spinner /> : "Mark printing done"}
          </Button>
        </div>
      );

    case "packing_done":
      return (
        <div className={cn(footer, "flex flex-wrap items-center justify-between gap-3")}>
          <Button size="sm" variant="outline" onClick={label}><Tag className="size-4" /> Packet label</Button>
          <Button variant="accent" disabled={advance.isPending} onClick={() => step("packing-done", "Packed and ready", "Generate the handover code when the rider arrives.")}>
            {advance.isPending ? <Spinner /> : "Mark binding and packing done"}
          </Button>
        </div>
      );

    case "handover_otp":
      return (
        <div className={cn(footer, "space-y-4")}>
          <div className="rounded-3xl bg-midnight p-5 text-white">
            <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-sun" aria-hidden /> Handover code</p>
            {code ? (
              <div className="mt-4 space-y-3" aria-live="polite">
                <CodeDisplay code={code} label="Handover code" />
                <p className="text-center text-xs text-white/75">Read this to the delivery partner at pickup. A new code replaces this one.</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/75">
                {order.otp_generated ? "A code already exists. Generate a new one to see it again." : "Generate a code when the delivery partner arrives to collect the packet."}
              </p>
            )}
            <Button variant={code ? "glass" : "white"} className="mt-4 w-full" disabled={otp.isPending}
              onClick={() => otp.mutate(order.id, { onSuccess: (r) => { setCode(r.code); toast.success("Handover code ready"); }, onError: toastError })}>
              {otp.isPending ? <Spinner /> : code || order.otp_generated ? <><RefreshCw className="size-4" /> Generate a new OTP</> : "Generate handover OTP"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={label}><Tag className="size-4" /> Packet label</Button>
            {order.can_direct_delivery && (
              <Button size="sm" variant="ghost" className="text-primary" onClick={() => setConfirmDirect(true)}>
                <Truck className="size-4" /> Deliver myself to the cabin
              </Button>
            )}
          </div>
          <Modal
            open={confirmDirect}
            onOpenChange={setConfirmDirect}
            title="Deliver it yourself?"
            description="You'll take this packet to the college security cabin. A delivery partner will not collect it."
            footer={
              <>
                <Button variant="outline" onClick={() => setConfirmDirect(false)}>Cancel</Button>
                <Button disabled={direct.isPending} onClick={() => direct.mutate(order.id, {
                  onSuccess: () => { setConfirmDirect(false); toast.success("You're delivering this order", { description: "Find it under Finished to complete the drop." }); },
                  onError: toastError,
                })}>
                  {direct.isPending ? <Spinner className="text-white" /> : "Yes, deliver myself"}
                </Button>
              </>
            }
          >
            <p className="text-sm text-ink-2">At the cabin you'll photograph the packet on the shelf to complete the delivery.</p>
          </Modal>
        </div>
      );

    case "complete_delivery":
      if (!order.direct_batch_id) return null;
      return (
        <div className={cn(footer, "space-y-3")}>
          <p className="text-sm font-semibold text-navy">Place the packet on the cabin shelf, then photograph it.</p>
          <CameraCapture
            label={photoCount ? "Add another shelf photo" : "Take shelf photo"}
            hint="The photo is the student's proof of delivery."
            busy={photo.isPending}
            confirmLabel="Upload photo"
            onConfirm={(file) => photo.mutate({ batchId: order.direct_batch_id!, file }, {
              onSuccess: () => { setPhotoCount((n) => n + 1); toast.success("Shelf photo uploaded"); },
              onError: toastError,
            })}
          />
          {photoCount > 0 && <p aria-live="polite" className="text-xs font-medium text-success">{photoCount} photo{photoCount > 1 ? "s" : ""} uploaded</p>}
          <Button className="w-full" variant="success" disabled={photoCount < 1 || complete.isPending}
            onClick={() => complete.mutate(order.direct_batch_id!, { onSuccess: () => toast.success("Delivery completed"), onError: toastError })}>
            {complete.isPending ? <Spinner /> : "Complete delivery"}
          </Button>
        </div>
      );

    default: {
      const finished = stageOf(order) === "delivering" || stageOf(order) === "done";
      return (
        <div className={cn(footer, "flex items-center gap-2 text-sm font-semibold", finished ? "text-success" : "text-muted")}>
          {finished ? <CheckCircle2 className="size-4" aria-hidden /> : <Clock3 className="size-4" aria-hidden />} {stageLabel(order)}
        </div>
      );
    }
  }
}
