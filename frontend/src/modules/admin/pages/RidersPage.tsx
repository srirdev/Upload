import { useMemo, useState } from "react";
import { Bike, Clock3, Radio, UserCheck } from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import type { AdminRider, Batch } from "@/modules/admin/api/types";
import { AssignRiderDialog } from "@/modules/admin/components/AssignDialogs";
import {
  DataTable, ExternalLink, Panel, QueryBoundary, SearchInput, approvalKind, batchKind, humanize,
} from "@/modules/admin/components/common";
import { KycCard, RiderPanel } from "@/modules/admin/components/RiderPanel";
import { ScooterArt } from "@/shared/components/illustrations";
import { Avatar, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/card";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { StatTile } from "@/shared/components/ui/stat";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { formatDate, rupees } from "@/shared/utils/format";

const ASSIGNABLE = ["unassigned", "offered", "accepted"];
const BATCH_STATUSES = ["unassigned", "offered", "accepted", "out_for_delivery", "completed", "cancelled"];
type Filter = "" | "online" | AdminRider["kyc_status"];

export function RidersPage() {
  const riders = useAdminGet<AdminRider[]>("/riders");
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Partners" title="Delivery partners" subtitle="Verify KYC, assign college zones and keep every run covered." />
      <QueryBoundary query={riders} loader="dashboard">
        {(all) => {
          const pending = all.filter((r) => r.kyc_status === "pending");
          const approved = all.filter((r) => r.kyc_status === "approved");
          const current = all.find((r) => r.id === selected);
          const needle = q.trim().toLowerCase();
          const rows = all.filter((r) =>
            (!filter || (filter === "online" ? r.kyc_status === "approved" && r.is_online : r.kyc_status === filter))
            && (!needle || `${r.full_name} ${r.vehicle_number} ${r.base_area}`.toLowerCase().includes(needle)));
          return (
            <>
              <Stagger className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StaggerItem><StatTile label="Registered riders" value={all.length} icon={Bike} /></StaggerItem>
                <StaggerItem><StatTile label="KYC approved" value={approved.length} icon={UserCheck} tone="mint" /></StaggerItem>
                <StaggerItem><StatTile label="Online now" value={approved.filter((r) => r.is_online).length} icon={Radio} tone="orange" /></StaggerItem>
                <StaggerItem><StatTile label="KYC to review" value={pending.length} icon={Clock3} tone="sun" /></StaggerItem>
              </Stagger>

              {pending.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-display text-lg font-bold text-navy">KYC to review ({pending.length})</h2>
                  <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{pending.map((r) => <KycCard key={r.id} rider={r} />)}</div>
                </section>
              )}

              <Panel
                title="All delivery partners"
                actions={<SearchInput className="w-full sm:w-72" label="Search riders" placeholder="Name, vehicle or area" value={q} onChange={setQ} />}
              >
                <ChipFilter<Filter>
                  label="Rider filter"
                  value={filter}
                  onChange={setFilter}
                  items={[{ value: "", label: `All (${all.length})` }, { value: "online", label: "Online" }, { value: "approved", label: "Approved" }, { value: "pending", label: "Pending" }, { value: "rejected", label: "Rejected" }]}
                />
                <DataTable
                  rows={rows}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setSelected(r.id)}
                  rowLabel={(r) => `Open ${r.full_name}`}
                  empty={{ title: all.length ? "No riders match" : "No delivery partners have registered yet", hint: all.length ? "Try a different search." : "Riders register at /rider/login.", art: ScooterArt }}
                  columns={[
                    { header: "Name", primary: true, cell: (r) => <span className="inline-flex items-center gap-2.5"><Avatar name={r.full_name} className="size-8 text-xs" />{r.full_name}</span> },
                    { header: "Vehicle", cell: (r) => r.vehicle_number },
                    { header: "KYC", cell: (r) => <StatusPill kind={approvalKind(r.kyc_status)}>{humanize(r.kyc_status)}</StatusPill> },
                    { header: "Availability", cell: (r) => (r.kyc_status === "approved" ? <StatusPill kind={r.is_online ? "done" : "cancelled"} live={r.is_online}>{r.is_online ? "Online" : "Offline"}</StatusPill> : <span className="text-muted">—</span>) },
                    { header: "Primary zones", cell: (r) => (r.primary_colleges.join(", ") || <span className="text-muted">—</span>) },
                    { header: "Backup zones", cell: (r) => (r.backup_colleges.join(", ") || <span className="text-muted">—</span>) },
                  ]}
                />
              </Panel>
              {current && <RiderPanel key={current.id} rider={current} onClose={() => setSelected(null)} />}
            </>
          );
        }}
      </QueryBoundary>
      <RunsSection />
    </div>
  );
}

function RunsSection() {
  const [status, setStatus] = useState("");
  const [assign, setAssign] = useState<string | null>(null);
  const runs = useAdminGet<Batch[]>(`/batches${status ? `?status=${status}` : ""}`, { refetchInterval: 15_000 });
  const items = useMemo(() => [{ value: "", label: "All runs" }, ...BATCH_STATUSES.map((s) => ({ value: s, label: humanize(s) }))], []);
  return (
    <Panel title="Delivery runs" subtitle="Latest 100 runs. Unassigned runs need a rider before the slot.">
      <ChipFilter label="Run status" value={status} onChange={setStatus} items={items} />
      <QueryBoundary query={runs}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(b) => b.id}
            highlight={(b) => b.status === "unassigned"}
            empty={{ title: "No runs", hint: "Runs are created as paid orders are batched per college and slot.", art: ScooterArt }}
            columns={[
              { header: "Run", primary: true, cell: (b) => <><span className="font-semibold text-navy">{b.code}</span><span className="block text-xs text-muted">{humanize(b.mode)}</span></> },
              { header: "College", cell: (b) => <>{b.college}<span className="block text-xs text-muted">{formatDate(b.slot_date)}</span></> },
              { header: "Rider", cell: (b) => b.rider ?? <span className="text-muted">Unassigned</span> },
              { header: "Packets", cell: (b) => <span className="tabular">{b.packets}</span> },
              { header: "Status", cell: (b) => <StatusPill kind={batchKind(b.status)}>{humanize(b.status)}</StatusPill> },
              { header: "Payout", cell: (b) => (b.payout_total ? <span className="font-semibold tabular">{rupees(b.payout_total)}</span> : "—") },
              {
                header: "Actions",
                cell: (b) => (
                  <div className="flex flex-wrap items-center gap-3">
                    {b.mode === "consolidated" && ASSIGNABLE.includes(b.status) && (
                      <Button size="sm" variant={b.status === "unassigned" ? "accent" : "outline"} onClick={() => setAssign(b.id)}>Assign rider</Button>
                    )}
                    {b.shelf_photo_url && <ExternalLink href={b.shelf_photo_url}>Shelf photo</ExternalLink>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </QueryBoundary>
      {assign && <AssignRiderDialog batchId={assign} onClose={() => setAssign(null)} />}
    </Panel>
  );
}
