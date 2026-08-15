import type { ProviderPlan } from "./provider-plans";

export const DEFAULT_PAID_INPUT_CREDITS_PER_1K = 1;
export const DEFAULT_PAID_OUTPUT_CREDITS_PER_1K = 1;

type ModelPricing = Record<string, unknown>;

const positiveNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0;
};

export function hasConfiguredModelPrice(model: ModelPricing) {
  return (
    positiveNumber(model["input_usd_per_million"]) ||
    positiveNumber(model["output_usd_per_million"]) ||
    positiveNumber(model["input_credits_per_1k"]) ||
    positiveNumber(model["output_credits_per_1k"])
  );
}

/**
 * Provedores exclusivos do Plano Pago nunca podem publicar um modelo sem
 * tarifa. O padrão usa créditos internos e pode ser substituído por uma tarifa
 * específica no editor de modelos.
 */
export function withDefaultPaidModelPricing<T extends ModelPricing>(
  model: T,
  availablePlans: ProviderPlan,
): T {
  if (availablePlans !== "paid" || hasConfiguredModelPrice(model)) return model;

  return {
    ...model,
    input_credits_per_1k: DEFAULT_PAID_INPUT_CREDITS_PER_1K,
    output_credits_per_1k: DEFAULT_PAID_OUTPUT_CREDITS_PER_1K,
    pricing_source: "default_paid",
  };
}
