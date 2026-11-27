import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, ClipboardList, IndianRupee, KeyRound, Printer, Search, Sparkles, Timer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useDashboard, useSetOpen, useShop, useShopOrders } from "@/modules/shop/api";
import type { ShopOrder, Tab } from "@/modules/shop/api/types";
import { matches, stageOf, type Stage } from "@/modules/shop/components/orderMeta";
import { ShopOrderCard } from "@/modules/shop/components/ShopOrderCard";
import { EmptyBoxArt, PrinterArt, SearchArt } from "@/shared/components/illustrations";
import { IconTile, type Tone } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Select } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { FadeIn } from "@/shared/components/ui/motion";
import { StatTile } from "@/shared/components/ui/stat";
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/shared/components/ui/states";
import { ChipFilter, Tabs } from "@/shared/components/ui/tabs";
import { toast, toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";
import { rupees } from "@/shared/utils/format";

const TABS: Tab[] = ["new", "pending", "finished"];
const TAB_LABEL: Record<Tab, string> = { new: "New", pending: "In progress", finished: "Finished" };
const EMPTY: Record<Tab, { title: string; hint: string }> = {
  new: { title: "No new orders right now", hint: "New orders appear here the moment a student picks your shop." },
  pending: { title: "Nothing in progress", hint: "Accepted orders move here while you print, bind and pack." },
  finished: { title: "No finished orders yet", hint: "Orders you hand over show up here." },
};
type StageFilter = "all" | "printing" | "packing" | "handover";
type Sort = "deadline" | "recent";

const PIPELINE: { stage: Stage; label: string; icon: typeof Printer; tone: Tone; tab: Tab; filter: StageFilter }[] = [
  { stage: "new", label: "New", icon: Sparkles, tone: "violet", tab: "new", filter: "all" },
  { stage: "printing", label: "Printing", icon: Printer, tone: "orange", tab: "pending", filter: "printing" },
  { stage: "packing", label: "Binding & packing", icon: BookOpen, tone: "sun", tab: "pending", filter: "packing" },
  { stage: "handover", label: "Ready for handover", icon: KeyRound, tone: "mint", tab: "pending", filter: "handover" },
];

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export function ShopOrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "new";
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");

  const shop = useShop().data;
  const dash = useDashboard();
  const lists = { new: useShopOrders("new"), pending: useShopOrders("pending"), finished: useShopOrders("finished") };
  const current = lists[tab];
  const d = dash.data;

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { new: 0, printing: 0, packing: 0, handover: 0, delivering: 0, done: 0 };
    for (const o of [...(lists.new.data ?? []), ...(lists.pending.data ?? [])]) c[stageOf(o)] += 1;
    return c;
  }, [lists.new.data, lists.pending.data]);

  const shown = useMemo(() => {
    const rows = (current.data ?? [])
      .filter((o) => tab !== "pending" || stageFilter === "all" || stageOf(o) === stageFilter)
      .filter((o) => matches(o, query));
    const t = (o: ShopOrder) => (o.delivery_at ? new Date(o.delivery_at).getTime() : Infinity);
    const a = (o: ShopOrder) => (o.assigned_at ? new Date(o.assigned_at).getTime() : 0);
    return [...rows].sort(sort === "deadline" ? (x, y) => t(x) - t(y) : (x, y) => a(y) - a(x));
  }, [current.data, tab, stageFilter, query, sort]);

  const go = (next: Tab, filter: StageFilter = "all") => {
    setParams(next === "new" ? {} : { tab: next }, { replace: true });
    setStageFilter(filter);
  };

  return (
    <div className="space-y-6">
      <Hero shopName={shop?.shop_name} isOpen={shop?.is_open ?? d?.is_open} newCount={lists.new.data?.length} pendingCount={lists.pending.data?.length}
        onViewNew={() => go("new")} />

      {dash.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}</div>
      ) : dash.isError ? (
        <ErrorState compact message={dash.error.message} onRetry={() => dash.refetch()} />
      ) : d && (
        <FadeIn className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Orders today" value={d.orders_today} icon={ClipboardList} tone="violet" hint="Assigned to you since midnight" />
          <StatTile label="Waiting to accept" value={d.new_orders} icon={Timer} tone="orange" hint={d.new_orders ? "Accept before the slot cut-off" : "You're all caught up"} />
          <StatTile label="In progress" value={d.pending_orders} icon={Printer} tone="sun" hint="Printing, binding or packing" />
          <StatTile label="Earned this week" value={rupees(d.weekly_earnings)} icon={IndianRupee} tone="mint" hint={<>Total earned <b className="text-navy">{rupees(d.total_earnings)}</b></>} />
        </FadeIn>
      )}

      <FadeIn delay={0.05}>
        <Card pad="lg">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-navy">Order pipeline</h2>
            <p className="text-xs text-muted">Tap a stage to see its orders</p>
          </div>
          <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PIPELINE.map((p, i) => {
              const on = tab === p.tab && (p.tab === "new" || stageFilter === p.filter);
              return (
                <li key={p.stage} className="relative">
                  <button
                    type="button"
                    onClick={() => go(p.tab, p.filter)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-3.5 text-left ring-1 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                      on ? "bg-primary-soft ring-primary/40" : "bg-background ring-border",
                    )}
                  >
                    <IconTile icon={p.icon} tone={p.tone} />
                    <span className="min-w-0">
                      <span className="block font-display text-2xl font-extrabold leading-none text-navy tabular">
                        {lists.new.isLoading || lists.pending.isLoading ? "–" : counts[p.stage]}
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold text-muted">{p.label}</span>
                    </span>
                  </button>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight aria-hidden className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted md:block" />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      </FadeIn>

      <section aria-label="Orders" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs<Tab>
            label="Order tabs"
            value={tab}
            onChange={(t) => go(t)}
            items={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: lists[t].data?.length }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="sm:w-80">
              <Input icon={Search} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, college or file" aria-label="Search orders" className="h-11" />
            </div>
            <div className="sm:w-48">
              <Select aria-label="Sort orders" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-11">
                <option value="deadline">Deadline soonest</option>
                <option value="recent">Recently received</option>
              </Select>
            </div>
          </div>
        </div>

        {tab === "pending" && (
          <ChipFilter<StageFilter>
            label="Filter by stage"
            value={stageFilter}
            onChange={setStageFilter}
            items={[
              { value: "all", label: "All" },
              { value: "printing", label: `Printing · ${counts.printing}` },
              { value: "packing", label: `Packing · ${counts.packing}` },
              { value: "handover", label: `Ready for handover · ${counts.handover}` },
            ]}
          />
        )}

        {current.isLoading ? (
          <ListSkeleton rows={3} />
        ) : current.isError ? (
          <ErrorState message={current.error.message} onRetry={() => current.refetch()} />
        ) : shown.length === 0 ? (
          query || (tab === "pending" && stageFilter !== "all") ? (
            <EmptyState art={SearchArt} title="No matching orders" hint="Try a different search or stage."
              action={<Button variant="outline" onClick={() => { setQuery(""); setStageFilter("all"); }}>Clear filters</Button>} />
          ) : (
            <EmptyState art={EmptyBoxArt} title={EMPTY[tab].title}
              hint={tab === "new" && shop && !shop.is_open ? "You're closed, so new orders won't be assigned to you." : EMPTY[tab].hint} />
          )
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            {shown.map((o) => <ShopOrderCard key={o.id} order={o} tab={tab} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Hero({
  shopName, isOpen, newCount, pendingCount, onViewNew,
}: { shopName?: string; isOpen?: boolean; newCount?: number; pendingCount?: number; onViewNew: () => void }) {
  const setOpen = useSetOpen();
  return (
    <FadeIn>
      <section className="bg-sunrise relative overflow-hidden rounded-4xl p-6 text-white shadow-lift md:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-white/85">{greeting()}{shopName ? "," : ""}</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight md:text-4xl">{shopName ?? "Your shop"}</h1>
            <p className="mt-2 text-sm text-white/90 md:text-base">
              {isOpen === false
                ? "You're closed. Open your shop to start receiving orders."
                : newCount
                  ? `${newCount} new order${newCount === 1 ? " is" : "s are"} waiting for you to accept.`
                  : "You're open. New orders land here the moment students pick your shop."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {isOpen === false ? (
                <Button variant="white" disabled={setOpen.isPending}
                  onClick={() => setOpen.mutate(true, { onSuccess: () => toast.success("You're open for orders"), onError: toastError })}>
                  Open my shop
                </Button>
              ) : (
                <Button variant="white" onClick={onViewNew}>View new orders <ArrowRight className="size-4" /></Button>
              )}
              <span className="glass-dark inline-flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-semibold ring-1 ring-white/25">
                <Printer className="size-4" aria-hidden /> {pendingCount ?? "–"} in progress
              </span>
            </div>
          </div>
          <PrinterArt className="hidden h-36 w-auto shrink-0 animate-float drop-shadow-xl md:block lg:h-44" />
        </div>
      </section>
    </FadeIn>
  );
}
