import { CircleHelp, Home, Package, Plus, User } from "lucide-react";
import { Outlet, type RouteObject } from "react-router-dom";
import { MobileShell } from "@/app/layouts/shells";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { NotificationBell } from "@/modules/student/components/NotificationBell";
import { StudentGate } from "@/modules/student/components/StudentGate";
import { HelpPage } from "@/modules/student/pages/HelpPage";
import { HomePage } from "@/modules/student/pages/HomePage";
import { NewOrderPage } from "@/modules/student/pages/NewOrderPage";
import { NotificationsPage } from "@/modules/student/pages/NotificationsPage";
import { OrderDetailPage } from "@/modules/student/pages/OrderDetailPage";
import { OrdersPage } from "@/modules/student/pages/OrdersPage";
import { ProfilePage } from "@/modules/student/pages/ProfilePage";
import { StartOrderPage } from "@/modules/student/pages/StartOrderPage";
import { ResetPasswordPage } from "@/shared/components/auth/ResetPasswordPage";
import { RoleLoginPage } from "@/shared/components/auth/RoleLoginPage";

const nav = [
  { to: "/student", label: "Home", icon: Home, end: true },
  { to: "/student/orders", label: "Orders", icon: Package },
  { to: "/student/help", label: "Help", icon: CircleHelp },
  { to: "/student/profile", label: "Profile", icon: User },
];

/** Full-screen flow without the navigation bars (the order wizard). */
const FocusLayout = () => (
  <div className="min-h-dvh bg-canvas">
    <main className="mx-auto max-w-[96rem] px-4 pb-12 pt-5 md:px-6 md:pt-8">
      <Outlet />
    </main>
  </div>
);

export const studentRoutes: RouteObject[] = [
  { path: "login", element: <RoleLoginPage role="student" /> },
  { path: "reset-password", element: <ResetPasswordPage role="student" /> },
  {
    element: (
      <ProtectedRoute role="student">
        <StudentGate />
      </ProtectedRoute>
    ),
    children: [
      {
        element: <MobileShell nav={nav} fab={{ to: "/student/new", label: "Upload", icon: Plus }} topRight={<NotificationBell />} />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "orders", element: <OrdersPage /> },
          { path: "orders/:orderId", element: <OrderDetailPage /> },
          { path: "help", element: <HelpPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "notifications", element: <NotificationsPage /> },
        ],
      },
      {
        element: <FocusLayout />,
        children: [
          { path: "new", element: <StartOrderPage /> },
          { path: "new/:orderId", element: <NewOrderPage /> },
        ],
      },
    ],
  },
];
