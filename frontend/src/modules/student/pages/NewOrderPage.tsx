import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useOrder } from "@/modules/student/api";
import { PaymentStep } from "@/modules/student/features/new-order/PaymentStep";
import { UploadStep } from "@/modules/student/features/new-order/UploadStep";
import { ReviewStep } from "@/modules/student/features/studio/ReviewStep";
import { StudioStep, type StudioTab } from "@/modules/student/features/studio/StudioStep";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { ErrorState, PageLoader } from "@/shared/components/ui/states";
import { cn } from "@/shared/utils/cn";

const STEPS = ["Upload", "Print studio", "Review", "Slot and payment"];
const TABS: StudioTab[] = ["print", "binding", "cover"];

/** Order wizard. Step 2 is the Print Preview Studio (print, binding and cover with a live preview). */
export function NewOrderPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const order = useOrder(orderId);
  const [dirty, setDirty] = useState(false);
  const [leaveTo, setLeaveTo] = useState<(() => void) | null>(null);

  if (order.isLoading) return <PageLoader />;
  if (order.isError) return <ErrorState message={order.error.message} onRetry={() => order.refetch()} />;
  const o = order.data!;
  if (o.status !== "draft" && o.status !== "awaiting_payment") return <Navigate to={`/student/orders/${o.id}`} replace />;

  const step = Math.min(Math.max(Number(params.get("step")) || 1, 1), 4);
  const tabParam = params.get("tab") as StudioTab | null;
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : "print";
  const go = (n: number, t?: StudioTab) => setParams(t ? { step: String(n), tab: t } : { step: String(n) }, { replace: true });
  // Never lose unsaved studio settings silently.
  const guarded = (action: () => void) => (step === 2 && dirty ? setLeaveTo(() => action) : action());
  const back = () => guarded(() => (step === 1 ? navigate("/student") : go(step - 1)));
  const canReach = (n: number) => n <= step || (n === 2 && o.documents.length > 0);

  return (
    <div className="space-y-6">
      <header className={cn("space-y-4", step !== 2 && step !== 3 && "mx-auto max-w-3xl")}>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Back" onClick={back}><ArrowLeft className="size-5" /></Button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Step {step} of 4 · Order {o.code}</p>
            <h1 className="font-display text-xl font-extrabold text-navy md:text-2xl">{STEPS[step - 1]}</h1>
          </div>
        </div>
        <ol className="flex gap-2" aria-label="Order steps">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            return (
              <li key={label} className="flex-1">
                <button type="button" disabled={!canReach(n) || n === step} onClick={() => guarded(() => go(n))}
                  aria-current={n === step ? "step" : undefined}
                  className="group w-full text-left disabled:cursor-default">
                  <span className={cn("block h-1.5 rounded-full transition-colors", n <= step ? "bg-gradient-to-r from-primary to-[#8b3df0]" : "bg-border")} />
                  <span className={cn("mt-1.5 hidden items-center gap-1 text-xs font-semibold sm:flex", n === step ? "text-primary" : done ? "text-navy" : "text-muted")}>
                    {done && <Check className="size-3.5" aria-hidden />} {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      {step === 1 && <div className="mx-auto max-w-3xl"><UploadStep order={o} onNext={() => go(2)} /></div>}
      {step === 2 && <StudioStep key={tab} order={o} initialTab={tab} onDirtyChange={setDirty} onNext={() => { setDirty(false); go(3); }} />}
      {step === 3 && <ReviewStep order={o} onEdit={(t) => go(2, t)} onNext={() => go(4)} />}
      {step === 4 && <div className="mx-auto max-w-3xl"><PaymentStep order={o} /></div>}

      <Modal
        open={leaveTo !== null}
        onOpenChange={(v) => !v && setLeaveTo(null)}
        title="Discard unsaved print settings?"
        description="Your changes in the studio haven't been saved to the order yet."
        footer={
          <>
            <Button variant="outline" onClick={() => setLeaveTo(null)}>Keep editing</Button>
            <Button variant="danger" onClick={() => { const a = leaveTo; setLeaveTo(null); setDirty(false); a?.(); }}>Discard changes</Button>
          </>
        }
      >
        <p className="text-sm text-muted">Choose “Save and continue” in the studio to keep them.</p>
      </Modal>
    </div>
  );
}
