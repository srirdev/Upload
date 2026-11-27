import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, CheckCheck, CircleDollarSign, Package, Truck, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { markAllRead, markRead, queryKeys, useNotifications } from "@/modules/student/api";
import type { AppNotification } from "@/modules/student/api/types";
import { IconTile, type Tone } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/card";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/components/ui/states";
import { toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";
import { formatDateTime } from "@/shared/utils/format";

/** Icon + tint per notification kind (kinds are free-form strings from the backend). */
function look(kind: string): { icon: LucideIcon; tone: Tone } {
  if (/refund|payment/.test(kind)) return { icon: CircleDollarSign, tone: "mint" };
  if (/deliver|dispatch|ready|shelf|collect/.test(kind)) return { icon: Truck, tone: "orange" };
  if (/order|print|pack|accept/.test(kind)) return { icon: Package, tone: "violet" };
  return { icon: Bell, tone: "sun" };
}

/** Today / Yesterday / date headings. */
function dayLabel(iso: string) {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const d = key(new Date(iso));
  if (d === key(new Date())) return "Today";
  if (d === key(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useNotifications();
  const hasUnread = (data?.unread_count ?? 0) > 0;
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.notifications });

  useEffect(() => {
    // Mark as read after the list has rendered with the unread highlights.
    if (!hasUnread) return;
    const t = setTimeout(() => markAllRead().then(() => qc.invalidateQueries({ queryKey: queryKeys.notifications })), 2500);
    return () => clearTimeout(t);
  }, [hasUnread, qc]);

  const groups = new Map<string, AppNotification[]>();
  data?.items.forEach((n) => groups.set(dayLabel(n.created_at), [...(groups.get(dayLabel(n.created_at)) ?? []), n]));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate("/student")}
          className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background shadow-soft ring-1 ring-border/60 hover:bg-surface"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1">
          <PageHeader
            title="Notifications"
            subtitle={hasUnread ? `${data!.unread_count} unread` : "Order, delivery and refund updates"}
            actions={hasUnread && (
              <Button variant="soft" size="sm" onClick={() => markAllRead().then(refresh).catch(toastError)}>
                <CheckCheck className="size-4" aria-hidden /> Mark all read
              </Button>
            )}
          />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState title="You're all caught up" hint="Order and refund updates show up here." />
      ) : (
        [...groups].map(([day, items]) => (
          <section key={day} aria-label={day} className="space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{day}</h2>
            <Stagger className="space-y-2">
              {items.map((n) => {
                const { icon, tone } = look(n.kind);
                const body = (
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-3xl p-4 transition-shadow",
                      n.read ? "bg-background ring-1 ring-border/60" : "bg-background shadow-soft ring-2 ring-primary/25",
                      n.order_id && "hover:shadow-lift",
                    )}
                  >
                    <IconTile icon={icon} tone={tone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>}
                      <p className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-orange" aria-label="Unread" />}
                  </div>
                );
                return (
                  <StaggerItem key={n.id}>
                    {n.order_id ? (
                      <Link to={`/student/orders/${n.order_id}`} onClick={() => !n.read && markRead(n.id).then(refresh).catch(() => undefined)} className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-primary">
                        {body}
                      </Link>
                    ) : body}
                  </StaggerItem>
                );
              })}
            </Stagger>
          </section>
        ))
      )}
    </div>
  );
}
