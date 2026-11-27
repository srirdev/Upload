import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useOrders } from "@/modules/student/api";
import { ACTIVE_STATUSES, STATUS_LABEL, type OrderSummary } from "@/modules/student/api/types";
import { OrderCard } from "@/modules/student/components/OrderCard";
import { useStartOrder } from "@/modules/student/hooks/useStartOrder";
import { EmptyBoxArt, SearchArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { EmptyState, ErrorState, ListSkeleton, Spinner } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";

type Filter = "all" | "active" | "done" | "closed";
const DONE = new Set<OrderSummary["status"]>(["collected"]);
const CLOSED = new Set<OrderSummary["status"]>(["cancelled", "rejected"]);

const matches = (o: OrderSummary, f: Filter) =>
  f === "all" ||
  (f === "active" && ACTIVE_STATUSES.includes(o.status)) ||
  (f === "done" && DONE.has(o.status)) ||
  (f === "closed" && CLOSED.has(o.status));

export function OrdersPage() {
  const orders = useOrders();
  const start = useStartOrder();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const list = orders.data ?? [];
  const counts = useMemo(
    () => ({
      all: list.length,
      active: list.filter((o) => matches(o, "active")).length,
      done: list.filter((o) => matches(o, "done")).length,
      closed: list.filter((o) => matches(o, "closed")).length,
    }),
    [list],
  );
  const term = q.trim().toLowerCase();
  const shown = list.filter(
    (o) => matches(o, filter) && (!term || o.code.toLowerCase().includes(term) || STATUS_LABEL[o.status].toLowerCase().includes(term)),
  );

  const newOrder = (
    <Button onClick={() => start.mutate()} disabled={start.isPending}>
      {start.isPending ? <Spinner className="text-white" /> : <><Plus className="size-4" aria-hidden /> New order</>}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Your orders" subtitle="Track prints, re-check details and get help with any order." actions={<div className="hidden md:block">{newOrder}</div>} />

      {orders.isLoading ? (
        <ListSkeleton rows={4} />
      ) : orders.isError ? (
        <ErrorState message={orders.error.message} onRetry={() => orders.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState art={EmptyBoxArt} title="No orders yet" hint="Upload a document and your orders will show up here." action={newOrder} />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:w-80">
              <Input icon={Search} type="search" aria-label="Search orders" placeholder="Search by order code or status" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ChipFilter<Filter>
              label="Filter orders"
              value={filter}
              onChange={setFilter}
              items={[
                { value: "all", label: <>All <Count n={counts.all} /></> },
                { value: "active", label: <>In progress <Count n={counts.active} /></> },
                { value: "done", label: <>Collected <Count n={counts.done} /></> },
                { value: "closed", label: <>Cancelled <Count n={counts.closed} /></> },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState compact art={SearchArt} title="No matching orders" hint="Try a different filter or search term." action={<Button variant="outline" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</Button>} />
          ) : (
            <Stagger key={`${filter}-${term}`} className="grid gap-3 lg:grid-cols-2">
              {shown.map((o) => (
                <StaggerItem key={o.id}>
                  <OrderCard order={o} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}
    </div>
  );
}

const Count = ({ n }: { n: number }) => <span className="tabular opacity-70">{n}</span>;
