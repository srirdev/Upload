import { ChevronRight, FileStack } from "lucide-react";
import { Link } from "react-router-dom";
import type { OrderSummary } from "@/modules/student/api/types";
import { ACTIVE_STATUSES, STATUS_LABEL } from "@/modules/student/api/types";
import { statusKind } from "@/modules/student/components/status";
import { IconTile, StatusPill } from "@/shared/components/ui/badge";
import { cn } from "@/shared/utils/cn";
import { formatDate, rupees } from "@/shared/utils/format";

export function OrderStatusPill({ status, className }: { status: OrderSummary["status"]; className?: string }) {
  const live = ACTIVE_STATUSES.includes(status) && status !== "awaiting_payment";
  return <StatusPill kind={statusKind(status)} live={live} className={className}>{STATUS_LABEL[status]}</StatusPill>;
}

/** One order as a tappable card (orders list, home "recent orders"). */
export function OrderCard({ order, className }: { order: OrderSummary; className?: string }) {
  const docs = `${order.document_count} document${order.document_count === 1 ? "" : "s"}`;
  return (
    <Link
      to={`/student/orders/${order.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-3xl bg-background p-4 shadow-soft ring-1 ring-border/60 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lift",
        "focus-visible:outline-2 focus-visible:outline-primary",
        className,
      )}
    >
      <IconTile icon={FileStack} tone={statusKind(order.status) === "progress" ? "orange" : "violet"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display font-bold text-navy">{order.code}</p>
        </div>
        <p className="truncate text-xs text-muted">
          {formatDate(order.created_at)} · {docs}
          {order.slot_date && ` · delivery ${formatDate(order.slot_date)}`}
        </p>
        <OrderStatusPill status={order.status} className="mt-2" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {order.total && <span className="font-display text-base font-bold text-navy tabular">{rupees(order.total)}</span>}
        <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
