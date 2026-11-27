import { useState } from "react";
import { Clock, MapPin, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useAdminGet } from "@/modules/admin/api";
import type { College } from "@/modules/admin/api/types";
import { CollegeForm, SlotRow } from "@/modules/admin/components/CollegeForm";
import { ExternalLink, QueryBoundary, mapsLink } from "@/modules/admin/components/common";
import { CampusArt } from "@/shared/components/illustrations";
import { MapView, coords, type MapPoint } from "@/shared/components/map";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { EmptyState } from "@/shared/components/ui/states";

export function CollegesPage() {
  const colleges = useAdminGet<College[]>("/colleges");
  const [editing, setEditing] = useState<College | "new" | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network"
        title="Colleges and slots"
        subtitle="Where we deliver and when. Each slot has a cut-off and a daily capacity."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add college</Button>}
      />
      <QueryBoundary query={colleges} loader="dashboard">
        {(list) => {
          if (list.length === 0)
            return (
              <EmptyState
                art={CampusArt}
                title="No colleges yet"
                hint="Add a college and its delivery slots so students can place orders."
                action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add the first college</Button>}
              />
            );
          const points: MapPoint[] = list.flatMap((c) => {
            const p = coords(c.latitude, c.longitude);
            return p ? [{ id: c.id, ...p, label: c.name, kind: "college" as const, detail: c.security_cabin, href: mapsLink(p.lat, p.lng) }] : [];
          });
          return (
            <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
              <Stagger className="space-y-5">
                {list.map((c) => (
                  <StaggerItem key={c.id}>
                    <Card pad="lg" className={focus === c.id ? "ring-2 ring-primary" : undefined}>
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-xl font-bold text-navy">{c.name}</h2>
                            <StatusPill kind={c.active ? "done" : "cancelled"}>{c.active ? "Active" : "Inactive"}</StatusPill>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                            {c.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{c.city}</span>}
                            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" aria-hidden />{c.security_cabin}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{c.slots.filter((s) => s.active).length} active slot{c.slots.filter((s) => s.active).length === 1 ? "" : "s"}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {coords(c.latitude, c.longitude) && <ExternalLink href={mapsLink(c.latitude!, c.longitude!)}>Map</ExternalLink>}
                          <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="size-4" /> Edit details</Button>
                        </div>
                      </div>
                      {(c.drop_instructions || c.collection_instructions) && (
                        <div className="mb-4 grid gap-3 sm:grid-cols-2">
                          {c.drop_instructions && <Note label="Drop (riders and shops)" text={c.drop_instructions} />}
                          {c.collection_instructions && <Note label="Collection (students)" text={c.collection_instructions} />}
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto] gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
                          <span>Label</span><span>Delivery time</span><span>Cut-off (min before)</span><span>Capacity / day</span><span>Active</span><span />
                        </div>
                        {c.slots.map((s) => <SlotRow key={s.id} collegeId={c.id} slot={s} />)}
                        <SlotRow key={`new-${c.slots.length}`} collegeId={c.id} />
                      </div>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
              <div className="xl:sticky xl:top-24 xl:self-start">
                <Card pad="default" className="space-y-3">
                  <h2 className="font-display text-lg font-bold text-navy">Campus map</h2>
                  <MapView className="h-80" points={points} activeId={focus} onSelect={setFocus} emptyHint="Add coordinates to a college to see it here." />
                  <p className="text-xs text-muted">{points.length} of {list.length} colleges have coordinates. Click a pin to highlight its card.</p>
                </Card>
              </div>
            </div>
          );
        }}
      </QueryBoundary>
      {editing && <CollegeForm key={editing === "new" ? "new" : editing.id} college={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 text-sm">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="text-ink-2">{text}</p>
    </div>
  );
}
