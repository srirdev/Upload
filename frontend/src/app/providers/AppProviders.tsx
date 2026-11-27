import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useRealtime } from "@/shared/api/realtime";
import { Toaster } from "@/shared/components/ui/toast";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** One events socket for whoever is signed in (any portal). */
function RealtimeSync() {
  useRealtime();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Honour the OS "reduce motion" setting for every animation. */}
      <MotionConfig reducedMotion="user">
        <RealtimeSync />
        {children}
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}
