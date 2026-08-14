import { createFileRoute } from "@tanstack/react-router";

import { bootstrapUser } from "@/lib/accounts.server";
import { rtdbGet } from "@/lib/firebase.server";
import { jsonError, noStoreJson, requireFirebaseUser } from "@/lib/http.server";
import { planAllows, resolveProviderPlan } from "@/lib/provider-plans";

type JsonMap = Record<string, unknown>;

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

/**
 * GET /v1/ai/providers
 *
 * Catálogo para o novo fluxo do aplicativo Android:
 *   1. o app identifica o plano atual do usuário (via bootstrap);
 *   2. o servidor devolve somente os provedores ATIVOS disponíveis para esse
 *      plano, com pelo menos um modelo ativo;
 *   3. cada provedor traz os modelos ativos que o usuário pode escolher.
 *
 * O servidor nunca confia na filtragem do cliente: a permissão é validada aqui
 * e novamente em /v1/ai/chat/completions.
 */
export const Route = createFileRoute("/v1/ai/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireFirebaseUser(request);
          const profile = await bootstrapUser(user.uid, user.email, user["name"]);
          const planId = text(profile?.["plan"], "free");

          const [providersRaw, modelsRaw] = await Promise.all([
            rtdbGet<Record<string, JsonMap>>("axionSettings/config/providers"),
            rtdbGet<Record<string, JsonMap>>("axionSettings/config/models"),
          ]);
          const models = modelsRaw ?? {};

          const providers: Array<{
            id: string;
            name: string;
            availablePlans: "free" | "paid" | "all";
            models: Array<{ id: string; name: string }>;
          }> = [];
          for (const [key, rawProvider] of Object.entries(providersRaw ?? {})) {
            const provider = rawProvider as JsonMap;
            const id = text(provider["id"], key);
            if (provider["enabled"] !== true) continue;
            const providerModels = Object.values(models).filter(
              (raw) => text(raw["provider_id"] ?? raw["providerId"]).trim() === id,
            );
            // Fallback fail-closed para dados legados sem available_plans.
            const availablePlans = resolveProviderPlan(
              provider["available_plans"],
              providerModels.map((raw) => raw["min_plan"]),
            );
            if (!planAllows(availablePlans, planId)) continue;

            const availableModels = providerModels
              .filter((raw) => raw["active"] === true)
              .map((raw) => ({
                id: text(raw["id"], text(raw["name"])),
                name: text(raw["display_name"] ?? raw["name"], text(raw["id"])),
              }))
              .sort((left, right) => left.name.localeCompare(right.name));
            if (!availableModels.length) continue;

            providers.push({
              id,
              name: text(provider["name"], id),
              availablePlans,
              models: availableModels,
            });
          }
          providers.sort((left, right) => left.name.localeCompare(right.name));

          return noStoreJson({ plan: planId, providers });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
