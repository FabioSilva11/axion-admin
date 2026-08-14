/**
 * Analytics do site/landing (página do APK).
 *
 * Este módulo é server-only: recebe eventos do navegador, resolve a
 * localização pelo IP (geolocalização gratuita via ipwho.is), grava no
 * Firebase Realtime Database e agrega os dados para o painel admin.
 */
import { rtdbGet, rtdbPut, rtdbTransaction } from "./firebase.server";

export const DOWNLOAD_EVENTS: ReadonlySet<string> = new Set([
  "download",
  "download_click",
  "apk_click",
  "download_conversion",
]);

const MAX_EVENTS_PER_DAY = 8_000;
const MAX_LABEL_LENGTH = 160;
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_WINDOW_MS = 60_000;
const GEO_TTL_MS = 12 * 60 * 60 * 1_000;
const NEGATIVE_GEO_TTL_MS = 60 * 60 * 1_000;

type GeoInfo = {
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
};

type JsonMap = Record<string, unknown>;

const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

function isObject(value: unknown): value is JsonMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("::ffff:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8")) return true;
    return false;
  }
  const parts = ip.split(".");
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (first === 10 || first === 127 || first === 0) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  return false;
}

const geoCache = new Map<string, GeoInfo | null>();
const negativeCache = new Map<string, number>();

export async function geolocateIp(ip: string): Promise<GeoInfo | null> {
  const clean = ip.trim();
  if (!clean || isPrivateIp(clean)) return null;
  if (geoCache.has(clean)) return geoCache.get(clean) ?? null;
  const negativeSince = negativeCache.get(clean);
  if (negativeSince && Date.now() - negativeSince < NEGATIVE_GEO_TTL_MS) return null;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(clean)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      negativeCache.set(clean, Date.now());
      return null;
    }
    const data = (await response.json()) as JsonMap;
    if (data["success"] !== true) {
      negativeCache.set(clean, Date.now());
      return null;
    }
    const lat = Number(data["latitude"]);
    const lon = Number(data["longitude"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const geo: GeoInfo = {
      country: text(data["country"], "Desconhecido").slice(0, 120),
      countryCode: text(data["country_code"], "??").slice(0, 8),
      region: text(data["region"]).slice(0, 120),
      city: text(data["city"]).slice(0, 120),
      lat,
      lon,
    };
    geoCache.set(clean, geo);
    return geo;
  } catch {
    negativeCache.set(clean, Date.now());
    return null;
  }
}

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`axion-analytics:${ip}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const rateBuckets = new Map<string, number[]>();

function allowEvent(ip: string): boolean {
  const now = Date.now();
  const key = ip.trim() || "unknown";
  const times = (rateBuckets.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(key, times);
    return false;
  }
  times.push(now);
  rateBuckets.set(key, times);
  return true;
}

export type LandingTrackInput = {
  event: string;
  path: string;
  referrer: string;
  locale: string;
  screen: string;
  ua: string;
  ts: number;
  visitorId: string;
};

export async function recordLandingEvent(
  input: LandingTrackInput,
  clientIp: string,
): Promise<{ ok: boolean; reason?: string }> {
  const event = text(input["event"]).slice(0, 80);
  if (!event) return { ok: false, reason: "missing_event" };
  if (!allowEvent(clientIp)) return { ok: false, reason: "rate_limited" };

  const ts = Number.isFinite(input["ts"]) && input["ts"] > 0 ? input["ts"] : Date.now();
  const visitorId =
    text(input["visitorId"])
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 64) || "anon";

  const date = new Date(ts).toISOString().slice(0, 10);
  const isVisit = event === "page_view";
  const isDownload = DOWNLOAD_EVENTS.has(event);

  const [geo, ipHash] = await Promise.all([geolocateIp(clientIp), hashIp(clientIp)]);

  if (isVisit || isDownload) {
    await rtdbTransaction(`analytics/daily/${date}`, (current) => {
      const base = isObject(current) ? current : {};
      const visitors = isObject(base["visitors"])
        ? { ...base["visitors"], [visitorId]: true }
        : { [visitorId]: true };
      return {
        ...base,
        visits: integer(base["visits"]) + (isVisit ? 1 : 0),
        downloads: integer(base["downloads"]) + (isDownload ? 1 : 0),
        visitors,
      };
    });
  }

  const counter = await rtdbTransaction(
    `analytics/meta/eventCount/${date}`,
    (current) => integer(current) + 1,
  );
  if (integer(counter.value) <= MAX_EVENTS_PER_DAY) {
    const key = `${ts}-${randomId()}`;
    await rtdbPut(`analytics/events/${date}/${key}`, {
      event,
      path: text(input["path"]).slice(0, 400),
      referrer: text(input["referrer"]).slice(0, 600),
      locale: text(input["locale"]).slice(0, 20),
      screen: text(input["screen"]).slice(0, 40),
      ua: text(input["ua"]).slice(0, 400),
      visitorId,
      ipHash,
      ts,
      geo: geo
        ? {
            country: geo.country,
            countryCode: geo.countryCode,
            region: geo.region,
            city: geo.city,
            lat: geo.lat,
            lon: geo.lon,
          }
        : null,
    });
  }

  return { ok: true };
}

function classifyDevice(ua: string): string {
  const value = ua.toLowerCase();
  if (!value) return "Desconhecido";
  if (/bot|crawler|spider|curl|wget|headless|preview/i.test(value)) return "Bot";
  if (/ipad|tablet|playbook|silktablet|kindle/i.test(value)) return "Tablet";
  if (/mobi|android|iphone|ipod|opera mini|blackberry|windows phone/i.test(value)) return "Celular";
  return "Desktop";
}

function referrerHost(referrer: string): string {
  try {
    return new URL(referrer).host.replace(/^www\./, "") || "(direto)";
  } catch {
    return "(direto)";
  }
}

export type LandingAnalyticsReport = {
  generatedAt: number;
  totals: {
    visits: number;
    downloads: number;
    visitors: number;
    events: number;
    countries: number;
  };
  conversion: number;
  series: Array<{ day: string; visits: number; downloads: number; visitors: number }>;
  recent: Array<{
    id: string;
    event: string;
    path: string;
    country: string;
    city: string;
    device: string;
    ts: number;
  }>;
  map: Array<{ lat: number; lon: number; count: number; label: string }>;
  topCountries: Array<{ code: string; name: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  devices: Array<{ label: string; count: number }>;
  topPages: Array<{ path: string; count: number }>;
};

export async function readLandingAnalytics(): Promise<LandingAnalyticsReport> {
  const [dailyRaw, eventsRaw] = await Promise.all([
    rtdbGet<JsonMap>("analytics/daily"),
    rtdbGet<JsonMap>("analytics/events"),
  ]);

  const series = Object.entries(dailyRaw ?? {})
    .filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .map(([day, value]) => {
      const record = isObject(value) ? value : {};
      return {
        day,
        visits: integer(record["visits"]),
        downloads: integer(record["downloads"]),
        visitors: isObject(record["visitors"]) ? Object.keys(record["visitors"]).length : 0,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const allVisitors = new Set<string>();
  for (const value of Object.values(dailyRaw ?? {})) {
    if (isObject(value) && isObject(value["visitors"])) {
      for (const id of Object.keys(value["visitors"])) allVisitors.add(id);
    }
  }

  const geoBuckets = new Map<string, { lat: number; lon: number; count: number; label: string }>();
  const countries = new Map<string, { code: string; name: string; count: number }>();
  const referrers = new Map<string, number>();
  const devices = new Map<string, number>();
  const pages = new Map<string, number>();
  const recent: LandingAnalyticsReport["recent"] = [];

  for (const [day, dayEvents] of Object.entries(eventsRaw ?? {})) {
    for (const [id, raw] of Object.entries(isObject(dayEvents) ? dayEvents : {})) {
      const item = isObject(raw) ? raw : {};
      const event = text(item["event"]);
      const ts = integer(item["ts"]);
      const path = text(item["path"], "/");
      const referrer = text(item["referrer"]);
      const ua = text(item["ua"]);
      const geo = isObject(item["geo"]) ? item["geo"] : {};

      pages.set(path, integer(pages.get(path)) + 1);
      devices.set(classifyDevice(ua), integer(devices.get(classifyDevice(ua))) + 1);
      referrers.set(referrerHost(referrer), integer(referrers.get(referrerHost(referrer))) + 1);

      const countryCode = text(geo["countryCode"]);
      if (countryCode && countryCode !== "??") {
        const entry = countries.get(countryCode) ?? {
          code: countryCode,
          name: text(geo["country"], countryCode),
          count: 0,
        };
        entry.count += 1;
        countries.set(countryCode, entry);
      }

      const lat = Number(geo["lat"]);
      const lon = Number(geo["lon"]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const roundedLat = Math.round(lat * 1_000) / 1_000;
        const roundedLon = Math.round(lon * 1_000) / 1_000;
        const key = `${roundedLat},${roundedLon}`;
        const city = text(geo["city"]);
        const country = text(geo["country"]);
        const bucket = geoBuckets.get(key) ?? {
          lat: roundedLat,
          lon: roundedLon,
          count: 0,
          label: `${city ? `${city}, ` : ""}${country}`.slice(0, MAX_LABEL_LENGTH),
        };
        bucket.count += 1;
        geoBuckets.set(key, bucket);
      }

      recent.push({
        id: `${day}/${id}`,
        event,
        path,
        country: text(geo["country"], "—"),
        city: text(geo["city"]),
        device: classifyDevice(ua),
        ts,
      });
    }
  }

  const totalVisits = series.reduce((sum, day) => sum + day.visits, 0);
  const totalDownloads = series.reduce((sum, day) => sum + day.downloads, 0);

  return {
    generatedAt: Date.now(),
    totals: {
      visits: totalVisits,
      downloads: totalDownloads,
      visitors: allVisitors.size,
      events: recent.length,
      countries: countries.size,
    },
    conversion: totalVisits > 0 ? (totalDownloads / totalVisits) * 100 : 0,
    series: series.slice(-30),
    recent: recent.sort((a, b) => b.ts - a.ts).slice(0, 120),
    map: [...geoBuckets.values()].sort((a, b) => b.count - a.count),
    topCountries: [...countries.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    topReferrers: [...referrers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referrer, count]) => ({ referrer, count })),
    devices: [...devices.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    topPages: [...pages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count })),
  };
}
