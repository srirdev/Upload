import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useRoutes, type RouteObject } from "react-router-dom";
import { RouteErrorPage } from "@/app/router/RouteErrorPage";
import { PageLoader } from "@/shared/components/ui/states";

/**
 * Each portal is its own code-split chunk: a student never downloads the admin's charts and maps.
 * The portal's routes render as descendant routes under `/<role>/*`.
 */
function portal(load: () => Promise<RouteObject[]>) {
  const Portal = lazy(async () => {
    const routes = await load();
    return { default: function PortalRoutes() { return useRoutes(routes); } };
  });
  return (
    <Suspense fallback={<PageLoader />}>
      <Portal />
    </Suspense>
  );
}

/** Every route renders a branded error page instead of the router's developer screen. */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <Navigate to="/student" replace /> },
      { path: "/student/*", element: portal(() => import("@/modules/student/routes").then((m) => m.studentRoutes)) },
      { path: "/rider/*", element: portal(() => import("@/modules/rider/routes").then((m) => m.riderRoutes)) },
      { path: "/shop/*", element: portal(() => import("@/modules/shop/routes").then((m) => m.shopRoutes)) },
      { path: "/admin/*", element: portal(() => import("@/modules/admin/routes").then((m) => m.adminRoutes)) },
      { path: "*", element: <Navigate to="/student" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
