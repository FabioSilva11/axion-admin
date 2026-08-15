/**
 * Server-only helpers que mantêm o catálogo de modelos consistente com os
 * provedores. O provedor é a fonte de verdade para:
 *   - disponibilidade por plano (`available_plans`);
 *   - status ativo/inativo (`enabled`).
 *
 * A reconciliação propaga essa configuração para:
 *   - os espelhos `models/<id>/active` e `models/<id>/min_plan` (compatibilidade
 *     com clientes antigos);
 *   - a lista derivada `config/plans/<id>/model_ids`.
 *
 * Nunca chame isto no caminho crítico de uma solicitação do aplicativo: a
 * rotina é acionada pelas operações administrativas e pela migração única.
 */
import {
  normalizeAvailablePlans,
  planAllows,
  planToMinPlan,
  type ProviderPlan,
} from "./provider-plans";
import { withDefaultPaidModelPricing } from "./model-pricing";

type JsonMap = Record<string, unknown>;

const asMap = (value: unknown): JsonMap =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

const isPaidPlan = (value: string) => value === "paid" || value === "pro";

/**
 * Recalcula o estado de todos os provedores/modelos/planos e grava apenas as
 * diferenças. Pode ser chamado a qualquer momento (é idempotente).
 */
export async function reconcileProviderPlanState() {
  const { rtdbGet, rtdbPatch } = await import("./firebase.server");
  const [providersRaw, modelsRaw, plansRaw] = await Promise.all([
    rtdbGet<Record<string, JsonMap>>("axionSettings/config/providers"),
    rtdbGet<Record<string, JsonMap>>("axionSettings/config/models"),
    rtdbGet<Record<string, JsonMap>>("config/plans"),
  ]);
  const providers = providersRaw ?? {};
  const models = modelsRaw ?? {};
  const plans = plansRaw ?? {};
  const now = Date.now();

  const providerPlan = new Map<string, ProviderPlan>();
  for (const [providerId, provider] of Object.entries(providers)) {
    providerPlan.set(providerId, normalizeAvailablePlans(provider["available_plans"]));
  }

  const modelUpdates: Record<string, unknown> = {};
  const derivedByPlan = new Map<string, string[]>();
  for (const planId of Object.keys(plans)) derivedByPlan.set(planId, []);

  for (const [modelId, rawModel] of Object.entries(models)) {
    const model = asMap(rawModel);
    const providerId = text(model["provider_id"] ?? model["providerId"]).trim();
    const provider = providers[providerId];
    const plan = providerPlan.get(providerId);
    const providerEnabled = provider?.["enabled"] === true;
    const active = Boolean(provider && providerEnabled);

    if (provider && plan) {
      const minPlan = planToMinPlan(plan);
      const expectedReason = active ? null : "Provedor desativado.";
      const pricedModel = withDefaultPaidModelPricing(model, plan);
      // RTDB não armazena `null` (a chave some); normaliza undefined como null
      // para não reescrever o registro em toda reconciliação.
      const blockedReason = model["activation_blocked_reason"] ?? null;
      const changed =
        pricedModel !== model ||
        model["active"] !== active ||
        text(model["min_plan"], "free").toLowerCase() !== minPlan ||
        blockedReason !== expectedReason;
      if (changed) {
        modelUpdates[`models/${modelId}`] = {
          ...pricedModel,
          active,
          min_plan: minPlan,
          activation_blocked_reason: active ? null : "Provedor desativado.",
          updatedAt: now,
        };
      }
      if (providerEnabled) {
        for (const [planId, modelIds] of derivedByPlan) {
          if (planAllows(plan, planId)) modelIds.push(modelId);
        }
      }
    } else if (model["active"] === true) {
      // Modelo órfão (sem provedor válido): nunca pode ficar disponível.
      modelUpdates[`models/${modelId}`] = {
        ...model,
        active: false,
        activation_blocked_reason: "Provedor não encontrado para este modelo.",
        updatedAt: now,
      };
    }
  }

  const planUpdates: Record<string, unknown> = {};
  for (const [planId, modelIds] of derivedByPlan) {
    const plan = plans[planId];
    if (!plan) continue;
    const current = Array.isArray(plan["model_ids"])
      ? (plan["model_ids"] as unknown[]).map(String)
      : [];
    const next = [...modelIds].sort();
    const changed =
      current.length !== next.length || current.some((id, index) => id !== next[index]);
    if (changed) {
      planUpdates[`plans/${planId}`] = { ...plan, model_ids: next, updatedAt: now };
    }
  }

  if (Object.keys(modelUpdates).length) await rtdbPatch("axionSettings/config", modelUpdates);
  if (Object.keys(planUpdates).length) await rtdbPatch("config", planUpdates);

  return {
    ok: true as const,
    providers: Object.keys(providers).length,
    models: Object.keys(models).length,
    updatedModels: Object.keys(modelUpdates).length,
    updatedPlans: Object.keys(planUpdates).length,
  };
}

/**
 * Migração única dos dados existentes.
 *
 * Regra documentada para provedores que ainda não possuem `available_plans`:
 * - Se QUALQUER modelo do provedor for pago (campo `min_plan` com valor
 *   "paid" ou "pro"), o provedor vira "paid" — regra de segurança, evita
 *   vazar modelos pagos para usuários Free e elimina conflitos entre modelos
 *   do mesmo provedor.
 * - Caso contrário (todos os modelos eram "free"), o provedor vira "all" —
 *   preserva o comportamento anterior, pois `min_plan: free` era acessível a
 *   todos os planos.
 * - Provedor sem modelos: vira "all".
 *
 * Modelos sem provedor válido são desativados (nunca exibidos). Identificadores
 * de modelos e provedores são preservados.
 */
export async function migrateProviderPlanConfig() {
  const { rtdbGet, rtdbPatch } = await import("./firebase.server");
  const markerRaw = await rtdbGet<unknown>("axionSettings/private/planMigrationVersion");
  if (Number(markerRaw ?? 0) >= 1) {
    const reconciled = await reconcileProviderPlanState();
    return { ...reconciled, migrated: false as const };
  }

  const [providersRaw, modelsRaw] = await Promise.all([
    rtdbGet<Record<string, JsonMap>>("axionSettings/config/providers"),
    rtdbGet<Record<string, JsonMap>>("axionSettings/config/models"),
  ]);
  const providers = providersRaw ?? {};
  const models = modelsRaw ?? {};
  const now = Date.now();
  const providerUpdates: Record<string, unknown> = {};
  let decided = 0;

  for (const [providerId, rawProvider] of Object.entries(providers)) {
    const provider = asMap(rawProvider);
    if (provider["available_plans"] !== undefined) continue;
    const ownModels = Object.values(models)
      .map(asMap)
      .filter((model) => text(model["provider_id"] ?? model["providerId"]).trim() === providerId);
    const hasPaidModel = ownModels.some((model) => isPaidPlan(text(model["min_plan"], "free")));
    const plan: ProviderPlan = hasPaidModel ? "paid" : "all";
    providerUpdates[`providers/${providerId}`] = {
      ...provider,
      available_plans: plan,
      updatedAt: now,
    };
    decided += 1;
  }

  if (Object.keys(providerUpdates).length) {
    await rtdbPatch("axionSettings/config", providerUpdates);
  }
  const reconciled = await reconcileProviderPlanState();
  await rtdbPatch("axionSettings/private", { planMigrationVersion: 1 });

  return { ...reconciled, migrated: true as const, decided };
}
