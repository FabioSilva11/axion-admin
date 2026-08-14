import { cloneElement, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { getAdminDashboard, saveDashboardPlan } from "@/lib/admin-dashboard.functions";
import { MetricCard, Panel, SectionHeader, StatusBadge, formatCurrency } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;
type Plan = Dashboard["plans"][number];

const blankPlan = (): Plan => ({
  id: "",
  name: "",
  description: "",
  priceCents: 0,
  currencyId: "BRL",
  cycleDays: 30,
  signupCredits: 500,
  monthlyCredits: 4000,
  dailyCreditLimit: 800,
  maxOutputTokens: 2048,
  requestsPerMinute: 8,
  resetHours: 5,
  resetWeeklyDays: 7,
  resetMonthlyDays: 30,
  active: true,
  modelIds: [],
});

export function PlansPanel({ data }: { data: Dashboard }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const save = useServerFn(saveDashboardPlan);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (plan: Plan) => save({ data: plan }),
    onSuccess: () => {
      toast.success("Plano salvo e sincronizado com o Firebase.");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o plano."),
  });
  const activePlans = useMemo(() => data.plans.filter((plan) => plan.active), [data.plans]);
  const providerById = useMemo(
    () => new Map(data.providers.map((provider) => [provider.id, provider])),
    [data.providers],
  );
  // A contagem de modelos por plano é derivada dos provedores (fonte de verdade).
  const countForPlan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plan of data.plans) {
      const count = data.models.filter((model) => {
        const provider = providerById.get(model.providerId);
        if (!provider || !provider.enabled) return false;
        return (
          provider.availablePlans === "all" ||
          (provider.availablePlans === "free" && plan.id === "free") ||
          (provider.availablePlans === "paid" && plan.id !== "free")
        );
      }).length;
      counts.set(plan.id, count);
    }
    return counts;
  }, [data.models, data.plans, providerById]);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Planos"
        description="Controle preços, créditos e janelas de renovação. A disponibilidade de modelos é herdada dos provedores."
        action={
          <button
            onClick={() => setEditing(blankPlan())}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-4" /> Novo plano
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Planos cadastrados" value={String(data.plans.length)} />
        <MetricCard label="Planos publicados" value={String(activePlans.length)} />
        <MetricCard label="Assinaturas ativas" value={String(data.totals.activeSubscriptions)} />
      </div>

      {editing ? (
        <PlanEditor
          plan={editing}
          saving={mutation.isPending}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => mutation.mutate(editing)}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {data.plans.map((plan) => (
          <Panel key={plan.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{plan.name}</h3>
                  <StatusBadge active={plan.active} label={plan.active ? "Publicado" : "Oculto"} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.description || "Sem descrição"}
                </p>
              </div>
              <button
                onClick={() => setEditing({ ...plan })}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"
              >
                <Pencil className="size-3.5" /> Editar
              </button>
            </div>
            <p className="mt-4 text-2xl font-bold">
              {plan.priceCents === 0 ? "Grátis" : formatCurrency(plan.priceCents)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {plan.cycleDays} dias
              </span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>
                <Check className="mr-1 inline size-3 text-primary" />
                {(plan.id === "free" ? plan.signupCredits : plan.monthlyCredits).toLocaleString(
                  "pt-BR",
                )}{" "}
                créditos
              </span>
              <span>
                <Check className="mr-1 inline size-3 text-primary" />
                {plan.maxOutputTokens.toLocaleString("pt-BR")} tokens/resposta
              </span>
              <span>
                <Check className="mr-1 inline size-3 text-primary" />
                {countForPlan.get(plan.id) ?? 0} modelos disponíveis
              </span>
              <span>
                <Check className="mr-1 inline size-3 text-primary" />
                {plan.requestsPerMinute} req/min
              </span>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function PlanEditor({
  plan,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  plan: Plan;
  saving: boolean;
  onChange: (plan: Plan) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Plan>(key: K, value: Plan[K]) => onChange({ ...plan, [key]: value });
  const number = (key: keyof Plan, value: string) =>
    set(key, Math.max(0, Number(value) || 0) as never);
  return (
    <Panel className="border-primary/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">{plan.id ? "Editar plano" : "Novo plano"}</h3>
          <p className="text-xs text-muted-foreground">
            Plano gratuito pode ser publicado com valor zero.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={plan.active}
            onChange={(event) => set("active", event.target.checked)}
          />{" "}
          Publicar no aplicativo
        </label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Identificador">
          <input
            disabled={Boolean(plan.id && !plan.id.startsWith("novo-"))}
            value={plan.id}
            onChange={(event) =>
              set("id", event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
            }
          />
        </Field>
        <Field label="Nome">
          <input value={plan.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Preço em centavos">
          <input
            type="number"
            value={plan.priceCents}
            onChange={(event) => number("priceCents", event.target.value)}
          />
        </Field>
        <Field label="Ciclo (dias)">
          <input
            type="number"
            value={plan.cycleDays}
            onChange={(event) => number("cycleDays", event.target.value)}
          />
        </Field>
        <Field label="Créditos ao cadastrar">
          <input
            type="number"
            value={plan.signupCredits}
            onChange={(event) => number("signupCredits", event.target.value)}
          />
        </Field>
        <Field label="Créditos por ciclo">
          <input
            type="number"
            value={plan.monthlyCredits}
            onChange={(event) => number("monthlyCredits", event.target.value)}
          />
        </Field>
        <Field label="Limite diário">
          <input
            type="number"
            value={plan.dailyCreditLimit}
            onChange={(event) => number("dailyCreditLimit", event.target.value)}
          />
        </Field>
        <Field label="Tokens máximos por resposta">
          <input
            type="number"
            value={plan.maxOutputTokens}
            onChange={(event) => number("maxOutputTokens", event.target.value)}
          />
        </Field>
        <Field label="Requisições por minuto">
          <input
            type="number"
            value={plan.requestsPerMinute}
            onChange={(event) => number("requestsPerMinute", event.target.value)}
          />
        </Field>
        <Field label="Reset da sessão (horas)">
          <input
            type="number"
            value={plan.resetHours}
            onChange={(event) => number("resetHours", event.target.value)}
          />
        </Field>
        <Field label="Reset semanal (dias)">
          <input
            type="number"
            value={plan.resetWeeklyDays}
            onChange={(event) => number("resetWeeklyDays", event.target.value)}
          />
        </Field>
        <Field label="Reset mensal (dias)">
          <input
            type="number"
            value={plan.resetMonthlyDays}
            onChange={(event) => number("resetMonthlyDays", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea
          rows={3}
          value={plan.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-2 text-xs">
          Cancelar
        </button>
        <button
          disabled={saving || !plan.id || !plan.name}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Save className="size-4" /> Salvar plano
        </button>
      </div>
    </Panel>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <label className="mt-3 block text-[0.7rem] font-medium text-muted-foreground">
      <span>{label}</span>
      {cloneElement(children, {
        className: `mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary ${children.props.className ?? ""}`,
      })}
    </label>
  );
}
