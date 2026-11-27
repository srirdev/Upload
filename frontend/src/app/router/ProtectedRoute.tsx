import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/shared/api/authStore";
import type { Role } from "@/shared/types/auth";

/**
 * UX guard only; the backend enforces authorization on every API call.
 * Reads THIS portal's own session (each portal keeps its own sign-in), never the one being mirrored for the
 * URL: while another portal's code loads, React keeps this tree on screen, and it must not react to that switch.
 */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const user = useAuth((s) => s.sessions[role]?.user ?? (s.user?.role === role ? s.user : null));
  if (!user) return <Navigate to={`/${role}/login`} replace />;
  return children;
}
