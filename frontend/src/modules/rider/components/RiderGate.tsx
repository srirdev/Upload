import { useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Outlet } from "react-router-dom";
import { signOut } from "@/app/layouts/shells";
import { useRider, useUploadKyc } from "@/modules/rider/api";
import { KycUpload } from "@/modules/rider/components/KycUpload";
import { RiderSplit, RiderSteps } from "@/modules/rider/components/RiderSplit";
import { RiderOnboardingPage } from "@/modules/rider/pages/RiderOnboardingPage";
import { WaitingArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { FloatingPortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { ErrorState, PageLoader } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";

/** Registration -> documents -> KYC review -> portal. Only approved riders reach the Outlet. */
export function RiderGate() {
  const rider = useRider();
  const upload = useUploadKyc();
  const [progress, setProgress] = useState(0);
  if (rider.isLoading) return <PageLoader />;
  if (rider.isError) return <ErrorState message={rider.error.message} onRetry={() => rider.refetch()} />;
  const r = rider.data;
  if (!r) return <><RiderOnboardingPage /><FloatingPortalSwitcher /></>;
  if (r.kyc_status === "approved") return <Outlet />;

  const needsDocs = !r.has_dl || !r.has_rc;
  const rejected = r.kyc_status === "rejected";
  const pendingKind = upload.isPending ? upload.variables?.kind : null;
  const send = (kind: "dl" | "rc", file: File) => {
    setProgress(0);
    upload.mutate(
      { kind, file, onProgress: setProgress },
      { onSuccess: () => toast.success(kind === "dl" ? "Driving licence uploaded" : "Vehicle RC uploaded"), onError: toastError },
    );
  };

  return (
    <>
    <FloatingPortalSwitcher />
    <RiderSplit
      headline={needsDocs ? "Almost there. Add your documents." : rejected ? "Your KYC needs attention" : "We're checking your documents"}
      sub="We verify every partner's licence and vehicle RC before they can take deliveries."
    >
      <RiderSteps current={needsDocs || rejected ? 1 : 2} />
      <div className="mt-6 space-y-5">
        {!needsDocs && !rejected ? (
          <div className="flex flex-col items-center text-center">
            <WaitingArt className="h-28" />
            <h2 className="mt-2 font-display text-2xl font-extrabold text-navy">KYC under review</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">We're verifying your documents. This page updates automatically once you're approved.</p>
          </div>
        ) : (
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-navy">
              {rejected && <ShieldAlert className="size-6 text-danger" aria-hidden />}
              {needsDocs ? "Upload your documents" : "KYC needs attention"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {needsDocs ? "We verify your licence and RC before you can take deliveries." : r.kyc_note ?? "Please re-upload clear photos of your documents."}
            </p>
          </div>
        )}
        <div className="space-y-3">
          <KycUpload label="Driving licence" hint="Front side, all text readable" done={r.has_dl} pending={pendingKind === "dl"} progress={progress} onFile={(f) => send("dl", f)} />
          <KycUpload label="Vehicle RC" hint="Registration certificate of your two-wheeler" done={r.has_rc} pending={pendingKind === "rc"} progress={progress} onFile={(f) => send("rc", f)} />
        </div>
        <p className="text-center text-xs text-muted">JPG, PNG or PDF up to 5 MB</p>
        {upload.error && <p role="alert" className="text-sm font-medium text-danger">{upload.error.message}</p>}
        <Button variant="ghost" className="w-full" onClick={signOut}><LogOut className="size-4" aria-hidden /> Sign out</Button>
      </div>
    </RiderSplit>
    </>
  );
}
