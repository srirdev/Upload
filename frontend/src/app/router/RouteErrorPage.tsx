import { Home, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";

/**
 * Branded fallback for any error thrown while rendering a route (instead of the router's developer screen).
 * In development the technical message is shown underneath to help debugging.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const detail = error instanceof Error ? error.message : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  const home = `/${window.location.pathname.split("/")[1] || "student"}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6 text-center">
      <Logo />
      <div className="max-w-md rounded-4xl bg-background p-8 shadow-lift ring-1 ring-border/60">
        <h1 className="font-display text-2xl font-extrabold text-navy">{notFound ? "Page not found" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm text-muted">
          {notFound
            ? "This page doesn't exist or has moved."
            : "This screen hit an unexpected problem. Your orders and uploads are safe. Reloading usually fixes it."}
        </p>
        {import.meta.env.DEV && detail && (
          <pre className="mt-4 max-h-32 overflow-auto rounded-2xl bg-surface p-3 text-left text-xs text-ink-2">{detail}</pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {!notFound && (
            <Button onClick={() => window.location.reload()}><RefreshCw className="size-4" /> Reload</Button>
          )}
          <Button variant="outline" onClick={() => window.location.assign(home)}><Home className="size-4" /> Go home</Button>
        </div>
      </div>
    </main>
  );
}
