import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications } from "@/modules/student/api";

/** Top-bar bell with the live unread count (polls every 30 s and refreshes on realtime events). */
export function NotificationBell() {
  const unread = useNotifications().data?.unread_count ?? 0;
  return (
    <Link
      to="/student/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex size-11 items-center justify-center rounded-2xl bg-background text-navy shadow-soft ring-1 ring-border/60 transition-colors hover:bg-surface"
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[11px] font-bold leading-5 text-navy ring-2 ring-canvas tabular">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
