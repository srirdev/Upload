import { useSearchParams } from "react-router-dom";
import { CouponsPanel } from "@/modules/admin/components/CouponsAudit";
import { FinanceOverview } from "@/modules/admin/components/FinanceOverview";
import { PlatformSettings, PricingSettings } from "@/modules/admin/components/FinanceSettings";
import { PageHeader } from "@/shared/components/ui/card";
import { Tabs } from "@/shared/components/ui/tabs";

type Tab = "overview" | "settings" | "pricing" | "coupons";
const TABS: Tab[] = ["overview", "settings", "pricing", "coupons"];

export function FinancePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "overview";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Money" title="Finance" subtitle="Revenue, margin and the full ledger, plus the prices and fees that drive them." />
      <Tabs<Tab>
        label="Finance sections"
        value={tab}
        onChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })}
        className="w-fit max-w-full"
        items={[
          { value: "overview", label: "Analytics and ledger" },
          { value: "settings", label: "Platform settings" },
          { value: "pricing", label: "Pricing" },
          { value: "coupons", label: "Coupons" },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === "overview" && <FinanceOverview />}
        {tab === "settings" && <PlatformSettings />}
        {tab === "pricing" && <PricingSettings />}
        {tab === "coupons" && <CouponsPanel />}
      </div>
    </div>
  );
}
