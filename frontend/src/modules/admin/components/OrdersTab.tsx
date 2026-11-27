import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { qs, useAdminGet } from "@/modules/admin/api";
import type { AdminShop, College, OrderRow } from "@/modules/admin/api/types";
import { DataTable, Pager, QueryBoundary, SearchInput, humanize, orderKind, paymentKind } from "@/modules/admin/components/common";
import { OrderPanel } from "@/modules/admin/components/OrderPanel";
import { SearchArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Select } from "@/shared/components/ui/fields";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { formatDate, rupees } from "@/shared/utils/format";

const LIMIT = 25;
const STATUSES = ["placed", "accepted", "printing", "packing", "handover_verified", "out_for_delivery", "delivered", "collected", "cancelled", "rejected"];

/** Debounce a fast-changing value (search box) so we don't query on every keystroke. */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function OrdersTab() {
  const [q, setQ] = useState("");
  const [college, setCollege] = useState("");
  const [shop, setShop] = useState("");
  const [slot, setSlot] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const search = useDebounced(q);

  const colleges = useAdminGet<College[]>("/colleges");
  const shops = useAdminGet<AdminShop[]>("/shops");
  const slots = colleges.data?.find((c) => c.id === college)?.slots ?? [];
  const orders = useAdminGet<OrderRow[]>(
    `/orders${qs({ q: search.trim(), college_id: college, shop_id: shop, slot_id: slot, status, limit: LIMIT, offset })}`,
  );
  const reset = (fn: () => void) => { fn(); setOffset(0); };
  const filtered = !!(q || college || shop || slot || status);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
        <SearchInput label="Search orders" placeholder="Order ID, student name, mobile or register no." value={q} onChange={(v) => reset(() => setQ(v))} />
        <Select aria-label="College" value={college} onChange={(e) => reset(() => { setCollege(e.target.value); setSlot(""); })}>
          <option value="">All colleges</option>
          {colleges.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Shop" value={shop} onChange={(e) => reset(() => setShop(e.target.value))}>
          <option value="">All shops</option>
          {shops.data?.map((s) => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
        </Select>
        <Select aria-label="Delivery slot" value={slot} disabled={!college} onChange={(e) => reset(() => setSlot(e.target.value))}>
          <option value="">{college ? "All slots" : "Pick a college for slots"}</option>
          {slots.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.delivery_time}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <ChipFilter
            label="Order status"
            value={status}
            onChange={(v) => reset(() => setStatus(v))}
            items={[{ value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: humanize(s) }))]}
          />
        </div>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => reset(() => { setQ(""); setCollege(""); setShop(""); setSlot(""); setStatus(""); })}>
            <X className="size-4" /> Clear filters
          </Button>
        )}
      </div>

      <QueryBoundary query={orders}>
        {(rows) => (
          <>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpen(r.id)}
              rowLabel={(r) => `Open order ${r.code}`}
              empty={{ title: filtered ? "No orders match these filters" : "No orders yet", hint: filtered ? "Try a different search or clear the filters." : "Paid orders show up here.", art: SearchArt }}
              columns={[
                { header: "Order", primary: true, cell: (r) => r.code },
                { header: "Student", cell: (r) => <><span className="font-medium text-navy">{r.student_name ?? "—"}</span><span className="block text-xs text-muted">{r.student_mobile}</span></> },
                { header: "College", cell: (r) => r.college },
                { header: "Shop", cell: (r) => r.shop ?? <span className="text-muted">Unassigned</span> },
                { header: "Delivery", cell: (r) => (r.slot_date ? formatDate(r.slot_date) : "—") },
                { header: "Status", cell: (r) => <StatusPill kind={orderKind(r.status)}>{humanize(r.status)}</StatusPill> },
                { header: "Payment", cell: (r) => <StatusPill kind={paymentKind(r.payment_status)}>{humanize(r.payment_status)}</StatusPill> },
                { header: "Total", cell: (r) => <span className="font-semibold tabular">{r.total ? rupees(r.total) : "—"}</span>, className: "text-right" },
              ]}
            />
            {(rows.length === LIMIT || offset > 0) && <Pager offset={offset} limit={LIMIT} count={rows.length} onChange={setOffset} />}
          </>
        )}
      </QueryBoundary>
      {open && <OrderPanel orderId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
