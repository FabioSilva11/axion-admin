import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LANDING_BASE_URL } from "@/lib/admin-files.server";
import { noStoreJson } from "@/lib/http.server";
import { recordLandingEvent } from "@/lib/landing-analytics.server";

const TrackInput = z.object({
  event: z.string().trim().min(1).max(80),
  path: z.string().trim().max(400).default(""),
  referrer: z.string().trim().max(600).default(""),
  locale: z.string().trim().max(20).default(""),
  screen: z.string().trim().max(40).default(""),
  ua: z.string().trim().max(400).default(""),
  ts: z.coerce.number().min(0).max(4_102_444_800_000).optional(),
  visitorId: z.string().trim().max(64).default(""),
});

const allowedOrigins = new Set(
  [
    LANDING_BASE_URL.replace(/\/+$/, ""),
    "http://localhost:8783",
    "http://localhost:5173",
    "http://localhost:3001",
  ].filter(Boolean),
);

function withCors(response: Response, request: Request) {
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("vary", "Origin");
  }
  response.headers.set("access-control-allow-methods", "POST, OPTIONS");
  response.headers.set("access-control-allow-headers", "Content-Type");
  response.headers.set("access-control-max-age", "86400");
  return response;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "";
}

export const Route = createFileRoute("/api/analytics/track")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(new Response(null, { status: 204 }), request),
      POST: async ({ request }) => {
        try {
          const raw = await request.text().catch(() => "");
          const parsed = TrackInput.safeParse(JSON.parse(raw || "{}"));
          if (!parsed.success) {
            return withCors(noStoreJson({ ok: false, reason: "invalid_payload" }, 400), request);
          }
          const result = await recordLandingEvent(
            { ...parsed.data, ts: parsed.data.ts ?? Date.now() },
            clientIp(request),
          );
          return withCors(noStoreJson(result, result.ok ? 200 : 429), request);
        } catch {
          return withCors(noStoreJson({ ok: false, reason: "invalid_payload" }, 400), request);
        }
      },
    },
  },
});
