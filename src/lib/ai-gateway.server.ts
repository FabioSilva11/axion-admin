import { randomUUID } from "node:crypto";

import {
  bootstrapUser,
  releaseCredits,
  reserveCredits,
  settleCredits,
  walletFromProfile,
} from "./accounts.server";
import { rtdbGet } from "./firebase.server";
import { HttpError } from "./http.server";
import {
  billingEnvelope,
  OpenAiStreamMeter,
  SseEventDecoder,
  type StreamUsage,
} from "./openai-stream.server";
import { planAllows, resolveProviderPlan } from "./provider-plans";

type JsonMap = Record<string, unknown>;

const asMap = (value: unknown): JsonMap =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const integer = (value: unknown, fallback = 0) => Math.trunc(number(value, fallback));

function safeRequestId(request: Request) {
  const candidate =
    request.headers.get("x-axion-operation-id")?.trim() ||
    request.headers.get("x-request-id")?.trim() ||
    "";
  return /^[A-Za-z0-9_-]{16,80}$/.test(candidate) ? candidate : randomUUID();
}

async function readJsonBody(request: Request) {
  const raw = await request.text();
  if (!raw || raw.length > 4_000_000) {
    throw new HttpError(413, "request_too_large", "A solicitação excede o limite permitido.");
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as JsonMap;
  } catch {
    throw new HttpError(400, "invalid_json", "JSON da solicitação inválido.");
  }
}

function endpointForProvider(provider: JsonMap) {
  const explicit = String(
    provider["chat_url"] ?? provider["chatUrl"] ?? provider["endpoint"] ?? "",
  ).trim();
  const base = String(provider["base_url"] ?? provider["baseUrl"] ?? "").trim();
  const path = String(provider["chat_path"] ?? provider["chatPath"] ?? "/chat/completions").trim();
  const candidate = explicit || `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new HttpError(503, "provider_invalid", "Endpoint do provedor inválido.");
  }
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_PROVIDER_HTTP !== "true") {
    throw new HttpError(503, "provider_insecure", "O provedor precisa usar HTTPS.");
  }
  return url.toString();
}

function providerHeaders(provider: JsonMap, streaming = false) {
  const apiKey = String(
    provider["api_key"] ?? provider["apiKey"] ?? provider["token"] ?? "",
  ).trim();
  if (!apiKey) throw new HttpError(503, "provider_not_configured", "Provedor sem credencial.");
  const headers = new Headers({
    accept: streaming
      ? "text/event-stream, application/x-ndjson, application/json"
      : "application/json",
    "content-type": "application/json; charset=utf-8",
    authorization: `Bearer ${apiKey}`,
  });
  const extras = asMap(provider["headers"]);
  const forbidden = new Set(["authorization", "host", "content-length", "connection"]);
  for (const [key, value] of Object.entries(extras)) {
    if (!forbidden.has(key.toLowerCase()) && typeof value === "string" && value.length <= 2_048) {
      headers.set(key, value);
    }
  }
  return headers;
}

function estimatedInputTokens(body: JsonMap) {
  const relevant = JSON.stringify({ messages: body["messages"], tools: body["tools"] });
  return Math.max(1, Math.ceil(relevant.length / 4));
}

function tokenUsage(response: JsonMap, body: JsonMap) {
  const usage = asMap(response["usage"]);
  const input = Math.max(
    1,
    integer(usage["prompt_tokens"] ?? usage["input_tokens"], estimatedInputTokens(body)),
  );
  const choices = Array.isArray(response["choices"]) ? response["choices"] : [];
  const fallbackOutput = Math.max(1, Math.ceil(JSON.stringify(choices).length / 4));
  const output = Math.max(
    1,
    integer(usage["completion_tokens"] ?? usage["output_tokens"], fallbackOutput),
  );
  return { input, output };
}

function creditsForTokens(
  inputTokens: number,
  outputTokens: number,
  model: JsonMap,
  billing: JsonMap,
  allowUnpricedModel = false,
) {
  const directInput = number(model["input_credits_per_1k"], 0);
  const directOutput = number(model["output_credits_per_1k"], 0);
  if (directInput > 0 || directOutput > 0) {
    return Math.max(
      1,
      Math.ceil((inputTokens * directInput + outputTokens * directOutput) / 1_000),
    );
  }
  const inputUsd = number(model["input_usd_per_million"], 0);
  const outputUsd = number(model["output_usd_per_million"], 0);
  if (inputUsd <= 0 && outputUsd <= 0) {
    if (allowUnpricedModel) return 1;
    throw new HttpError(503, "model_price_missing", "Preço de uso do modelo não configurado.");
  }
  const usdCost = (inputTokens * inputUsd + outputTokens * outputUsd) / 1_000_000;
  const usdToBrlCents = Math.max(1, number(billing["usd_to_brl_cents"], 600));
  const creditsPerCent = Math.max(1, number(billing["credits_per_brl_cent"], 10));
  const markup = Math.max(10_000, number(billing["markup_basis_points"], 25_000)) / 10_000;
  return Math.max(1, Math.ceil(usdCost * usdToBrlCents * creditsPerCent * markup));
}

function publicProviderError(status: number, payload: JsonMap) {
  const error = asMap(payload["error"]);
  const message = String(error["message"] ?? "")
    .trim()
    .slice(0, 300);
  if (status === 429)
    return new HttpError(429, "provider_rate_limited", "Provedor temporariamente ocupado.");
  return new HttpError(502, "provider_error", message || "O provedor de IA recusou a solicitação.");
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function settleCreditsWithRetry(input: {
  uid: string;
  requestId: string;
  actualAmount: number;
  inputTokens: number;
  outputTokens: number;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { profile: await settleCredits(input), pending: false };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(100 * 4 ** attempt);
    }
  }
  // Never release a reservation after paid provider output was delivered. Keeping
  // it reserved is financially safe and allows an idempotent reconciliation later.
  console.error("Axion billing settlement pending", {
    requestId: input.requestId,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return { profile: null, pending: true };
}

function streamErrorEnvelope(code: string, message: string) {
  return JSON.stringify({
    error: {
      code,
      message: message.trim().slice(0, 300) || "O stream do provedor foi interrompido.",
    },
  });
}

function createManagedStreamResponse(input: {
  upstream: Response;
  mode: "sse" | "ndjson";
  upstreamAbort: AbortController;
  cleanup: () => void;
  uid: string;
  requestId: string;
  model: JsonMap;
  billing: JsonMap;
  freeModel: boolean;
  inputEstimate: number;
  reservedProfile: JsonMap | null;
}) {
  if (!input.upstream.body) {
    throw new HttpError(502, "empty_provider_stream", "O provedor retornou um stream vazio.");
  }

  const reader = input.upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const meter = new OpenAiStreamMeter();
  const sse = new SseEventDecoder();
  let ndjsonBuffer = "";
  let cancelled = false;
  let finalized: Promise<{
    usage: StreamUsage;
    wallet: ReturnType<typeof walletFromProfile>;
    pending: boolean;
  }> | null = null;

  const finishBilling = (reason: string) => {
    if (finalized) return finalized;
    finalized = (async () => {
      const usage = meter.usage(input.inputEstimate);
      if (!meter.hasBillablePayload()) {
        const profile = await releaseCredits(input.uid, input.requestId, reason);
        return { usage, wallet: walletFromProfile(profile), pending: false };
      }
      const actual = creditsForTokens(
        usage.input,
        usage.output,
        input.model,
        input.billing,
        input.freeModel,
      );
      const settled = await settleCreditsWithRetry({
        uid: input.uid,
        requestId: input.requestId,
        actualAmount: actual,
        inputTokens: usage.input,
        outputTokens: usage.output,
      });
      return {
        usage,
        wallet: walletFromProfile(settled.profile ?? input.reservedProfile),
        pending: settled.pending,
      };
    })().finally(input.cleanup);
    return finalized;
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueueText = (value: string) => {
        if (!cancelled) controller.enqueue(encoder.encode(value));
      };

      const forwardSseEvents = (events: ReturnType<SseEventDecoder["push"]>) => {
        for (const event of events) {
          if (event.data.trim() === "[DONE]") continue;
          meter.observeData(event.data);
          enqueueText(`${event.rawLines.join("\n")}\n\n`);
        }
      };

      const forwardNdjsonText = (text: string, flush = false) => {
        ndjsonBuffer += text;
        let newline: number;
        while ((newline = ndjsonBuffer.indexOf("\n")) >= 0) {
          let line = ndjsonBuffer.slice(0, newline);
          ndjsonBuffer = ndjsonBuffer.slice(newline + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          const trimmed = line.trim();
          if (trimmed && trimmed !== "[DONE]") {
            meter.observeData(trimmed);
            enqueueText(`${line}\n`);
          } else if (!trimmed) {
            enqueueText("\n");
          }
        }
        if (flush && ndjsonBuffer.trim()) {
          const line = ndjsonBuffer.trimEnd();
          ndjsonBuffer = "";
          if (line.trim() !== "[DONE]") {
            meter.observeData(line.trim());
            enqueueText(`${line}\n`);
          }
        }
      };

      void (async () => {
        let transportError = "";
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const text = decoder.decode(chunk.value, { stream: true });
            if (input.mode === "sse") forwardSseEvents(sse.push(text));
            else forwardNdjsonText(text);
          }
          const tail = decoder.decode();
          if (input.mode === "sse") {
            forwardSseEvents(sse.push(tail));
            forwardSseEvents(sse.finish());
          } else {
            forwardNdjsonText(tail, true);
          }
        } catch (error) {
          if (!cancelled) {
            transportError = error instanceof Error ? error.message : "stream_interrupted";
          }
        }

        const reason = cancelled
          ? "client_cancelled"
          : meter.errorMessage()
            ? "provider_stream_error"
            : transportError
              ? "provider_stream_interrupted"
              : "stream_completed";
        const billed = await finishBilling(reason);
        if (cancelled) return;

        if (transportError) {
          const error = streamErrorEnvelope("provider_stream_interrupted", transportError);
          enqueueText(input.mode === "sse" ? `data: ${error}\n\n` : `${error}\n`);
        }
        const billing = JSON.stringify(
          billingEnvelope(input.requestId, billed.usage, billed.wallet, billed.pending),
        );
        enqueueText(input.mode === "sse" ? `data: ${billing}\n\n` : `${billing}\n`);
        if (input.mode === "sse") enqueueText("data: [DONE]\n\n");
        controller.close();
      })().catch((error) => {
        input.cleanup();
        if (!cancelled) controller.error(error);
      });
    },
    async cancel() {
      cancelled = true;
      input.upstreamAbort.abort("client_cancelled");
      try {
        await reader.cancel("client_cancelled");
      } catch {
        // The reader may already be closed by the upstream abort.
      }
      await finishBilling("client_cancelled");
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "cache-control": "no-store, no-transform",
      "content-type":
        input.mode === "sse"
          ? "text/event-stream; charset=utf-8"
          : "application/x-ndjson; charset=utf-8",
      "x-accel-buffering": "no",
      "x-axion-request-id": input.requestId,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function executeManagedChat(
  request: Request,
  user: { uid: string; email?: string; name?: string },
) {
  const body = await readJsonBody(request);
  const streamRequested = body["stream"] === true;
  const modelId = String(body["model"] ?? "").trim();
  if (!modelId || modelId.length > 160) {
    throw new HttpError(400, "model_required", "Selecione um modelo válido.");
  }
  const modelCatalog = await rtdbGet<Record<string, JsonMap>>("axionSettings/config/models");
  const model =
    Object.values(modelCatalog ?? {}).find(
      (candidate) => String(candidate?.["id"] ?? "").trim() === modelId,
    ) ?? modelCatalog?.[modelId];
  if (!model || model["active"] === false) {
    throw new HttpError(404, "model_not_found", "Modelo indisponível.");
  }
  const profile = await bootstrapUser(user.uid, user.email, user.name);
  const planId = String(profile?.["plan"] ?? "free");
  const providerId = String(model["provider_id"] ?? model["providerId"] ?? "").trim();
  if (!providerId) throw new HttpError(503, "model_provider_missing", "Modelo sem provedor.");
  if (/[.#$[\]/]/.test(providerId)) {
    throw new HttpError(503, "model_provider_invalid", "Provedor do modelo inválido.");
  }
  const provider = await rtdbGet<JsonMap>(`axionSettings/config/providers/${providerId}`);
  if (!provider || provider["enabled"] !== true) {
    throw new HttpError(503, "provider_unavailable", "Provedor indisponível.");
  }
  // O provedor é a única fonte de verdade para disponibilidade por plano:
  // "free" libera só o Free, "paid" só o Pago e "all" libera todos. Em dados
  // legados (sem available_plans), o fallback é fail-closed para não liberar
  // modelos pagos a usuários Free antes da migração do painel rodar.
  const providerPlan = resolveProviderPlan(
    provider["available_plans"],
    Object.values(modelCatalog ?? {}).map((candidate) =>
      String(candidate?.["provider_id"] ?? candidate?.["providerId"] ?? "").trim() === providerId
        ? candidate?.["min_plan"]
        : "",
    ),
  );
  if (!planAllows(providerPlan, planId)) {
    throw new HttpError(
      403,
      "provider_plan_required",
      "Este provedor não está disponível no seu plano.",
    );
  }
  // O modelo deve pertencer ao provedor selecionado (não confiar só na UI).
  if (String(model["provider_id"] ?? model["providerId"] ?? "").trim() !== providerId) {
    throw new HttpError(503, "model_provider_mismatch", "Modelo inválido para este provedor.");
  }
  const [billing, plan] = await Promise.all([
    rtdbGet<JsonMap>("axionSettings/private/billing"),
    rtdbGet<JsonMap>(`config/plans/${planId}`),
  ]);
  if (!plan) throw new HttpError(503, "plan_unavailable", "Plano indisponível.");
  const allowedModels = Array.isArray(plan["model_ids"]) ? plan["model_ids"] : [];
  if (allowedModels.length && !allowedModels.map(String).includes(modelId)) {
    throw new HttpError(403, "model_not_in_plan", "Este modelo nao esta incluido no seu plano.");
  }
  const planMax = Math.max(1, integer(plan["max_output_tokens"], planId === "free" ? 768 : 4_096));
  const modelDefault = Math.max(
    1,
    integer(model["default_max_output_tokens"], Math.min(planMax, 2_048)),
  );
  const requested = Math.max(
    1,
    integer(body["max_completion_tokens"] ?? body["max_tokens"], modelDefault),
  );
  const outputLimit = Math.min(planMax, requested);
  const maxField = String(model["max_tokens_field"] ?? "max_tokens");
  delete body["max_tokens"];
  delete body["max_completion_tokens"];
  body[maxField === "max_completion_tokens" ? "max_completion_tokens" : "max_tokens"] = outputLimit;
  body["model"] = String(model["upstream_model"] ?? model["upstreamModel"] ?? modelId);
  body["stream"] = streamRequested;
  if (streamRequested) {
    body["stream_options"] = {
      ...asMap(body["stream_options"]),
      include_usage: true,
    };
  } else {
    delete body["stream_options"];
  }

  const inputEstimate = estimatedInputTokens(body);
  // Provedores exclusivos do Plano Pago exigem custo configurado; nos demais,
  // modelos sem preço usam a cobrança mínima (cota do plano).
  const unpricedAllowed = providerPlan !== "paid";
  const reservation = creditsForTokens(
    inputEstimate,
    outputLimit,
    model,
    billing ?? {},
    unpricedAllowed,
  );
  const requestId = safeRequestId(request);
  const reserved = await reserveCredits({
    uid: user.uid,
    requestId,
    modelId,
    amount: reservation,
  });
  if (reserved.duplicateStatus) {
    throw new HttpError(409, "duplicate_request", "Esta solicitação já foi processada.");
  }

  const upstreamAbort = new AbortController();
  const timeout = setTimeout(() => upstreamAbort.abort("provider_timeout"), 180_000);
  const abortFromClient = () => upstreamAbort.abort("client_cancelled");
  request.signal.addEventListener("abort", abortFromClient, { once: true });
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortFromClient);
  };
  let providerOutputReceived = false;

  try {
    const providerUrl = endpointForProvider(provider);
    const sendUpstream = () =>
      fetch(providerUrl, {
        method: "POST",
        headers: providerHeaders(provider, streamRequested),
        body: JSON.stringify(body),
        signal: upstreamAbort.signal,
      });

    let upstream = await sendUpstream();
    if (!upstream.ok && streamRequested && body["stream_options"]) {
      const rawError = await upstream.text();
      const lowerError = rawError.toLowerCase();
      if (lowerError.includes("stream_options") || lowerError.includes("include_usage")) {
        delete body["stream_options"];
        upstream = await sendUpstream();
      } else {
        let errorPayload: JsonMap;
        try {
          errorPayload = asMap(JSON.parse(rawError));
        } catch {
          errorPayload = {};
        }
        throw publicProviderError(upstream.status, errorPayload);
      }
    }

    if (!upstream.ok) {
      const rawError = await upstream.text();
      let errorPayload: JsonMap;
      try {
        errorPayload = asMap(JSON.parse(rawError));
      } catch {
        errorPayload = {};
      }
      throw publicProviderError(upstream.status, errorPayload);
    }

    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (streamRequested && !contentType.includes("application/json")) {
      const response = createManagedStreamResponse({
        upstream,
        mode: contentType.includes("ndjson") || contentType.includes("jsonl") ? "ndjson" : "sse",
        upstreamAbort,
        cleanup,
        uid: user.uid,
        requestId,
        model,
        billing: billing ?? {},
        freeModel: unpricedAllowed,
        inputEstimate,
        reservedProfile: reserved.profile,
      });
      providerOutputReceived = true;
      return response;
    }

    const raw = await upstream.text();
    let payload: JsonMap;
    try {
      payload = asMap(JSON.parse(raw));
    } catch {
      throw new HttpError(502, "invalid_provider_response", "Resposta inválida do provedor.");
    }
    providerOutputReceived = true;
    const usage = tokenUsage(payload, body);
    const actual = creditsForTokens(
      usage.input,
      usage.output,
      model,
      billing ?? {},
      unpricedAllowed,
    );
    const settled = await settleCreditsWithRetry({
      uid: user.uid,
      requestId,
      actualAmount: actual,
      inputTokens: usage.input,
      outputTokens: usage.output,
    });
    payload["axion_wallet"] = walletFromProfile(settled.profile ?? reserved.profile);
    payload["axion_request_id"] = requestId;
    if (settled.pending) payload["axion_billing_pending"] = true;
    cleanup();
    return payload;
  } catch (error) {
    cleanup();
    if (!providerOutputReceived) {
      await releaseCredits(
        user.uid,
        requestId,
        error instanceof Error ? error.name : "provider_failure",
      );
    }
    if (error instanceof HttpError) throw error;
    if (upstreamAbort.signal.aborted && upstreamAbort.signal.reason === "provider_timeout") {
      throw new HttpError(504, "provider_timeout", "O provedor demorou demais para responder.");
    }
    throw new HttpError(502, "provider_unavailable", "Não foi possível acessar o provedor de IA.");
  }
}
