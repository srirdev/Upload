import { useMemo, useState, type ReactNode } from "react";
import { Building2, GraduationCap, MapPin, Package, Printer, ShieldCheck } from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import type { AdminShop, College, CustodyRow } from "@/modules/admin/api/types";
import { ExternalLink, QueryBoundary, approvalKind, humanize, mapsLink } from "@/modules/admin/components/common";
import { ShopPanel } from "@/modules/admin/components/ShopPanel";
import { MapArt } from "@/shared/components/illustrations";
import { MapView, coords, type MapPoint } from "@/shared/components/map";
import { IconTile, StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/utils/cn";

/**
 * Delivery network map: colleges (drop points) and printing shops, filterable by college.
 * Pins and list are linked: selecting either highlights the other. Live in-flight counts come from /ops/custody.
 */
export function MapPage() {
  const colleges = useAdminGet<College[]>("/colleges");
  const shops = useAdminGet<AdminShop[]>("/shops");
  const custody = useAdminGet<CustodyRow[]>("/ops/custody", { refetchInterval: 15_000 });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Network" title="Delivery map" subtitle="Every college drop point and printing shop. Pick a college to see the shops that serve it." />
      <QueryBoundary query={colleges} loader="dashboard">
        {(cs) => (
          <QueryBoundary query={shops} loader="dashboard">
            {(ss) => <MapBody colleges={cs} shops={ss} custody={custody.data ?? []} />}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}

function MapBody({ colleges, shops, custody }: { colleges: College[]; shops: AdminShop[]; custody: CustodyRow[] }) {
  const [college, setCollege] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [openShop, setOpenShop] = useState<string | null>(null);

  const collegeName = colleges.find((c) => c.id === college)?.name;
  const visibleColleges = college ? colleges.filter((c) => c.id === college) : colleges;
  const visibleShops = collegeName ? shops.filter((s) => s.colleges.includes(collegeName)) : shops.filter((s) => s.status !== "rejected");

  const inFlight = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of custody) {
      m.set(`c:${r.college}`, (m.get(`c:${r.college}`) ?? 0) + 1);
      if (r.shop) m.set(`s:${r.shop}`, (m.get(`s:${r.shop}`) ?? 0) + 1);
    }
    return m;
  }, [custody]);

  const points: MapPoint[] = [
    ...visibleColleges.flatMap((c) => {
      const p = coords(c.latitude, c.longitude);
      return p ? [{ id: c.id, ...p, label: c.name, kind: "college" as const, detail: `${c.security_cabin} · ${inFlight.get(`c:${c.name}`) ?? 0} orders in flight`, href: mapsLink(p.lat, p.lng) }] : [];
    }),
    ...visibleShops.flatMap((s) => {
      const p = coords(s.latitude, s.longitude);
      return p ? [{ id: s.id, ...p, label: s.shop_name, kind: "shop" as const, detail: `${s.area} · ${humanize(s.status)}${s.status === "approved" ? (s.is_open ? " · open" : " · closed") : ""}`, href: mapsLink(p.lat, p.lng) }] : [];
    }),
  ];
  const missing = visibleColleges.length + visibleShops.length - points.length;
  const shop = shops.find((s) => s.id === openShop);

  if (colleges.length === 0 && shops.length === 0)
    return <EmptyState art={MapArt} title="Nothing to map yet" hint="Add colleges and approve shops to build the delivery network." />;

  return (
    <>
      <ChipFilter
        label="College"
        value={college}
        onChange={(v) => { setCollege(v); setActive(v || null); }}
        items={[{ value: "", label: "All colleges" }, ...colleges.map((c) => ({ value: c.id, label: c.name }))]}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <Card pad="none" className="overflow-hidden">
          <MapView className="h-[28rem] rounded-none ring-0 md:h-[36rem]" points={points} activeId={active} onSelect={setActive} emptyHint="None of these places has coordinates yet." />
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3 text-xs text-ink-2">
            <Legend color="bg-primary" label="College drop point" />
            <Legend color="bg-orange" label="Printing shop" />
            {missing > 0 && <span className="ml-auto text-muted">{missing} without coordinates (not shown)</span>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card pad="default" className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-navy"><GraduationCap className="size-4 text-primary" aria-hidden /> Colleges ({visibleColleges.length})</h2>
            <ul className="space-y-2">
              {visibleColleges.map((c) => (
                <li key={c.id}>
                  <PlaceButton active={active === c.id} onClick={() => setActive(c.id)} icon={ShieldCheck} tone="violet" title={c.name} detail={c.security_cabin}
                    extra={<span className="text-xs font-semibold text-ink-2 tabular">{inFlight.get(`c:${c.name}`) ?? 0} live</span>} />
                </li>
              ))}
            </ul>
          </Card>
          <Card pad="default" className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-navy"><Printer className="size-4 text-orange-ink" aria-hidden /> Shops ({visibleShops.length})</h2>
            {visibleShops.length === 0 ? (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">{collegeName ? `No shop serves ${collegeName} yet.` : "No shops yet."}</p>
            ) : (
              <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {visibleShops.map((s) => (
                  <li key={s.id}>
                    <PlaceButton
                      active={active === s.id}
                      onClick={() => setActive(s.id)}
                      icon={Building2}
                      tone="orange"
                      title={s.shop_name}
                      detail={s.area}
                      extra={<StatusPill kind={s.status === "approved" ? (s.is_open ? "done" : "cancelled") : approvalKind(s.status)}>{s.status === "approved" ? (s.is_open ? "Open" : "Closed") : humanize(s.status)}</StatusPill>}
                    />
                    {active === s.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl bg-orange-soft/60 px-3 py-2 text-sm">
                        <span className="inline-flex items-center gap-1 text-ink-2"><Package className="size-4" aria-hidden />{inFlight.get(`s:${s.shop_name}`) ?? 0} orders in flight</span>
                        <ExternalLink href={mapsLink(s.latitude, s.longitude)}><MapPin className="size-3.5" aria-hidden /> Directions</ExternalLink>
                        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpenShop(s.id)}>Manage</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {shop && <ShopPanel key={shop.id} shop={shop} onClose={() => setOpenShop(null)} />}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("size-3 rounded-full", color)} aria-hidden />{label}</span>;
}

function PlaceButton({
  active, onClick, icon, tone, title, detail, extra,
}: { active: boolean; onClick: () => void; icon: typeof Printer; tone: "violet" | "orange"; title: string; detail: string; extra?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-2.5 text-left ring-1 transition-colors",
        active ? "bg-primary-soft ring-primary" : "bg-background ring-border hover:ring-primary/40",
      )}
    >
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-navy">{title}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
      {extra}
    </button>
  );
}
