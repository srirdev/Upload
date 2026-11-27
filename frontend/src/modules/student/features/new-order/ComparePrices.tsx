import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Store } from "lucide-react";
import { chooseShop, queryKeys, useShopOptions } from "@/modules/student/api";
import type { OrderDetail, ShopOption } from "@/modules/student/api/types";
import { Skeleton, Spinner } from "@/shared/components/ui/states";
import { cn } from "@/shared/utils/cn";
import { rupees } from "@/shared/utils/format";

/** Shops priced on their own rate cards, cheapest first. Choosing one re-prices the quotation (server-side). */
export function ComparePrices({ order, version }: { order: OrderDetail; version: string }) {
  const qc = useQueryClient();
  const options = useShopOptions(order.id, true, version);
  const [saving, setSaving] = useState<string | null>(null); // shop id, or "any"
  const [error, setError] = useState<string | null>(null);
  const chosenId = order.chosen_shop?.id ?? null;

  async function choose(o: ShopOption) {
    if (o.shop_id === chosenId) return;
    setSaving(o.shop_id ?? "any");
    setError(null);
    try {
      await chooseShop(order.id, o.shop_id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.order(order.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.quote(order.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.shopOptions(order.id) }),
      ]);
    } catch (e) {
      setError((e as Error).message);
      qc.invalidateQueries({ queryKey: queryKeys.shopOptions(order.id) });
    } finally {
      setSaving(null);
    }
  }

  const list = options.data ?? [];
  const lowest = list.length > 1 ? Math.min(...list.map((o) => Number(o.total))) : null;
  const chosenGone = order.chosen_shop && options.data && !list.some((o) => o.shop_id === chosenId);

  return (
    <section className="space-y-3" aria-live="polite">
      <div>
        <h2 className="font-semibold">Compare prices</h2>
        <p className="text-xs text-muted">Each shop prints at its own rates. Pick one, or let us assign any available shop.</p>
      </div>
      {options.isLoading && <Skeleton className="h-24" />}
      {options.isError && <p role="alert" className="text-sm text-danger">{options.error.message}</p>}
      {chosenGone && (
        <p className="text-sm text-danger">{order.chosen_shop!.shop_name} can't take this order right now. Please choose again.</p>
      )}
      {list.length > 0 && (
        <div role="radiogroup" aria-label="Shops" className="space-y-2">
          {list.map((o) => {
            const id = o.shop_id ?? "any";
            const active = o.shop_id === chosenId;
            const details = o.shop_id === null
              ? "Assigned automatically"
              : [o.area, o.distance_km && `${Number(o.distance_km).toFixed(1)} km to college`].filter(Boolean).join(" · ");
            return (
              <button key={id} type="button" role="radio" aria-checked={active} disabled={saving !== null}
                onClick={() => choose(o)}
                className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60",
                  active ? "border-primary bg-surface ring-4 ring-primary/10" : "border-border hover:bg-surface")}>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl",
                  active ? "bg-primary text-white" : "bg-surface text-primary")}>
                  {saving === id ? <Spinner className={active ? "text-white" : undefined} /> : active ? <Check className="size-4" /> : <Store className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {o.shop_id === null ? "Any available shop · standard price" : o.shop_name}
                  </span>
                  {details && <span className="block truncate text-xs text-muted">{details}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{rupees(o.total)}</span>
                  {lowest !== null && Number(o.total) === lowest && (
                    <span className="mt-0.5 inline-block rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Lowest price</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
