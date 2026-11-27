import type { RouteObject } from "react-router-dom";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { ShopGate } from "@/modules/shop/components/ShopGate";
import { ShopLayout } from "@/modules/shop/components/ShopLayout";
import { ShopAccountingPage } from "@/modules/shop/pages/ShopAccountingPage";
import { ShopOrdersPage } from "@/modules/shop/pages/ShopOrdersPage";
import { ShopPricesPage } from "@/modules/shop/pages/ShopPricesPage";
import { ResetPasswordPage } from "@/shared/components/auth/ResetPasswordPage";
import { RoleLoginPage } from "@/shared/components/auth/RoleLoginPage";

export const shopRoutes: RouteObject[] = [
  { path: "login", element: <RoleLoginPage role="shop" /> },
  { path: "reset-password", element: <ResetPasswordPage role="shop" /> },
  {
    element: (
      <ProtectedRoute role="shop">
        <ShopGate />
      </ProtectedRoute>
    ),
    children: [
      {
        element: <ShopLayout />,
        children: [
          { index: true, element: <ShopOrdersPage /> },
          { path: "prices", element: <ShopPricesPage /> },
          { path: "accounting", element: <ShopAccountingPage /> },
        ],
      },
    ],
  },
];
