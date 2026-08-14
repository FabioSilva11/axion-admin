import { getDatabase } from "firebase-admin/database";
import { readFile } from "node:fs/promises";

import { getFirebaseAdminApp } from "../src/lib/firebase.server.ts";

const db = getDatabase(getFirebaseAdminApp());
const rootRef = db.ref();
const liveRoot = (await rootRef.get()).val() ?? {};
const argumentsList = process.argv.slice(2);
const dryRun = argumentsList.includes("--dry-run");
const exportPath = argumentsList.find((value) => !value.startsWith("--"))?.trim();
const importedRoot = exportPath ? JSON.parse(await readFile(exportPath, "utf8")) : {};
const now = Date.now();
const updates = {};

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const importedSettings = object(importedRoot.axionSettings);
const importedConfig = object(importedRoot.config);
const liveConfig = object(liveRoot.config);
const liveSettings = object(liveRoot.axionSettings);
const liveSettingsConfig = object(liveSettings.config);
const livePrivate = object(liveSettings.private);
const legacyConfig = object(object(importedSettings.config));
const currentConfig = {
  ...legacyConfig,
  ...importedConfig,
  ...liveConfig,
  ...liveSettingsConfig,
};

const defaultPlans = {
  free: {
    id: "free",
    name: "Plano Free",
    description: "Para conhecer o Axion com uso controlado.",
    active: true,
    currency_id: "BRL",
    price_cents: 0,
    signup_credits: 500,
    cycle_days: 30,
    max_output_tokens: 768,
    requests_per_minute: 3,
    daily_credit_limit: 250,
  },
  starter: {
    id: "starter",
    name: "Axion Start",
    description: "Para projetos pequenos: mais créditos, respostas maiores e uso diário.",
    active: true,
    currency_id: "BRL",
    price_cents: 500,
    monthly_credits: 4_000,
    cycle_days: 30,
    max_output_tokens: 2_048,
    requests_per_minute: 8,
    daily_credit_limit: 800,
  },
  pro: {
    id: "pro",
    name: "Axion Pro",
    description: "Para uso frequente: mais contexto, ferramentas e 12.000 créditos por ciclo.",
    active: true,
    currency_id: "BRL",
    price_cents: 1_490,
    monthly_credits: 12_000,
    cycle_days: 30,
    max_output_tokens: 4_096,
    requests_per_minute: 20,
    daily_credit_limit: 3_000,
  },
  max: {
    id: "max",
    name: "Axion Max",
    description: "Para projetos intensivos: prioridade, respostas longas e 25.000 créditos.",
    active: true,
    currency_id: "BRL",
    price_cents: 2_990,
    monthly_credits: 25_000,
    cycle_days: 30,
    max_output_tokens: 8_192,
    requests_per_minute: 40,
    daily_credit_limit: 8_000,
  },
};

const defaultBilling = {
  schema_version: 2,
  usd_to_brl_cents: 600,
  credits_per_brl_cent: 10,
  markup_basis_points: 25_000,
  description: "Conversão conservadora com margem de 2,5x sobre o custo do provedor.",
  updated_at: now,
};
const migrationVersion = Number(livePrivate.schemaMigrationVersion ?? 0);
const secureLayoutAlreadyApplied = migrationVersion >= 4;

// Os limites financeiros são deliberadamente normalizados. O export antigo
// prometia 1 bilhão de créditos por R$ 25,00, o que não era sustentável.
const preservedCustomPlans = Object.fromEntries(
  Object.entries(object(liveConfig.plans)).filter(
    ([key]) => !["free", "paid", "starter", "pro", "max"].includes(key),
  ),
);
// Mantém planos personalizados criados pelo administrador em execuções futuras.
const mergedPlans = { ...preservedCustomPlans, ...defaultPlans };
const modelKeys = Object.keys(object(legacyConfig.models)).length
  ? Object.keys(object(legacyConfig.models))
  : Object.keys(object(currentConfig.models));
const sourceModels = Object.fromEntries(
  modelKeys
    .filter((key) => key !== "example_free" && key !== "example_paid")
    .map((key) => [
      key,
      {
        ...object(object(legacyConfig.models)[key]),
        ...object(object(importedConfig.models)[key]),
        ...(secureLayoutAlreadyApplied ? object(object(liveSettingsConfig.models)[key]) : {}),
      },
    ]),
);
const alreadyCanonicalModels = object(liveSettingsConfig.models);
const mergedModels = Object.fromEntries(
  Object.entries(sourceModels).map(([key, raw]) => {
    const model = object(raw);
    const active =
      secureLayoutAlreadyApplied && object(alreadyCanonicalModels[key]).active === true;
    return [
      key,
      {
        ...model,
        active,
        input_usd_per_million: Number(model.input_usd_per_million ?? 0),
        output_usd_per_million: Number(model.output_usd_per_million ?? 0),
        default_max_output_tokens: Math.min(
          4_096,
          Math.max(
            256,
            Number(model.default_max_output_tokens ?? model.max_output_tokens ?? 1_024),
          ),
        ),
        activation_blocked_reason: active
          ? null
          : "Configure credencial privada e preços reais antes de ativar.",
      },
    ];
  }),
);
const importedProviders = {
  ...object(legacyConfig.providers),
  ...object(importedConfig.providers),
};
const safeImportedProviders = Object.fromEntries(
  Object.entries(importedProviders).map(([key, raw]) => {
    const safe = { ...object(raw) };
    delete safe.api_key;
    delete safe.apiKey;
    delete safe.token;
    return [key, { ...safe, enabled: false, api_key: "" }];
  }),
);
const oldServerProviders = Object.fromEntries(
  Object.entries(object(object(liveRoot.axionServer).providers)).filter(
    ([key]) => key !== "openai_compatible" || key in importedProviders,
  ),
);
const mergedProviders = {
  ...safeImportedProviders,
  ...oldServerProviders,
  ...(secureLayoutAlreadyApplied ? object(liveSettingsConfig.providers) : {}),
};

updates["config/plans"] = mergedPlans;
const liveApi = object(liveConfig.api);
updates["config/api"] = String(liveApi.endpoint ?? "").startsWith("https://")
  ? liveApi
  : { online: false, endpoint: "", updated_at: now };
updates["config/providers"] = null;
updates["config/models"] = null;
updates["config/billing"] = null;
updates["config/cli-proxy"] = object(currentConfig["cli-proxy"]);
updates["axionSettings/config/models"] = mergedModels;
updates["axionSettings/config/providers"] = mergedProviders;
updates["axionSettings/private/billing"] = {
  ...defaultBilling,
  ...object(object(object(liveRoot.axionServer).private).billing),
  ...object(livePrivate.billing),
};
updates["axionSettings/private/mercadoPago"] = null;
updates["axionSettings/private/schemaMigrationVersion"] = 4;
const paymentRecords = {
  ...object(object(object(liveRoot.axionServer).private).payments),
  ...object(livePrivate.payments),
};
const pendingPayments = {};
const pendingOrders = {};
const paymentStats = { ...object(livePrivate.paymentStats) };
const finalStatuses = new Set([
  "processed",
  "cancelled",
  "canceled",
  "refunded",
  "expired",
  "failed",
]);
for (const [checkoutId, rawPayment] of Object.entries(paymentRecords)) {
  const payment = object(rawPayment);
  const status = String(payment.status ?? "").toLowerCase();
  const amountCents = Math.max(0, Number(payment.amountCents ?? 0));
  if (!finalStatuses.has(status)) {
    pendingPayments[checkoutId] = payment;
    if (payment.orderId) pendingOrders[String(payment.orderId)] = checkoutId;
    continue;
  }
  paymentStats.pendingCount = Math.max(0, Number(paymentStats.pendingCount ?? 0) - 1);
  paymentStats.pendingAmountCents = Math.max(
    0,
    Number(paymentStats.pendingAmountCents ?? 0) - amountCents,
  );
  if (payment.activatedAt) {
    paymentStats.approvedCount = Number(paymentStats.approvedCount ?? 0) + 1;
    paymentStats.revenueCents = Number(paymentStats.revenueCents ?? 0) + amountCents;
  } else if (status === "expired") {
    paymentStats.expiredCount = Number(paymentStats.expiredCount ?? 0) + 1;
  } else {
    paymentStats.failedCount = Number(paymentStats.failedCount ?? 0) + 1;
  }
}
paymentStats.pendingCount = Object.keys(pendingPayments).length;
paymentStats.pendingAmountCents = Object.values(pendingPayments).reduce(
  (sum, raw) => sum + Math.max(0, Number(object(raw).amountCents ?? 0)),
  0,
);
paymentStats.createdCount = Math.max(
  Number(paymentStats.createdCount ?? 0),
  Number(paymentStats.approvedCount ?? 0) +
    Number(paymentStats.expiredCount ?? 0) +
    Number(paymentStats.failedCount ?? 0) +
    paymentStats.pendingCount,
);
paymentStats.updatedAt = now;
updates["axionSettings/private/payments"] = pendingPayments;
updates["axionSettings/private/paymentOrders"] = pendingOrders;
updates["axionSettings/private/paymentStats"] = paymentStats;
updates["axionServer"] = null;

const users = { ...object(importedRoot.users), ...object(liveRoot.users) };
let migratedUsers = 0;
for (const [uid, rawProfile] of Object.entries(users)) {
  const profile = object(rawProfile);
  const subscription = object(profile.subscription);
  const legacyPlan = String(profile.plan ?? subscription.planId ?? "free").toLowerCase();
  const plan = legacyPlan === "paid" ? "pro" : mergedPlans[legacyPlan] ? legacyPlan : "free";
  const usage = object(profile.managedUsage);
  const planConfig = object(mergedPlans[plan]);
  const configuredLimit = Math.max(
    1,
    Number(plan === "free" ? planConfig.signup_credits : planConfig.monthly_credits),
  );
  const rawUsed = Math.max(0, Number(usage.creditsUsed ?? usage.tokensUsed ?? 0));
  const rawReserved = Math.max(0, Number(usage.creditsReserved ?? usage.reservedTokens ?? 0));
  // Consumo acima do novo limite fica saturado no ciclo; lifetimeUsed preserva
  // o total histórico sem conceder saldo adicional.
  const limit = configuredLimit;
  const used = Math.min(limit, rawUsed);
  const reserved = Math.min(limit - used, rawReserved);
  const nextSubscription = { ...subscription };
  delete nextSubscription.planId;
  delete nextSubscription.checkoutId;
  delete nextSubscription.orderId;
  if (plan === "free") {
    nextSubscription.status = "none";
    nextSubscription.periodStart = null;
    nextSubscription.periodEnd = null;
  } else if (!nextSubscription.status || nextSubscription.status === "none") {
    nextSubscription.status = "active";
  }
  const nextUsage = {
    ...usage,
    schemaVersion: 2,
    creditLimit: limit,
    creditsUsed: used,
    creditsReserved: reserved,
    creditsRemaining: limit - used - reserved,
    lifetimeUsed: Math.max(used, Number(usage.lifetimeUsed ?? used)),
    updatedAt: now,
  };
  for (const key of ["tokenLimit", "tokensUsed", "tokensRemaining", "reservedTokens"]) {
    delete nextUsage[key];
  }
  updates[`users/${uid}/plan`] = plan;
  updates[`users/${uid}/subscription`] = nextSubscription;
  updates[`users/${uid}/managedUsage`] = nextUsage;
  updates[`users/${uid}/serverLedger`] = Object.fromEntries(
    Object.entries(object(profile.serverLedger)).filter(
      ([, entry]) => object(entry).kind !== "subscription_payment",
    ),
  );
  migratedUsers += 1;
}

if (!dryRun) await rootRef.update(updates);
console.log(
  JSON.stringify({
    ok: true,
    dryRun,
    exportLoaded: Boolean(exportPath),
    plans: Object.keys(mergedPlans).length,
    models: Object.keys(mergedModels).length,
    providers: Object.keys(mergedProviders).length,
    migratedUsers,
  }),
);
process.exit(0);
