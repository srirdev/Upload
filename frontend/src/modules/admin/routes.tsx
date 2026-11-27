import { Activity, Bike, GraduationCap, HandCoins, LifeBuoy, Map as MapIcon, Printer, ScrollText, Search, Wallet } from "lucide-react";
import { Link, type RouteObject } from "react-router-dom";
import { SidebarShell, type NavItem } from "@/app/layouts/shells";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { useAdminGet } from "@/modules/admin/api";
import type { AdminRider, AdminShop, Summary } from "@/modules/admin/api/types";
import { AdminAccount } from "@/modules/admin/components/AdminAccount";
import { AuditPage } from "@/modules/admin/pages/AuditPage";
import { CollegesPage } from "@/modules/admin/pages/CollegesPage";
import { FinancePage } from "@/modules/admin/pages/FinancePage";
import { LiveOpsPage } from "@/modules/admin/pages/LiveOpsPage";
import { MapPage } from "@/modules/admin/pages/MapPage";
import { OrdersComplaintsPage } from "@/modules/admin/pages/OrdersComplaintsPage";
import { RidersPage } from "@/modules/admin/pages/RidersPage";
import { SettlementsPage } from "@/modules/admin/pages/SettlementsPage";
import { ShopsPage } from "@/modules/admin/pages/ShopsPage";
import { ResetPasswordPage } from "@/shared/components/auth/ResetPasswordPage";
import { RoleLoginPage } from "@/shared/components/auth/RoleLoginPage";
import { StatusPill } from "@/shared/components/ui/badge";

/** Count badge, hidden while loading or zero. */
const count = (n: number | undefined) => (n ? (n > 99 ? "99+" : n) : undefined);

/** Sidebar with live counts of things that need a human (all from the API). */
function AdminLayout() {
  const summary = useAdminGet<Summary>("/ops/summary", { refetchInterval: 15_000 });
  const pendingShops = useAdminGet<AdminShop[]>("/shops?status=pending", { refetchInterval: 60_000 });
  const pendingRiders = useAdminGet<AdminRider[]>("/riders?kyc=pending", { refetchInterval: 60_000 });
  const s = summary.data;

  const nav: NavItem[] = [
    { to: "/admin", label: "Live Operations", icon: Activity, end: true, badge: count(s && s.unassigned_orders + s.unassigned_batches) },
    { to: "/admin/map", label: "Delivery Map", icon: MapIcon },
    { to: "/admin/orders", label: "Orders and Support", icon: LifeBuoy, badge: count(s && s.open_complaints + s.refunds_to_review) },
    { to: "/admin/shops", label: "Printing Shops", icon: Printer, badge: count(pendingShops.data?.length) },
    { to: "/admin/riders", label: "Delivery Partners", icon: Bike, badge: count(pendingRiders.data?.length) },
    { to: "/admin/colleges", label: "Colleges and Slots", icon: GraduationCap },
    { to: "/admin/finance", label: "Finance", icon: Wallet },
    { to: "/admin/settlements", label: "Settlements", icon: HandCoins },
    { to: "/admin/audit", label: "Audit History", icon: ScrollText },
  ];

  return (
    <SidebarShell
      nav={nav}
      title="Operations Centre"
      account={<AdminAccount />}
      headerRight={
        <>
          <StatusPill kind="done" live className="hidden sm:inline-flex">Live</StatusPill>
          <Link
            to="/admin/orders"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-background px-3 text-sm font-semibold text-ink-2 shadow-soft ring-1 ring-border/60 transition-colors hover:text-primary"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden md:inline">Find an order</span>
          </Link>
        </>
      }
    />
  );
}

export const adminRoutes: RouteObject[] = [
  { path: "login", element: <RoleLoginPage role="admin" /> },
  { path: "reset-password", element: <ResetPasswordPage role="admin" /> },
  {
    element: (
      <ProtectedRoute role="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <LiveOpsPage /> },
      { path: "map", element: <MapPage /> },
      { path: "orders", element: <OrdersComplaintsPage /> },
      { path: "shops", element: <ShopsPage /> },
      { path: "riders", element: <RidersPage /> },
      { path: "colleges", element: <CollegesPage /> },
      { path: "finance", element: <FinancePage /> },
      { path: "settlements", element: <SettlementsPage /> },
      { path: "audit", element: <AuditPage /> },
    ],
  },
];
