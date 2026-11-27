import type { ComponentType, SVGProps } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { Outlet } from "react-router-dom";
import { signOut } from "@/app/layouts/shells";
import { useShop } from "@/modules/shop/api";
import type { ShopStatus } from "@/modules/shop/api/types";
import { ShopRegisterPage } from "@/modules/shop/pages/ShopRegisterPage";
import { ShieldArt, WaitingArt } from "@/shared/components/illustrations";
import { Logo } from "@/shared/components/Logo";
import { StatusPill, type StatusKind } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { FadeIn } from "@/shared/components/ui/motion";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { FloatingPortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { ErrorState, PageLoader } from "@/shared/components/ui/states";

const COPY: Record<Exclude<ShopStatus, "approved">, { title: string; pill: string; kind: StatusKind; art: ComponentType<SVGProps<SVGSVGElement>> }> = {
  pending: { title: "We're reviewing your shop", pill: "Awaiting approval", kind: "waiting", art: WaitingArt },
  rejected: { title: "Registration not approved", pill: "Not approved", kind: "problem", art: ShieldArt },
  suspended: { title: "Your shop is suspended", pill: "Suspended", kind: "problem", art: ShieldArt },
};

/** Registration -> awaiting approval -> portal. Only approved shops reach the Outlet. */
export function ShopGate() {
  const shop = useShop();
  if (shop.isLoading) return <PageLoader />;
  if (shop.isError) return <ErrorState message={shop.error.message} onRetry={() => shop.refetch()} />;
  const s = shop.data;
  if (!s) return <><ShopRegisterPage /><FloatingPortalSwitcher /></>;
  if (s.status === "approved") return <Outlet />;

  const copy = COPY[s.status];
  const body =
    s.status === "pending"
      ? "Our team checks every shop before it can receive live orders. This page updates on its own the moment you're approved."
      : s.status === "rejected"
        ? s.rejection_reason ?? "Please contact UpLOAD support for details."
        : "You can't receive orders right now. Please contact UpLOAD support.";

  return (
    <div className="bg-sunrise relative min-h-dvh overflow-hidden px-4 py-8">
      <FloatingPortalSwitcher />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-primary/30 blur-3xl" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-6">
        <Logo inverted />
        <FadeIn className="w-full rounded-4xl bg-background p-6 text-center shadow-lift sm:p-8">
          <copy.art className="mx-auto h-28 w-auto" />
          <StatusPill kind={copy.kind} live={s.status === "pending"} className="mt-4">{copy.pill}</StatusPill>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-navy">{copy.title}</h1>
          <p className="mt-1 font-semibold text-ink-2">{s.shop_name} · {s.area}</p>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">{body}</p>

          {s.status === "pending" && (
            <ProgressSteps
              className="mt-6 text-left"
              orientation="horizontal"
              current={1}
              steps={[{ label: "Registered" }, { label: "Under review" }, { label: "Start taking orders" }]}
            />
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {s.status === "pending" && (
              <Button variant="soft" disabled={shop.isFetching} onClick={() => shop.refetch()}>
                <RefreshCw className={shop.isFetching ? "size-4 animate-spin" : "size-4"} /> Check now
              </Button>
            )}
            <Button variant="outline" onClick={signOut}><LogOut className="size-4" /> Sign out</Button>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
