import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type MapPoint = { lat: number; lon: number; count: number; label: string };

export function LandingMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;

    // Leaflet reads `window` while its module is loaded, so it must only be
    // imported in the browser. A top-level import breaks TanStack Start SSR.
    void import("leaflet").then((L) => {
      if (!active || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [-15.5, -47.9],
        zoom: 3,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !mapReady) return;
    const layer = L.layerGroup().addTo(map);
    const markers: import("leaflet").CircleMarker[] = [];
    for (const point of points) {
      const radius = Math.max(4, Math.min(24, 6 + Math.log2(point.count + 1) * 5));
      const marker = L.circleMarker([point.lat, point.lon], {
        radius,
        color: "#8b5cf6",
        weight: 1.5,
        fillColor: "#a78bfa",
        fillOpacity: 0.7,
      }).bindPopup(
        `<b>${escapeHtml(point.label)}</b><br/>${point.count} ${point.count === 1 ? "interação" : "interações"}`,
      );
      marker.addTo(layer);
      markers.push(marker);
    }
    if (markers.length) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
      }
    }
    return () => {
      layer.remove();
    };
  }, [mapReady, points]);

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full rounded-xl"
      aria-label="Mapa de localização dos usuários"
    />
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}
