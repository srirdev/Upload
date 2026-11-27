import L from "leaflet";
import { Bike, GraduationCap, Package, Printer, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { MapPoint } from "@/shared/components/map";

const KINDS: Record<MapPoint["kind"], { bg: string; fg: string; icon: LucideIcon }> = {
  college: { bg: "#6d28d9", fg: "#ffffff", icon: GraduationCap },
  shop: { bg: "#f2690d", fg: "#140f3c", icon: Printer },
  drop: { bg: "#14b86e", fg: "#140f3c", icon: Package },
  rider: { bg: "#140f3c", fg: "#ffffff", icon: Bike },
};
const glyphs = new Map<string, string>();
const glyph = (kind: MapPoint["kind"], px: number) => {
  const k = `${kind}-${px}`;
  if (!glyphs.has(k)) {
    const { icon: I, fg } = KINDS[kind];
    glyphs.set(k, renderToStaticMarkup(<I size={px} color={fg} strokeWidth={2.4} />));
  }
  return glyphs.get(k)!;
};

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function icon(p: MapPoint, active: boolean) {
  const c = KINDS[p.kind];
  const size = active ? 46 : 38;
  const inner = p.badge
    ? `<span style="transform:rotate(45deg);font:800 ${active ? 17 : 14}px Inter Variable,sans-serif;color:${c.fg}">${escape(p.badge)}</span>`
    : `<span style="transform:rotate(45deg);display:flex">${glyph(p.kind, active ? 20 : 17)}</span>`;
  return L.divIcon({
    className: "",
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -size],
    html: `<div style="position:relative;width:${size}px;height:${size + 8}px;filter:drop-shadow(0 6px 10px rgb(20 15 60 / .28))">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:${c.bg};border:3px solid #fff;display:flex;align-items:center;justify-content:center">
        ${inner}
      </div></div>`,
  });
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 15);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function LeafletMap({
  points, route, activeId, onSelect,
}: { points: MapPoint[]; route?: boolean; activeId?: string | null; onSelect?: (id: string) => void }) {
  const center: [number, number] = points.length ? [points[0]!.lat, points[0]!.lng] : [13.0827, 80.2707];
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={points} />
      {route && points.length > 1 && (
        <Polyline positions={points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#6d28d9", weight: 4, opacity: 0.75, dashArray: "2 10", lineCap: "round" }} />
      )}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p, p.id === activeId)} eventHandlers={{ click: () => onSelect?.(p.id) }} keyboard title={p.label}>
          <Tooltip direction="top" offset={[0, -36]}>{p.label}</Tooltip>
          {(p.detail || p.href) && (
            <Popup>
              <p style={{ fontWeight: 700, marginBottom: 2 }}>{p.label}</p>
              {p.detail && <p style={{ color: "#6a6488", margin: 0 }}>{p.detail}</p>}
              {p.href && (
                <a href={p.href} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 600 }}>
                  Open in Google Maps
                </a>
              )}
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
