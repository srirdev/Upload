import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/providers/AppProviders";
import { router } from "@/app/router";
import { useAuth } from "@/shared/api/authStore";
import "@/styles/index.css";

// Each portal keeps its own sign-in: follow the URL to the matching session.
useAuth.getState().syncPath(window.location.pathname);
router.subscribe((state) => useAuth.getState().syncPath(state.location.pathname));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
