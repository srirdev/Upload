import { useSearchParams } from "react-router-dom";
import { useAdminGet } from "@/modules/admin/api";
import type { Summary } from "@/modules/admin/api/types";
import { ComplaintsTab } from "@/modules/admin/components/ComplaintsTab";
import { OrdersTab } from "@/modules/admin/components/OrdersTab";
import { RefundsTab } from "@/modules/admin/components/RefundsTab";
import { PageHeader } from "@/shared/components/ui/card";
import { Tabs } from "@/shared/components/ui/tabs";

type Tab = "orders" | "complaints" | "refunds";
const TABS: Tab[] = ["orders", "complaints", "refunds"];

/** Order monitoring plus the support queues. The tab lives in the URL (?tab=complaints) so links can deep-link. */
export function OrdersComplaintsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "orders";
  const summary = useAdminGet<Summary>("/ops/summary", { refetchInterval: 15_000 });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring and support"
        title="Orders and support"
        subtitle="Find any order, follow its journey and resolve student complaints and refunds."
      />
      <Tabs<Tab>
        label="Orders and support"
        value={tab}
        onChange={(t) => setParams(t === "orders" ? {} : { tab: t }, { replace: true })}
        className="w-fit max-w-full"
        items={[
          { value: "orders", label: "Orders" },
          { value: "complaints", label: "Complaints", count: summary.data?.open_complaints || undefined },
          { value: "refunds", label: "Refunds", count: summary.data?.refunds_to_review || undefined },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === "orders" && <OrdersTab />}
        {tab === "complaints" && <ComplaintsTab />}
        {tab === "refunds" && <RefundsTab />}
      </div>
    </div>
  );
}
