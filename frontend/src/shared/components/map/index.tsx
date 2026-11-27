import { lazy, Suspense } from "react";
import { MapArt } from "@/shared/components/illustrations";
import { EmptyState, Skeleton } from "@/shared/components/ui/states";
import { cn } from "@/shared/utils/cn";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: "college" | "shop" | "drop" | "rider";
  detail?: string;
  /** Google Maps link for turn-by-turn navigation. */
  href?: string | null;
  /** Short text/emoji drawn in the pin instead of the kind's default glyph (e.g. a stop number). */
  badge?: string;
}

const LeafletMap = lazy(() => import("@/shared/components/map/LeafletMap"));

/** Parses API coordinates (strings or numbers); returns null when missing or not finite. */
export function coords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === "" || lng === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}

/**
 * Interactive map (Leaflet + CARTO Voyager tiles over OpenStreetMap data). Lazy-loaded so it only costs bytes
 * on pages that show a map. Shows an empty state when no point has coordinates.
 */
export function MapView({
  points, route, activeId, onSelect, className, emptyHint,
}: {
  points: MapPoint[];
  route?: boolean;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  emptyHint?: string;
}) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-3xl bg-surface ring-1 ring-border", className ?? "h-72")}>
      {points.length === 0 ? (
        <EmptyState compact art={MapArt} title="Nothing on the map yet" hint={emptyHint ?? "Locations appear here once they have coordinates."} className="h-full" />
      ) : (
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <LeafletMap points={points} route={route} activeId={activeId} onSelect={onSelect} />
        </Suspense>
      )}
    </div>
  );
}
