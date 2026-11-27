import { useEffect, useRef } from "react";
import { Bell, ClipboardList, Landmark, Tags } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarShell } from "@/app/layouts/shells";
import { useSetOpen, useShop, useShopOrders } from "@/modules/shop/api";
import type { ShopOrder } from "@/modules/shop/api/types";
import { Avatar } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/fields";
import { toast, toastError } from "@/shared/components/ui/toast";
import { ChangePasswordButton } from "@/shared/components/auth/ChangePassword";
import { cn } from "@/shared/utils/cn";

/**
 * Calls `notify` with orders that appear in a later refetch but weren't in an earlier one.
 * The first load only primes the list (opening the portal doesn't alert for orders already waiting).
 */
export function useNewOrderAlerts(orders: ShopOrder[] | undefined, notify: (fresh: ShopOrder[]) => void) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders) return;
    if (!seen.current) {
      seen.current = new Set(orders.map((o) => o.id));
      return;
    }
    const fresh = orders.filter((o) => !seen.current!.has(o.id));
    fresh.forEach((o) => seen.current!.add(o.id));
    if (fresh.length) notify(fresh);
  }, [orders, notify]);
}

/** Open/closed switch for the top bar. Closed shops aren't assigned new orders. */
export function OpenToggle() {
  const shop = useShop().data;
  const setOpen = useSetOpen();
  if (!shop) return null;
  const open = shop.is_open;
  return (
    <div className={cn("flex h-11 items-center gap-2.5 rounded-2xl pl-3.5 pr-1.5 ring-1", open ? "bg-mint-soft ring-mint/30" : "bg-background ring-border")}>
      <span className="relative flex size-2.5" aria-hidden>
        {open && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-mint" />}
        <span className={cn("relative size-2.5 rounded-full", open ? "bg-mint" : "bg-muted")} />
      </span>
      <span className={cn("text-sm font-bold", open ? "text-success" : "text-muted")}>{open ? "Open" : "Closed"}</span>
      <Switch
        label="Accepting orders"
        tone="mint"
        checked={open}
        disabled={setOpen.isPending}
        onChange={(v) => setOpen.mutate(v, {
          onSuccess: (s) => s.is_open
            ? toast.success("You're open for orders", { description: "New orders will be assigned to you." })
            : toast("Shop closed", { description: "No new orders will be assigned until you reopen." }),
          onError: toastError,
        })}
      />
    </div>
  );
}

function NewOrdersBell({ count }: { count: number }) {
  return (
    <Link
      to="/shop?tab=new"
      aria-label={count ? `${count} new order${count === 1 ? "" : "s"}` : "No new orders"}
      className="relative flex size-11 items-center justify-center rounded-2xl text-navy ring-1 ring-border transition-colors hover:bg-surface"
    >
      <motion.span key={count} animate={count ? { rotate: [0, -16, 14, -8, 0] } : {}} transition={{ duration: 0.6 }} className="flex">
        <Bell className="size-5" aria-hidden />
      </motion.span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-orange px-1.5 text-center text-[11px] font-bold leading-5 text-navy ring-2 ring-background">
          {count}
        </span>
      )}
    </Link>
  );
}

function ShopAccount() {
  const shop = useShop().data;
  if (!shop) return null;
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
        <Avatar name={shop.shop_name} className="ring-white/20" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{shop.shop_name}</p>
          <p className="truncate text-xs text-white/60">{shop.area}</p>
        </div>
      </div>
      <ChangePasswordButton variant="ghost" className="mt-1 h-10 w-full justify-start rounded-2xl px-3.5 text-white/65 hover:bg-white/8 hover:text-white" />
    </div>
  );
}

/** Shop portal chrome: nav with a live new-order badge, open toggle, and a toast for each new order. */
export function ShopLayout() {
  const navigate = useNavigate();
  const fresh = useShopOrders("new");
  const count = fresh.data?.length ?? 0;

  useNewOrderAlerts(fresh.data, (orders) => {
    const first = orders[0]!;
    toast.success(orders.length === 1 ? `New order ${first.code}` : `${orders.length} new orders`, {
      description: orders.length === 1 ? `${first.college_name}${first.entitlement ? ` · you earn ₹${first.entitlement}` : ""}` : "Accept them before the slot cut-off.",
      action: { label: "View", onClick: () => navigate("/shop?tab=new") },
    });
  });

  const nav = [
    { to: "/shop", label: "Orders", icon: ClipboardList, end: true, badge: count || undefined },
    { to: "/shop/prices", label: "Prices & services", icon: Tags },
    { to: "/shop/accounting", label: "Earnings & payouts", icon: Landmark },
  ];

  return (
    <SidebarShell
      nav={nav}
      title="Printing Shop"
      account={<ShopAccount />}
      headerRight={<><NewOrdersBell count={count} /><OpenToggle /></>}
    />
  );
}
