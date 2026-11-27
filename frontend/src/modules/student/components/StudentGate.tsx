import { Outlet } from "react-router-dom";
import { useProfile } from "@/modules/student/api";
import { OnboardingPage } from "@/modules/student/pages/OnboardingPage";
import { FloatingPortalSwitcher } from "@/shared/components/auth/PortalSwitcher";
import { ErrorState, PageLoader } from "@/shared/components/ui/states";

/** Blocks the student area until the one-time academic profile exists. */
export function StudentGate() {
  const profile = useProfile();
  if (profile.isLoading) return <PageLoader />;
  if (profile.isError) return <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />;
  if (!profile.data) return <><OnboardingPage /><FloatingPortalSwitcher /></>;
  return <Outlet />;
}
