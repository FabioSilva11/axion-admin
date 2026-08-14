import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { rtdbPatch } from "./lib/firebase.server";
import { startPaymentSynchronizer } from "./lib/payments.server";

// Persistent Ubuntu deployments confirm Pix by polling Mercado Pago directly.
startPaymentSynchronizer();

// The Android app observes config/api, so an endpoint change is delivered without an APK update.
const publicBaseUrl = (process.env["PUBLIC_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
const hasManagedPublicBaseUrl = publicBaseUrl.startsWith("https://");
const cliProxyPublicUrl = (process.env["CLI_PROXY_PUBLIC_URL"] ?? "https://api-ia.axion-ide.online")
  .trim()
  .replace(/\/+$/, "");
const publications: Array<Promise<unknown>> = [];

if (hasManagedPublicBaseUrl) {
  const panelEndpoint = {
    endpoint: publicBaseUrl,
    online: true,
    source: "cloudflare_named_tunnel",
    tunnelType: "named",
    updatedAt: Date.now(),
  };

  publications.push(
    rtdbPatch("config/api", panelEndpoint),
    rtdbPatch("config/panel", panelEndpoint),
  );
}

// The CLI Proxy is exposed by the same persistent named Cloudflare Tunnel.
// Its hostname is stable, so no Quick Tunnel URL monitor or polling script is needed.
if (cliProxyPublicUrl.startsWith("https://")) {
  publications.push(rtdbPatch("config/cli-proxy", {
    endpoint: cliProxyPublicUrl,
    online: true,
    source: "cloudflare_named_tunnel",
    tunnelType: "named",
    updatedAt: Date.now(),
  }));
}

if (publications.length > 0) {
  void Promise.all(publications)
    .catch((error: unknown) => console.error("Falha ao publicar endpoints fixos no Firebase", error));
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
