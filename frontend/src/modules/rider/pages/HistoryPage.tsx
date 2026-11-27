import { useMemo, useState } from "react";
import { Camera, ImageOff, Package, Search } from "lucide-react";
import { useHistory } from "@/modules/rider/api";
import type { HistoryItem } from "@/modules/rider/api/types";
import { ScooterArt, SearchArt } from "@/shared/components/illustrations";
import { StatusPill } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, PageHeader } from "@/shared/components/ui/card";
import { Modal } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Stagger, StaggerItem } from "@/shared/components/ui/motion";
import { EmptyState, ErrorState, ListSkeleton } from "@/shared/components/ui/states";
import { ChipFilter } from "@/shared/components/ui/tabs";
import { formatDateTime, rupees } from "@/shared/utils/format";

type Filter = "all" | "unpaid" | "paid" | "empty";

const MATCH: Record<Filter, (h: HistoryItem) => boolean> = {
  all: () => true,
  unpaid: (h) => h.status === "completed" && !h.settled,
  paid: (h) => h.settled,
  empty: (h) => h.status === "cancelled",
};

export function HistoryPage() {
  const q = useHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<HistoryItem | null>(null);

  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((h) => MATCH[filter](h) && (!s || h.code.toLowerCase().includes(s)));
  }, [q.data, filter, search]);

  const count = (f: Filter) => (q.data ?? []).filter(MATCH[f]).length;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Delivery Partner" title="Run history" subtitle="Every run you've finished, with its payout and shelf photo." />

      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data!.length === 0 ? (
        <EmptyState art={ScooterArt} title="No completed runs yet" hint="Finished deliveries appear here." />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="sm:w-72">
              <Input icon={Search} type="search" aria-label="Search by batch code" placeholder="Search batch code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ChipFilter<Filter>
              label="Filter runs"
              value={filter}
              onChange={setFilter}
              items={[
                { value: "all", label: `All · ${count("all")}` },
                { value: "unpaid", label: `Awaiting payout · ${count("unpaid")}` },
                { value: "paid", label: `Paid out · ${count("paid")}` },
                { value: "empty", label: `Closed empty · ${count("empty")}` },
              ]}
            />
          </div>

          {items.length === 0 ? (
            <EmptyState compact art={SearchArt} title="No runs match" hint="Try a different filter or batch code." action={<Button variant="outline" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</Button>} />
          ) : (
            <Stagger className="grid gap-3 md:grid-cols-2">
              {items.map((h) => (
                <StaggerItem key={h.id}>
                  <HistoryCard h={h} onPhoto={() => setPhoto(h)} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}

      <Modal open={!!photo} onOpenChange={(o) => !o && setPhoto(null)} title={`Shelf photo · ${photo?.code ?? ""}`} description={photo?.completed_at ? formatDateTime(photo.completed_at) : undefined}>
        {photo?.shelf_photo_url && (
          <div className="overflow-hidden rounded-3xl bg-navy">
            <img src={photo.shelf_photo_url} alt={`Shelf photo for batch ${photo.code}`} className="max-h-[60vh] w-full object-contain" />
          </div>
        )}
      </Modal>
    </div>
  );
}

function HistoryCard({ h, onPhoto }: { h: HistoryItem; onPhoto: () => void }) {
  const empty = h.status === "cancelled";
  return (
    <Card pad="sm" className="flex gap-4">
      {h.shelf_photo_url ? (
        <button
          type="button"
          onClick={onPhoto}
          aria-label={`View shelf photo for ${h.code}`}
          className="group relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface focus-visible:outline-2 focus-visible:outline-primary"
        >
          <img src={h.shelf_photo_url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
          <span className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-lg bg-navy/70 text-white">
            <Camera className="size-3.5" aria-hidden />
          </span>
        </button>
      ) : (
        <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-surface text-muted">
          {empty ? <Package className="size-7" aria-hidden /> : <ImageOff className="size-7" aria-hidden />}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display font-bold text-navy">{h.code}</p>
          <p className="font-display font-bold text-navy tabular">{h.payout ? rupees(h.payout) : "—"}</p>
        </div>
        <p className="text-sm text-muted">
          {h.completed_at ? formatDateTime(h.completed_at) : "—"} · {h.packet_count} packet{h.packet_count === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {empty ? (
            <StatusPill kind="cancelled">Closed empty</StatusPill>
          ) : (
            <StatusPill kind="done">Delivered</StatusPill>
          )}
          {!empty && (h.settled ? <StatusPill kind="done">Paid out</StatusPill> : <StatusPill kind="waiting">Awaiting payout</StatusPill>)}
        </div>
      </div>
    </Card>
  );
}
