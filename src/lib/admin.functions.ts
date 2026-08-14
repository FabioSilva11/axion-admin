import { createServerFn } from "@tanstack/react-start";

import { findSection } from "./admin-sections";
import {
  CheckoutSyncInput,
  CreditAdjustmentInput,
  DiscoverProviderModelsInput,
  DeleteInput,
  LoginInput,
  ProviderDeleteInput,
  ProviderModelImportInput,
  RecordInput,
  SectionInput,
  SaveProviderModelsInput,
  SaveProviderInput,
  SaveModelInput,
  UserPlanInput,
} from "./admin-schemas";
import { normalizeAvailablePlans, planToMinPlan } from "./provider-plans";

export const adminLogin = createServerFn({ method: "POST" })
  .validator((input: unknown) => LoginInput.parse(input))
  .handler(async ({ data }) => {
    const { verifyCredentials, createSession } = await import("./admin-session.server");
    try {
      const ok = await verifyCredentials(data.username, data.password);
      if (!ok) return { ok: false as const, error: "Usuário ou senha inválidos" };
      await createSession(data.username);
      return { ok: true as const, username: data.username };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login indisponível";
      return { ok: false as const, error: message };
    }
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession } = await import("./admin-session.server");
  destroySession();
  return { ok: true as const };
});

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminUser } = await import("./admin-session.server");
  return { username: await getAdminUser() };
});

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { rtdbGet } = await import("./firebase.server");

  const [users, plans, models, providers, payments, api, cliProxy] = await Promise.all([
    rtdbGet<Record<string, Record<string, unknown>>>("users"),
    rtdbGet<Record<string, Record<string, unknown>>>("config/plans"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/models"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/providers"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/private/payments"),
    rtdbGet<Record<string, unknown>>("config/api"),
    rtdbGet<Record<string, unknown>>("config/cli-proxy"),
  ]);

  const userList = Object.values(users ?? {});
  const perPlan: Record<string, number> = {};
  for (const user of userList) {
    const plan = typeof user?.["plan"] === "string" ? (user["plan"] as string) : "sem plano";
    perPlan[plan] = (perPlan[plan] ?? 0) + 1;
  }

  return {
    totals: {
      users: userList.length,
      plans: Object.keys(plans ?? {}).length,
      models: Object.keys(models ?? {}).length,
      providers: Object.keys(providers ?? {}).length,
      payments: Object.keys(payments ?? {}).length,
    },
    perPlan,
    apiOnline: Boolean(api?.["online"]),
    proxyOnline: Boolean(cliProxy?.["online"]),
    apiEndpoint: typeof api?.["endpoint"] === "string" ? (api["endpoint"] as string) : null,
    recentUsers: userList
      .map((user) => ({
        uid: String(user?.["uid"] ?? ""),
        name: String(user?.["name"] ?? "—"),
        email: String(user?.["email"] ?? "—"),
        plan: String(user?.["plan"] ?? "—"),
        createdAt: Number(user?.["createdAt"] ?? 0),
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5),
  };
});

export const getSectionData = createServerFn({ method: "POST" })
  .validator((input: unknown) => SectionInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section) throw new Error("Seção inválida");
    const { rtdbGet } = await import("./firebase.server");
    const value = await rtdbGet<unknown>(section.path);

    if (section.kind === "single") {
      return {
        kind: "single" as const,
        json: JSON.stringify(redactSecrets(data.section, value ?? {}), null, 2),
        records: [] as Array<{ id: string; json: string }>,
      };
    }
    const records = Object.entries((value ?? {}) as Record<string, unknown>).map(([id, item]) => ({
      id,
      json: JSON.stringify(redactSecrets(data.section, item), null, 2),
    }));
    return { kind: "collection" as const, json: "", records };
  });

export const getModelEditorData = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { migrateProviderPlanConfig } = await import("./provider-catalog.server");
  await migrateProviderPlanConfig();
  const { rtdbGet } = await import("./firebase.server");
  const [models, providers, plans] = await Promise.all([
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/models"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/providers"),
    rtdbGet<Record<string, Record<string, unknown>>>("config/plans"),
  ]);

  const providerList = Object.entries(providers ?? {}).map(([key, provider]) => {
    const id = String(provider["id"] ?? key);
    return {
      id,
      name: String(provider["name"] ?? provider["id"] ?? key),
      enabled: provider["enabled"] === true,
      availablePlans: normalizeAvailablePlans(provider["available_plans"]),
    };
  });
  const planByProvider = new Map(
    providerList.map((provider) => [provider.id, provider.availablePlans]),
  );
  const enabledByProvider = new Map(
    providerList.map((provider) => [provider.id, provider.enabled]),
  );

  return {
    models: Object.entries(models ?? {}).map(([key, model]) => {
      const providerId = String(model["provider_id"] ?? model["providerId"] ?? "");
      return {
        id: String(model["id"] ?? key),
        displayName: String(model["display_name"] ?? model["name"] ?? model["id"] ?? key),
        providerId,
        upstreamModel: String(
          model["upstream_model"] ?? model["upstreamModel"] ?? model["name"] ?? "",
        ),
        active: model["active"] === true,
        inheritedPlan: planByProvider.get(providerId) ?? "all",
        providerEnabled: enabledByProvider.get(providerId) ?? false,
        inputUsdPerMillion: Number(model["input_usd_per_million"] ?? 0),
        outputUsdPerMillion: Number(model["output_usd_per_million"] ?? 0),
        inputCreditsPer1k: Number(model["input_credits_per_1k"] ?? 0),
        outputCreditsPer1k: Number(model["output_credits_per_1k"] ?? 0),
        defaultMaxOutputTokens: Number(model["default_max_output_tokens"] ?? 4096),
        maxTokensField:
          model["max_tokens_field"] === "max_completion_tokens"
            ? ("max_completion_tokens" as const)
            : ("max_tokens" as const),
      };
    }),
    providers: providerList,
    plans: Object.entries(plans ?? {}).map(([key, plan]) => ({
      id: key,
      name: String(plan["name"] ?? key),
      active: plan["active"] !== false,
    })),
  };
});

export const saveModel = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveModelInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    const { reconcileProviderPlanState } = await import("./provider-catalog.server");
    const provider = await rtdbGet<Record<string, unknown>>(
      `axionSettings/config/providers/${data.providerId}`,
    );
    if (!provider)
      return { ok: false as const, error: "Cadastre o provedor antes de salvar o modelo." };

    // Plano e disponibilidade são SEMPRE herdados do provedor.
    const availablePlans = normalizeAvailablePlans(provider["available_plans"]);
    const active = provider["enabled"] === true;
    const path = `axionSettings/config/models/${data.id}`;
    const existing = (await rtdbGet<Record<string, unknown>>(path)) ?? {};
    await rtdbPut(path, {
      ...existing,
      id: data.id,
      name: data.displayName,
      display_name: data.displayName,
      provider_id: data.providerId,
      upstream_model: data.upstreamModel,
      min_plan: planToMinPlan(availablePlans),
      active,
      input_usd_per_million: data.inputUsdPerMillion,
      output_usd_per_million: data.outputUsdPerMillion,
      input_credits_per_1k: data.inputCreditsPer1k,
      output_credits_per_1k: data.outputCreditsPer1k,
      default_max_output_tokens: data.defaultMaxOutputTokens,
      max_tokens_field: data.maxTokensField,
      activation_blocked_reason: active ? null : "Provedor desativado.",
      updatedAt: Date.now(),
    });
    await reconcileProviderPlanState();
    return { ok: true as const };
  });

export const saveRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section) throw new Error("Seção inválida");

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.value);
    } catch {
      return { ok: false as const, error: "JSON inválido" };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, error: "O conteúdo precisa ser um objeto JSON" };
    }

    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    if (section.kind === "single") {
      const existing = await rtdbGet<Record<string, unknown>>(section.path);
      await rtdbPut(section.path, restoreSecrets(data.section, parsed, existing));
      return { ok: true as const };
    }
    const recordId = (data.recordId ?? "").trim();
    if (!recordId || /[.#$[\]/]/.test(recordId)) {
      return { ok: false as const, error: "Identificador inválido" };
    }
    const recordPath = `${section.path}/${recordId}`;
    const existing = await rtdbGet<Record<string, unknown>>(recordPath);
    await rtdbPut(recordPath, restoreSecrets(data.section, parsed, existing));
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const section = findSection(data.section);
    if (!section || section.kind !== "collection" || section.allowDelete === false) {
      throw new Error("Seção não permite exclusão");
    }
    if (/[.#$[\]/]/.test(data.recordId)) return { ok: false as const, error: "ID inválido" };
    const { rtdbDelete } = await import("./firebase.server");
    await rtdbDelete(`${section.path}/${data.recordId}`);
    return { ok: true as const };
  });

export const setUserPlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => UserPlanInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { setUserPlanByAdmin } = await import("./accounts.server");
    await setUserPlanByAdmin(data.uid, data.planId);
    return { ok: true as const };
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .validator((input: unknown) => CreditAdjustmentInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { adjustUserCreditsByAdmin } = await import("./accounts.server");
    await adjustUserCreditsByAdmin(data.uid, data.delta);
    return { ok: true as const };
  });

export const synchronizePayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => CheckoutSyncInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet } = await import("./firebase.server");
    const payment = await rtdbGet<Record<string, unknown>>(
      `axionSettings/private/payments/${data.checkoutId}`,
    );
    const orderId = typeof payment?.["orderId"] === "string" ? payment["orderId"] : "";
    if (!orderId) return { ok: false as const, error: "Order não encontrada" };
    const { synchronizeOrder } = await import("./payments.server");
    const updated = await synchronizeOrder(orderId);
    return { ok: true as const, status: updated.status, activated: Boolean(updated.activatedAt) };
  });

export const getProviderList = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { migrateProviderPlanConfig } = await import("./provider-catalog.server");
  await migrateProviderPlanConfig();
  const { rtdbGet } = await import("./firebase.server");
  const [providers, models] = await Promise.all([
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/providers"),
    rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/models"),
  ]);
  const modelCounts: Record<string, number> = {};
  for (const model of Object.values(models ?? {})) {
    const providerId = String(model["provider_id"] ?? model["providerId"] ?? "");
    if (providerId) modelCounts[providerId] = (modelCounts[providerId] ?? 0) + 1;
  }
  return Object.entries(providers ?? {})
    .map(([key, provider]) => {
      const id = String(provider["id"] ?? key);
      return {
        id,
        name: String(provider["name"] ?? provider["id"] ?? key),
        baseUrl: String(provider["base_url"] ?? provider["baseUrl"] ?? ""),
        enabled: provider["enabled"] === true,
        availablePlans: normalizeAvailablePlans(provider["available_plans"]),
        modelCount: modelCounts[id] ?? 0,
        hasApiKey: Boolean(String(provider["api_key"] ?? provider["apiKey"] ?? "").trim()),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
});

export const saveProvider = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveProviderInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    const { reconcileProviderPlanState } = await import("./provider-catalog.server");
    const path = `axionSettings/config/providers/${data.providerId}`;
    const existing = (await rtdbGet<Record<string, unknown>>(path)) ?? {};
    const apiKey = data.apiKey || String(existing["api_key"] ?? existing["apiKey"] ?? "").trim();
    if (!apiKey) return { ok: false as const, error: "Informe a API key ao criar o provedor." };
    await rtdbPut(path, {
      ...existing,
      id: data.providerId,
      name: data.name,
      base_url: normalizeProviderBaseUrl(data.baseUrl),
      chat_path: String(existing["chat_path"] ?? "/chat/completions"),
      api_key: apiKey,
      enabled: data.enabled,
      available_plans: data.availablePlans,
      updatedAt: Date.now(),
    });
    // Plano, ativação/desativação e listas derivadas são propagados para os
    // modelos automaticamente (o provedor é a fonte de verdade).
    await reconcileProviderPlanState();
    return { ok: true as const };
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .validator((input: unknown) => ProviderDeleteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet, rtdbPatch } = await import("./firebase.server");
    const [models, plans] = await Promise.all([
      rtdbGet<Record<string, Record<string, unknown>>>("axionSettings/config/models"),
      rtdbGet<Record<string, Record<string, unknown>>>("config/plans"),
    ]);
    const updates: Record<string, unknown> = { [`providers/${data.providerId}`]: null };
    const planUpdates: Record<string, unknown> = {};
    const removed: string[] = [];
    for (const [modelId, model] of Object.entries(models ?? {})) {
      const providerId = String(model["provider_id"] ?? model["providerId"] ?? "");
      if (providerId === data.providerId) {
        updates[`models/${modelId}`] = null;
        removed.push(modelId);
      }
    }
    for (const [planId, plan] of Object.entries(plans ?? {})) {
      const ids = Array.isArray(plan["model_ids"])
        ? (plan["model_ids"] as unknown[]).map(String)
        : [];
      const remaining = ids.filter((id) => !removed.includes(id));
      if (remaining.length !== ids.length) {
        planUpdates[`plans/${planId}`] = { ...plan, model_ids: remaining, updatedAt: Date.now() };
      }
    }
    if (Object.keys(planUpdates).length) await rtdbPatch("config", planUpdates);
    await rtdbPatch("axionSettings/config", updates);
    return { ok: true as const, removedModels: removed.length };
  });

export const discoverSavedProviderModels = createServerFn({ method: "POST" })
  .validator((input: unknown) => ProviderDeleteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet } = await import("./firebase.server");
    const provider = await rtdbGet<Record<string, unknown>>(
      `axionSettings/config/providers/${data.providerId}`,
    );
    if (!provider) return { ok: false as const, error: "Provedor nao encontrado." };
    const baseUrl = String(provider["base_url"] ?? provider["baseUrl"] ?? "");
    const apiKey = String(provider["api_key"] ?? provider["apiKey"] ?? "").trim();
    if (!apiKey)
      return { ok: false as const, error: "O provedor nao possui uma API key configurada." };
    return fetchProviderModels(baseUrl, apiKey);
  });

export const importSavedProviderModels = createServerFn({ method: "POST" })
  .validator((input: unknown) => ProviderModelImportInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const { rtdbGet, rtdbPatch } = await import("./firebase.server");
    const { reconcileProviderPlanState } = await import("./provider-catalog.server");
    const provider = await rtdbGet<Record<string, unknown>>(
      `axionSettings/config/providers/${data.providerId}`,
    );
    if (!provider) return { ok: false as const, error: "Provedor nao encontrado." };
    // Novos modelos herdam automaticamente o plano e a disponibilidade do provedor.
    const availablePlans = normalizeAvailablePlans(provider["available_plans"]);
    const active = provider["enabled"] === true;
    const catalog = await rtdbGet<Record<string, Record<string, unknown>>>(
      "axionSettings/config/models",
    );
    const now = Date.now();
    const updates: Record<string, unknown> = {};
    for (const upstreamModel of [...new Set(data.modelIds)]) {
      const modelId = `${data.providerId}-${slugModelId(upstreamModel)}`.slice(0, 160);
      const previous = catalog?.[modelId] ?? {};
      updates[`models/${modelId}`] = {
        ...previous,
        id: modelId,
        name: String(previous["name"] ?? upstreamModel),
        provider_id: data.providerId,
        upstream_model: upstreamModel,
        min_plan: planToMinPlan(availablePlans),
        active,
        input_usd_per_million: Number(previous["input_usd_per_million"] ?? 0),
        output_usd_per_million: Number(previous["output_usd_per_million"] ?? 0),
        default_max_output_tokens: Number(previous["default_max_output_tokens"] ?? 4096),
        activation_blocked_reason: active ? null : "Provedor desativado.",
        importedAt: Number(previous["importedAt"] ?? now),
        updatedAt: now,
      };
    }
    await rtdbPatch("axionSettings/config", updates);
    await reconcileProviderPlanState();
    return { ok: true as const, imported: data.modelIds.length };
  });

export const discoverProviderModels = createServerFn({ method: "POST" })
  .validator((input: unknown) => DiscoverProviderModelsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const modelsUrl = providerModelsUrl(data.baseUrl);
    const response = await fetch(modelsUrl, {
      headers: { accept: "application/json", authorization: `Bearer ${data.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { ok: false as const, error: `O provedor retornou HTTP ${response.status}.` };
    }
    const raw = await response.text();
    if (raw.length > 1_000_000)
      return { ok: false as const, error: "Resposta de modelos muito grande." };
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false as const, error: "O provedor nao retornou JSON valido." };
    }
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown>)?.["data"])
        ? ((payload as Record<string, unknown>)["data"] as unknown[])
        : Array.isArray((payload as Record<string, unknown>)?.["models"])
          ? ((payload as Record<string, unknown>)["models"] as unknown[])
          : [];
    const models = [...new Set(source.map(readModelId).filter(Boolean))].sort().slice(0, 250);
    if (!models.length)
      return { ok: false as const, error: "Nenhum modelo foi encontrado em /models." };
    return { ok: true as const, models };
  });

export const saveProviderWithModels = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveProviderModelsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const baseUrl = normalizeProviderBaseUrl(data.baseUrl);
    const { rtdbPatch } = await import("./firebase.server");
    const { reconcileProviderPlanState } = await import("./provider-catalog.server");
    const now = Date.now();
    const updates: Record<string, unknown> = {
      [`providers/${data.providerId}`]: {
        id: data.providerId,
        name: data.name,
        base_url: baseUrl,
        chat_path: "/chat/completions",
        api_key: data.apiKey,
        enabled: true,
        available_plans: data.availablePlans,
        updatedAt: now,
      },
    };
    // Todos os modelos herdam o plano definido no provedor e ficam
    // disponíveis junto com ele (o provedor nasce ativo).
    const minPlan = planToMinPlan(data.availablePlans);
    for (const upstreamModel of [...new Set(data.modelIds)]) {
      const modelId = `${data.providerId}-${slugModelId(upstreamModel)}`.slice(0, 160);
      updates[`models/${modelId}`] = {
        id: modelId,
        name: upstreamModel,
        provider_id: data.providerId,
        upstream_model: upstreamModel,
        min_plan: minPlan,
        active: true,
        input_usd_per_million: 0,
        output_usd_per_million: 0,
        default_max_output_tokens: 4096,
        activation_blocked_reason: null,
        importedAt: now,
      };
    }
    await rtdbPatch("axionSettings/config", updates);
    await reconcileProviderPlanState();
    return { ok: true as const, imported: data.modelIds.length };
  });

export const syncProviderCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const { migrateProviderPlanConfig, reconcileProviderPlanState } =
    await import("./provider-catalog.server");
  await migrateProviderPlanConfig();
  return reconcileProviderPlanState();
});

function normalizeProviderBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_PROVIDER_HTTP !== "true") {
    throw new Error("O endpoint do provedor precisa usar HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

async function fetchProviderModels(baseUrl: string, apiKey: string) {
  const modelsUrl = providerModelsUrl(baseUrl);
  const response = await fetch(modelsUrl, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    return { ok: false as const, error: `O provedor retornou HTTP ${response.status}.` };
  const raw = await response.text();
  if (raw.length > 1_000_000)
    return { ok: false as const, error: "Resposta de modelos muito grande." };
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false as const, error: "O provedor nao retornou JSON valido." };
  }
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.["data"])
      ? ((payload as Record<string, unknown>)["data"] as unknown[])
      : Array.isArray((payload as Record<string, unknown>)?.["models"])
        ? ((payload as Record<string, unknown>)["models"] as unknown[])
        : [];
  const models = [...new Set(source.map(readModelId).filter(Boolean))].sort().slice(0, 250);
  if (!models.length)
    return { ok: false as const, error: "Nenhum modelo foi encontrado em /models." };
  return { ok: true as const, models };
}

function providerModelsUrl(value: string) {
  const baseUrl = normalizeProviderBaseUrl(value);
  return `${baseUrl.replace(/\/v1$/i, "")}/v1/models`;
}

function readModelId(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 160);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = value as Record<string, unknown>;
  return String(item["id"] ?? item["name"] ?? item["model"] ?? "")
    .trim()
    .slice(0, 160);
}

function slugModelId(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "model"
  );
}

const SECRET_FIELDS: Record<string, string[]> = {
  providers: ["api_key", "apiKey", "token"],
};

function redactSecrets(section: string, value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const clone = { ...(value as Record<string, unknown>) };
  for (const field of SECRET_FIELDS[section] ?? []) {
    if (clone[field]) clone[field] = "__KEEP__";
  }
  return clone;
}

function restoreSecrets(section: string, value: unknown, existing: Record<string, unknown> | null) {
  const next = { ...(value as Record<string, unknown>) };
  for (const field of SECRET_FIELDS[section] ?? []) {
    if (next[field] === "__KEEP__") {
      if (existing?.[field] !== undefined) next[field] = existing[field];
      else delete next[field];
    }
  }
  return next;
}
