import { useMemo, useState } from "react";
import { CircleCheck, Clock3, Printer, Store } from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import type { AdminShop } from "@/modules/admin/api/types";
import { DataTable, Panel, QueryBoundary, SearchInput, approvalKind, humanize, serviceLabel } from "@/modules/admin/components/common";
import { PendingShopCard, ShopPanel } from "@/modules/admin/components/ShopPanel";
import { PrinterArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { PageHeader } from "@/shared/components/ui/card";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { StatTile } from "@/shared/components/ui/stat";
import { ChipFilter } from "@/shared/components/ui/tabs";

type Filter = "" | AdminShop["status"];

export function ShopsPage() {
  const all = useAdminGet<AdminShop[]>("/shops");
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Partners" title="Printing shops" subtitle="Approve registrations, manage college zones and keep an eye on quality." />
      <QueryBoundary query={all} loader="dashboard">
        {(shops) => <ShopsBody shops={shops} q={q} setQ={setQ} status={status} setStatus={setStatus} onSelect={setSelected} selected={selected} />}
      </QueryBoundary>
    </div>
  );
}

function ShopsBody({
  shops, q, setQ, status, setStatus, onSelect, selected,
}: {
  shops: AdminShop[]; q: string; setQ: (v: string) => void; status: Filter; setStatus: (v: Filter) => void;
  onSelect: (id: string | null) => void; selected: string | null;
}) {
  const pending = shops.filter((s) => s.status === "pending");
  const approved = shops.filter((s) => s.status === "approved");
  const current = shops.find((s) => s.id === selected);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return shops.filter((s) =>
      (!status || s.status === status)
      && (!needle || `${s.shop_name} ${s.owner_name} ${s.area} ${s.colleges.join(" ")}`.toLowerCase().includes(needle)));
  }, [shops, q, status]);

  return (
    <>
      <Stagger className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StaggerItem><StatTile label="Registered shops" value={shops.length} icon={Store} /></StaggerItem>
        <StaggerItem><StatTile label="Approved" value={approved.length} icon={CircleCheck} tone="mint" /></StaggerItem>
        <StaggerItem><StatTile label="Open right now" value={approved.filter((s) => s.is_open).length} icon={Printer} tone="orange" /></StaggerItem>
        <StaggerItem><StatTile label="Awaiting review" value={pending.length} icon={Clock3} tone="sun" /></StaggerItem>
      </Stagger>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-navy">Registrations to review ({pending.length})</h2>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{pending.map((s) => <PendingShopCard key={s.id} shop={s} />)}</div>
        </section>
      )}

      <Panel
        title="All shops"
        actions={<SearchInput className="w-full sm:w-72" label="Search shops" placeholder="Shop, owner, area or college" value={q} onChange={setQ} />}
      >
        <ChipFilter<Filter>
          label="Shop status"
          value={status}
          onChange={setStatus}
          items={[{ value: "", label: `All (${shops.length})` }, ...(["approved", "pending", "suspended", "rejected"] as const).map((s) => ({ value: s, label: humanize(s) }))]}
        />
        <DataTable
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={(s) => onSelect(s.id)}
          rowLabel={(s) => `Open ${s.shop_name}`}
          empty={{ title: shops.length ? "No shops match" : "No shops have registered yet", hint: shops.length ? "Try a different search." : "Shops register at /shop/login.", art: PrinterArt }}
          columns={[
            { header: "Shop", primary: true, cell: (s) => <>{s.shop_name}<span className="block text-xs font-normal text-muted">{s.owner_name}</span></> },
            { header: "Area", cell: (s) => s.area },
            { header: "Colleges", cell: (s) => (s.colleges.length ? s.colleges.join(", ") : <span className="text-muted">None</span>) },
            { header: "Services", cell: (s) => <Services codes={s.services} /> },
            { header: "Status", cell: (s) => <StatusPill kind={approvalKind(s.status)}>{humanize(s.status)}</StatusPill> },
            {
              header: "Open",
              cell: (s) => (s.status === "approved" ? <StatusPill kind={s.is_open ? "done" : "cancelled"} live={s.is_open}>{s.is_open ? "Open" : "Closed"}</StatusPill> : <span className="text-muted">—</span>),
            },
          ]}
        />
      </Panel>
      {current && <ShopPanel key={current.id} shop={current} onClose={() => onSelect(null)} />}
    </>
  );
}

/** Printing services on the first line, binding below. */
function Services({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="text-muted">None</span>;
  const print = codes.filter((c) => c.startsWith("print_")).map(serviceLabel);
  const binding = codes.filter((c) => !c.startsWith("print_")).map(serviceLabel);
  return (
    <>
      <span className="block">{print.join(", ") || <span className="text-muted">No printing</span>}</span>
      <span className="block text-xs text-muted">{binding.length ? `Binding: ${binding.join(", ")}` : "No binding"}</span>
    </>
  );
}
