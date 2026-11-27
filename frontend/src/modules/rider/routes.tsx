import { Bike, History, User, Wallet } from "lucide-react";
import type { RouteObject } from "react-router-dom";
import { MobileShell } from "@/app/layouts/shells";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { AvailabilityToggle } from "@/modules/rider/components/AvailabilityToggle";
import { RiderGate } from "@/modules/rider/components/RiderGate";
import { ActiveRunPage } from "@/modules/rider/pages/ActiveRunPage";
import { EarningsPage } from "@/modules/rider/pages/EarningsPage";
import { HistoryPage } from "@/modules/rider/pages/HistoryPage";
import { RiderProfilePage } from "@/modules/rider/pages/RiderProfilePage";
import { ResetPasswordPage } from "@/shared/components/auth/ResetPasswordPage";
import { RoleLoginPage } from "@/shared/components/auth/RoleLoginPage";

const nav = [
  { to: "/rider", label: "Active Run", icon: Bike, end: true },
  { to: "/rider/history", label: "History", icon: History },
  { to: "/rider/earnings", label: "Earnings", icon: Wallet },
  { to: "/rider/profile", label: "Profile", icon: User },
];

export const riderRoutes: RouteObject[] = [
  { path: "login", element: <RoleLoginPage role="rider" /> },
  { path: "reset-password", element: <ResetPasswordPage role="rider" /> },
  {
    element: (
      <ProtectedRoute role="rider">
        <RiderGate />
      </ProtectedRoute>
    ),
    children: [
      {
        element: <MobileShell nav={nav} title="Delivery Partner" topRight={<AvailabilityToggle />} />,
        children: [
          { index: true, element: <ActiveRunPage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "earnings", element: <EarningsPage /> },
          { path: "profile", element: <RiderProfilePage /> },
        ],
      },
    ],
  },
];
