import { useSearchParams } from "react-router-dom";
import { useAdminGet } from "@/modules/admin/api";
import { SettlementsSection, type Kind, type RawSettlement } from "@/modules/admin/components/SettlementsSection";
import { WalletArt } from "@/shared/components/illustrations";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { Tabs } from "@/shared/components/ui/tabs";

export function SettlementsPage() {
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get("for") === "riders" ? "riders" : "shops";
  const shops = useAdminGet<RawSettlement[]>("/settlements/shops?status=pending");
  const riders = useAdminGet<RawSettlement[]>("/settlements/riders?status=pending");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Money out" title="Settlements" subtitle="Generate payout batches for shops and riders, pay them by UPI and record the reference." />

      <Card tone="midnight" pad="lg" className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <div>
          <p className="text-sm text-white/70">Shop payouts pending</p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular">{shops.data ? shops.data.length : "…"}</p>
          <p className="text-xs text-white/60">settlements waiting to be paid</p>
        </div>
        <div>
          <p className="text-sm text-white/70">Rider payouts pending</p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular">{riders.data ? riders.data.length : "…"}</p>
          <p className="text-xs text-white/60">settlements waiting to be paid</p>
        </div>
        <WalletArt className="hidden h-24 sm:block" />
      </Card>

      <Tabs<Kind>
        label="Settlement type"
        value={kind}
        onChange={(k) => setParams(k === "shops" ? {} : { for: k }, { replace: true })}
        className="w-fit"
        items={[
          { value: "shops", label: "Printing shops", count: shops.data?.length || undefined },
          { value: "riders", label: "Delivery partners", count: riders.data?.length || undefined },
        ]}
      />
      <div role="tabpanel" aria-label={kind}>
        <SettlementsSection key={kind} kind={kind} />
      </div>
    </div>
  );
}
