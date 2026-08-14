import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { lat: number; lon: number; count: number; label: string };

export function LandingMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      center: [-15.5, -47.9],
      zoom: 3,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const markers: L.CircleMarker[] = [];
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
  }, [points]);

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
