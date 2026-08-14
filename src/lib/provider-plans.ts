/**
 * Regras de disponibilidade por plano, controladas pelo PROVEDOR.
 *
 * O provedor é a única fonte de verdade para em quais planos os seus modelos
 * ficam disponíveis:
 * - "free" -> somente usuários do plano Free;
 * - "paid" -> somente usuários do plano Pago;
 * - "all"  -> todos os planos.
 *
 * Os campos `min_plan` e `active` de cada modelo são apenas espelhos mantidos
 * em sincronia com o provedor (para compatibilidade com clientes antigos).
 * Este módulo é puro (sem dependências de servidor) para poder ser usado por
 * painel, gateway e rotas da API.
 */

export type ProviderPlan = "free" | "paid" | "all";

export const PROVIDER_PLAN_VALUES: readonly ProviderPlan[] = ["free", "paid", "all"];

export function normalizeAvailablePlans(value: unknown): ProviderPlan {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "free" || raw === "paid" ? raw : "all";
}

/**
 * Resolve o plano efetivo de um provedor no caminho de leitura do aplicativo.
 * Quando `available_plans` está presente, ele é a fonte de verdade. Em dados
 * legados (campo ausente, antes da migração rodar) aplica a MESMA regra de
 * segurança da migração: se qualquer modelo do provedor era pago (`min_plan`
 * "paid"/"pro"), o provedor é tratado como Pago; caso contrário, Todos os
 * planos. Isso impede que usuários Free alcancem modelos pagos por chamada
 * direta à API antes da migração ser executada no painel.
 */
export function resolveProviderPlan(
  availablePlansValue: unknown,
  modelMinPlans: readonly unknown[],
): ProviderPlan {
  const explicit = String(availablePlansValue ?? "").trim().toLowerCase();
  if (explicit === "free" || explicit === "paid" || explicit === "all") return explicit;
  const hasPaidModel = modelMinPlans.some((value) => {
    const plan = String(value ?? "").trim().toLowerCase();
    return plan === "paid" || plan === "pro";
  });
  return hasPaidModel ? "paid" : "all";
}

/** Indica se um usuário de um plano pode usar um provedor com este plano. */
export function planAllows(providerPlan: ProviderPlan, userPlan: string): boolean {
  return providerPlan === "all" || providerPlan === userPlan.toLowerCase();
}

/** Espelho legado de plano mínimo escrito no modelo para clientes antigos. */
export function planToMinPlan(providerPlan: ProviderPlan): "free" | "paid" {
  return providerPlan === "paid" ? "paid" : "free";
}

export function planLabel(providerPlan: ProviderPlan): string {
  if (providerPlan === "free") return "Plano Free";
  if (providerPlan === "paid") return "Plano Pago";
  return "Todos os planos";
}
