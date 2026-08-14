import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeAvailablePlans } from "./provider-plans";

const Id = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);

const UserUpdateInput = z.object({
  uid: Id,
  planId: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/),
  role: z.enum(["user", "admin"]),
  blocked: z.boolean(),
  creditDelta: z.number().int().min(-10_000_000).max(10_000_000).default(0),
});

const PlanInput = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  priceCents: z.number().int().min(0).max(100_000_000),
  currencyId: z.string().trim().min(3).max(8),
  cycleDays: z.number().int().min(1).max(3650),
  signupCredits: z.number().int().min(0).max(1_000_000_000),
  monthlyCredits: z.number().int().min(0).max(1_000_000_000),
  dailyCreditLimit: z.number().int().min(0).max(1_000_000_000),
  maxOutputTokens: z.number().int().min(1).max(1_000_000),
  requestsPerMinute: z.number().int().min(1).max(100_000),
  resetHours: z.number().int().min(1).max(24 * 365),
  resetWeeklyDays: z.number().int().min(1).max(365),
  resetMonthlyDays: z.number().int().min(1).max(3650),
  active: z.boolean(),
  // A lista de modelos por plano (model_ids) é derivada dos provedores pelo
  // servidor e não pode mais ser editada manualmente aqui.
});

const NotificationInput = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4_000),
  frequency: z.enum(["always", "once_per_revision", "once_per_day"]),
  iconDataUrl: z.string().max(1_500_000),
  buttonLabel: z.string().trim().max(80),
  buttonUrl: z.union([z.string().trim().url().max(2_048), z.literal("")]),
});

const AppSettingsInput = z.object({
  youtube: z.string().trim().max(300),
  telegram: z.union([z.string().trim().url().max(2_048), z.literal("")]),
  whatsapp: z.union([z.string().trim().url().max(2_048), z.literal("")]),
  facebook: z.union([z.string().trim().url().max(2_048), z.literal("")]),
  googleClientId: z.string().trim().max(500),
  versionCode: z.number().int().min(1).max(10_000_000),
  versionName: z.string().trim().min(1).max(80),
  changelog: z.string().trim().max(8_000),
  downloadUrl: z.union([z.string().trim().url().max(2_048), z.literal("")]),
  forceUpdate: z.boolean(),
  screens: z.object({
    store: z.boolean(),
    videos: z.boolean(),
    wallet: z.boolean(),
  }),
  smtp: z.object({
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65_535),
    username: z.string().trim().max(320),
    password: z.string().max(1_000),
    senderName: z.string().trim().max(160),
    senderEmail: z.union([z.string().trim().email().max(320), z.literal("")]),
    secure: z.boolean(),
  }),
});

const PaymentSettingsInput = z.object({
  accessToken: z.string().trim().max(4_096),
  mode: z.enum(["sandbox", "production"]),
  expirationMinutes: z.number().int().min(30).max(43_200),
});

type JsonMap = Record<string, unknown>;

const map = (value: unknown): JsonMap =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);
const bool = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  const { rtdbGet } = await import("./firebase.server");
  await requireAdmin();

  const { migrateProviderPlanConfig } = await import("./provider-catalog.server");
  await migrateProviderPlanConfig();

  const [usersRaw, plansRaw, modelsRaw, providersRaw, paymentsRaw, appRaw, privateConfigRaw, api, proxy] =
    await Promise.all([
      rtdbGet<Record<string, JsonMap>>("users"),
      rtdbGet<Record<string, JsonMap>>("config/plans"),
      rtdbGet<Record<string, JsonMap>>("axionSettings/config/models"),
      rtdbGet<Record<string, JsonMap>>("axionSettings/config/providers"),
      rtdbGet<Record<string, JsonMap>>("axionSettings/private/payments"),
      rtdbGet<JsonMap>("config/app"),
      rtdbGet<JsonMap>("axionSettings/private/adminConfig"),
      rtdbGet<JsonMap>("config/api"),
      rtdbGet<JsonMap>("config/cli-proxy"),
    ]);

  const usersObject = usersRaw ?? {};
  const plansObject = plansRaw ?? {};
  const modelsObject = modelsRaw ?? {};
  const providersObject = providersRaw ?? {};
  const paymentsObject = paymentsRaw ?? {};
  const now = Date.now();

  const plans = Object.entries(plansObject).map(([key, value]) => ({
    id: text(value["id"], key),
    name: text(value["name"], key),
    description: text(value["description"]),
    priceCents: integer(value["price_cents"] ?? value["priceCents"]),
    currencyId: text(value["currency_id"] ?? value["currencyId"], "BRL"),
    cycleDays: integer(value["cycle_days"] ?? value["cycleDays"], 30),
    signupCredits: integer(value["signup_credits"] ?? value["signupCredits"]),
    monthlyCredits: integer(value["monthly_credits"] ?? value["monthlyCredits"]),
    dailyCreditLimit: integer(value["daily_credit_limit"] ?? value["dailyCreditLimit"]),
    maxOutputTokens: integer(value["max_output_tokens"] ?? value["maxOutputTokens"], 4096),
    requestsPerMinute: integer(value["requests_per_minute"] ?? value["requestsPerMinute"], 10),
    resetHours: integer(value["reset_hours"], 5),
    resetWeeklyDays: integer(value["reset_weekly_days"], 7),
    resetMonthlyDays: integer(value["reset_monthly_days"], 30),
    active: value["active"] !== false,
    modelIds: Array.isArray(value["model_ids"])
      ? (value["model_ids"] as unknown[]).map(String)
      : [],
  }));

  const models = Object.entries(modelsObject).map(([key, value]) => ({
    id: text(value["id"], key),
    name: text(value["display_name"] ?? value["name"], key),
    providerId: text(value["provider_id"]),
    minPlan: text(value["min_plan"], "free"),
    active: value["active"] === true,
    inputUsdPerMillion: Number(value["input_usd_per_million"] ?? 0),
    outputUsdPerMillion: Number(value["output_usd_per_million"] ?? 0),
  }));
  const modelById = new Map(models.map((model) => [model.id, model]));

  const requests: Array<{
    uid: string;
    modelId: string;
    providerId: string;
    inputTokens: number;
    outputTokens: number;
    chargedCredits: number;
    createdAt: number;
    status: string;
  }> = [];

  const users = Object.entries(usersObject).map(([uidKey, value]) => {
    const usage = map(value["managedUsage"]);
    const subscription = map(value["subscription"]);
    for (const request of Object.values(map(value["serverRequests"]))) {
      const item = map(request);
      const modelId = text(item["modelId"]);
      requests.push({
        uid: text(value["uid"], uidKey),
        modelId,
        providerId: modelById.get(modelId)?.providerId ?? "sem-provedor",
        inputTokens: integer(item["inputTokens"]),
        outputTokens: integer(item["outputTokens"]),
        chargedCredits: integer(item["chargedCredits"]),
        createdAt: integer(item["createdAt"]),
        status: text(item["status"], "unknown"),
      });
    }
    const lastActiveAt = Math.max(
      integer(value["lastLoginAt"]),
      integer(usage["updatedAt"]),
    );
    return {
      uid: text(value["uid"], uidKey),
      name: text(value["name"], "Sem nome"),
      email: text(value["email"], "—"),
      role: text(value["role"], value["admin"] === true ? "admin" : "user"),
      blocked: value["blocked"] === true || text(value["accessStatus"]) === "blocked",
      plan: text(value["plan"], "free"),
      subscriptionStatus: text(subscription["status"], "none"),
      subscriptionExpiresAt: integer(subscription["expiresAt"] ?? subscription["cycleEndAt"]),
      creditLimit: integer(usage["creditLimit"], 1_000),
      creditsUsed: integer(usage["creditsUsed"]),
      creditsRemaining: integer(usage["creditsRemaining"], 1_000),
      lifetimeUsed: integer(usage["lifetimeUsed"]),
      lastActiveAt,
      online: lastActiveAt > now - 5 * 60_000,
      createdAt: integer(value["createdAt"]),
    };
  });
  const userById = new Map(users.map((user) => [user.uid, user]));

  const modelUsage = new Map<string, { tokens: number; requests: number; credits: number }>();
  const providerUsage = new Map<string, { tokens: number; requests: number; credits: number }>();
  const dailyUsage = new Map<string, number>();
  for (const request of requests) {
    const tokens = request.inputTokens + request.outputTokens;
    const model = modelUsage.get(request.modelId) ?? { tokens: 0, requests: 0, credits: 0 };
    model.tokens += tokens;
    model.requests += 1;
    model.credits += request.chargedCredits;
    modelUsage.set(request.modelId || "desconhecido", model);
    const provider = providerUsage.get(request.providerId) ?? { tokens: 0, requests: 0, credits: 0 };
    provider.tokens += tokens;
    provider.requests += 1;
    provider.credits += request.chargedCredits;
    providerUsage.set(request.providerId, provider);
    if (request.createdAt) {
      const day = new Date(request.createdAt).toISOString().slice(0, 10);
      dailyUsage.set(day, (dailyUsage.get(day) ?? 0) + tokens);
    }
  }

  const providers = Object.entries(providersObject).map(([key, value]) => {
    const id = text(value["id"], key);
    const usage = providerUsage.get(id) ?? { tokens: 0, requests: 0, credits: 0 };
    return {
      id,
      name: text(value["name"], id),
      baseUrl: text(value["base_url"]),
      enabled: value["enabled"] === true,
      availablePlans: normalizeAvailablePlans(value["available_plans"]),
      credentialConfigured: Boolean(text(value["api_key"])),
      modelCount: models.filter((model) => model.providerId === id).length,
      ...usage,
    };
  });

  const payments = Object.entries(paymentsObject)
    .map(([key, value]) => {
      const user = userById.get(text(value["uid"]));
      return {
        checkoutId: text(value["checkoutId"], key),
        uid: text(value["uid"]),
        userName: user?.name ?? "Usuário",
        userEmail: user?.email ?? "—",
        planId: text(value["planId"]),
        amountCents: integer(value["amountCents"]),
        status: text(value["status"], "pending"),
        statusDetail: text(value["statusDetail"]),
        createdAt: integer(value["createdAt"]),
        updatedAt: integer(value["updatedAt"]),
        expiresAt: integer(value["expiresAt"]),
        activated: Boolean(value["activatedAt"]),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const app = map(appRaw);
  const notification = map(app["notificationDialog"]);
  const settings = map(app["settings"]);
  const privateConfig = map(privateConfigRaw);
  const smtp = map(privateConfig["smtp"]);

  return {
    generatedAt: now,
    totals: {
      users: users.length,
      online: users.filter((user) => user.online).length,
      activeSubscriptions: users.filter((user) => user.subscriptionStatus === "active").length,
      blocked: users.filter((user) => user.blocked).length,
      models: models.length,
      providers: providers.length,
      payments: payments.length,
      inputTokens: requests.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: requests.reduce((sum, item) => sum + item.outputTokens, 0),
      credits: requests.reduce((sum, item) => sum + item.chargedCredits, 0),
      revenueCents: payments
        .filter((payment) => payment.activated)
        .reduce((sum, payment) => sum + payment.amountCents, 0),
    },
    users,
    plans,
    models,
    providers,
    payments,
    dailyUsage: [...dailyUsage.entries()]
      .map(([day, tokens]) => ({ day, tokens }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-30),
    modelUsage: [...modelUsage.entries()]
      .map(([modelId, usage]) => ({ modelId, name: modelById.get(modelId)?.name ?? modelId, ...usage }))
      .sort((a, b) => b.tokens - a.tokens),
    providerUsage: [...providerUsage.entries()]
      .map(([providerId, usage]) => ({
        providerId,
        name: providers.find((provider) => provider.id === providerId)?.name ?? providerId,
        ...usage,
      }))
      .sort((a, b) => b.tokens - a.tokens),
    config: {
      notification: {
        enabled: bool(notification["enabled"]),
        title: text(notification["title"], "Atenção"),
        body: text(notification["body"]),
        frequency: text(notification["frequency"], "once_per_revision"),
        iconDataUrl: text(notification["iconDataUrl"]),
        buttonLabel: text(notification["buttonLabel"], "Entendi"),
        buttonUrl: text(notification["buttonUrl"]),
        revision: integer(notification["revision"]),
        updatedAt: integer(notification["updatedAt"]),
      },
      settings: {
        youtube: text(settings["youtube"]),
        telegram: text(settings["telegram"]),
        whatsapp: text(settings["whatsapp"]),
        facebook: text(settings["facebook"]),
        googleClientId: text(settings["googleClientId"]),
        versionCode: integer(settings["versionCode"], 1),
        versionName: text(settings["versionName"], "1.0.0"),
        changelog: text(settings["changelog"]),
        downloadUrl: text(settings["downloadUrl"]),
        forceUpdate: bool(settings["forceUpdate"]),
        screens: {
          store: bool(map(settings["screens"])["store"], true),
          videos: bool(map(settings["screens"])["videos"], true),
          wallet: bool(map(settings["screens"])["wallet"], true),
        },
      },
      smtp: {
        host: text(smtp["host"]),
        port: integer(smtp["port"], 587),
        username: text(smtp["username"]),
        senderName: text(smtp["senderName"], "Axion"),
        senderEmail: text(smtp["senderEmail"]),
        secure: bool(smtp["secure"]),
        passwordConfigured: Boolean(text(smtp["password"])),
      },
      payments: {
        configured: Boolean(process.env["MERCADO_PAGO_ACCESS_TOKEN"]?.trim()),
        mode: process.env["MERCADO_PAGO_MODE"]?.trim() || "sandbox",
        expirationMinutes: integer(process.env["MERCADO_PAGO_PIX_EXPIRATION_MINUTES"], 30),
      },
      api: { endpoint: text(api?.["endpoint"]), online: bool(api?.["online"]) },
      proxy: { endpoint: text(proxy?.["endpoint"]), online: bool(proxy?.["online"]) },
    },
  };
});

export const getSystemMetrics = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-session.server");
  await requireAdmin();
  const os = await import("node:os");
  const fs = await import("node:fs");
  const cpus = os.cpus();
  const cpuPercent = Math.min(100, Math.max(0, (os.loadavg()[0] / Math.max(1, cpus.length)) * 100));
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const disk = fs.statfsSync("/");
    diskTotal = disk.blocks * disk.bsize;
    diskUsed = diskTotal - disk.bfree * disk.bsize;
  } catch {
    // Métricas de disco são opcionais em ambientes sem statfs.
  }
  let rxBytes = 0;
  let txBytes = 0;
  try {
    const lines = fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2);
    for (const line of lines) {
      const [name, values] = line.split(":");
      if (!values || name.trim() === "lo") continue;
      const columns = values.trim().split(/\s+/).map(Number);
      rxBytes += columns[0] || 0;
      txBytes += columns[8] || 0;
    }
  } catch {
    // /proc não existe em todos os ambientes de desenvolvimento.
  }
  return {
    hostname: os.hostname(),
    cpuPercent,
    memoryUsed: totalMemory - freeMemory,
    memoryTotal: totalMemory,
    diskUsed,
    diskTotal,
    rxBytes,
    txBytes,
    uptimeSeconds: os.uptime(),
    timestamp: Date.now(),
  };
});

export const updateDashboardUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => UserUpdateInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    const { rtdbGet, rtdbPatch } = await import("./firebase.server");
    const { setUserPlanByAdmin, adjustUserCreditsByAdmin } = await import("./accounts.server");
    await requireAdmin();
    const current = await rtdbGet<JsonMap>(`users/${data.uid}`);
    if (!current) return { ok: false as const, error: "Usuário não encontrado." };
    if (text(current["plan"], "free") !== data.planId) {
      await setUserPlanByAdmin(data.uid, data.planId);
    }
    if (data.creditDelta) await adjustUserCreditsByAdmin(data.uid, data.creditDelta);
    await rtdbPatch(`users/${data.uid}`, {
      role: data.role,
      blocked: data.blocked,
      accessStatus: data.blocked ? "blocked" : "active",
      adminUpdatedAt: Date.now(),
    });
    return { ok: true as const };
  });

export const saveDashboardPlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    await requireAdmin();
    const path = `config/plans/${data.id}`;
    const current = (await rtdbGet<JsonMap>(path)) ?? {};
    await rtdbPut(path, {
      ...current,
      id: data.id,
      name: data.name,
      description: data.description,
      price_cents: data.priceCents,
      currency_id: data.currencyId.toUpperCase(),
      cycle_days: data.cycleDays,
      signup_credits: data.signupCredits,
      monthly_credits: data.monthlyCredits,
      daily_credit_limit: data.dailyCreditLimit,
      max_output_tokens: data.maxOutputTokens,
      requests_per_minute: data.requestsPerMinute,
      reset_hours: data.resetHours,
      reset_weekly_days: data.resetWeeklyDays,
      reset_monthly_days: data.resetMonthlyDays,
      // model_ids é mantido pelo servidor (derivado dos provedores); preserva
      // o valor atual para não sobrescrever com o que os clientes antigos
      // ainda leem no catálogo.
      model_ids: Array.isArray(current["model_ids"])
        ? (current["model_ids"] as unknown[]).map(String)
        : [],
      active: data.active,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  });

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => NotificationInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    await requireAdmin();
    const current = (await rtdbGet<JsonMap>("config/app/notificationDialog")) ?? {};
    const revision = integer(current["revision"]) + 1;
    await rtdbPut("config/app/notificationDialog", {
      ...data,
      revision,
      updatedAt: Date.now(),
    });
    return { ok: true as const, revision };
  });

export const saveAppSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => AppSettingsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    const { rtdbGet, rtdbPut } = await import("./firebase.server");
    await requireAdmin();
    const publicSettings = {
      youtube: data.youtube,
      telegram: data.telegram,
      whatsapp: data.whatsapp,
      facebook: data.facebook,
      googleClientId: data.googleClientId,
      versionCode: data.versionCode,
      versionName: data.versionName,
      changelog: data.changelog,
      downloadUrl: data.downloadUrl,
      forceUpdate: data.forceUpdate,
      screens: data.screens,
      updatedAt: Date.now(),
    };
    const smtpPath = "axionSettings/private/adminConfig/smtp";
    const currentSmtp = (await rtdbGet<JsonMap>(smtpPath)) ?? {};
    await Promise.all([
      rtdbPut("config/app/settings", publicSettings),
      rtdbPut(smtpPath, {
        ...data.smtp,
        password: data.smtp.password || text(currentSmtp["password"]),
        updatedAt: Date.now(),
      }),
    ]);
    return { ok: true as const };
  });

export const savePaymentSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => PaymentSettingsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-session.server");
    await requireAdmin();
    const fs = await import("node:fs");
    const path = await import("node:path");
    const envPath = path.resolve(process.cwd(), ".env.local");
    const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const updates: Record<string, string> = {
      MERCADO_PAGO_MODE: data.mode,
      MERCADO_PAGO_PIX_EXPIRATION_MINUTES: String(data.expirationMinutes),
    };
    if (data.accessToken) updates.MERCADO_PAGO_ACCESS_TOKEN = data.accessToken;
    let next = current;
    for (const [key, value] of Object.entries(updates)) {
      const pattern = new RegExp(`^${key}=.*$`, "m");
      next = pattern.test(next)
        ? next.replace(pattern, `${key}=${value}`)
        : `${next.replace(/\s*$/, "")}\n${key}=${value}\n`;
      process.env[key] = value;
    }
    const temporaryPath = `${envPath}.tmp`;
    fs.writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, envPath);
    fs.chmodSync(envPath, 0o600);
    return { ok: true as const, configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN) };
  });
