import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  CircleDollarSign,
  Info,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { getModelEditorData, saveModel } from "@/lib/admin.functions";
import {
  DEFAULT_PAID_INPUT_CREDITS_PER_1K,
  DEFAULT_PAID_OUTPUT_CREDITS_PER_1K,
} from "@/lib/model-pricing";
import { planLabel, type ProviderPlan } from "@/lib/provider-plans";

type ModelForm = {
  id: string;
  displayName: string;
  providerId: string;
  upstreamModel: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  inputCreditsPer1k: number;
  outputCreditsPer1k: number;
  defaultMaxOutputTokens: number;
  maxTokensField: "max_tokens" | "max_completion_tokens";
};

type CatalogModel = ModelForm & {
  active: boolean;
  inheritedPlan: ProviderPlan;
  providerEnabled: boolean;
  pricingSource: string;
};

type ProviderOption = { id: string; name: string; enabled: boolean; availablePlans: ProviderPlan };

const emptyModel = (): ModelForm => ({
  id: "",
  displayName: "",
  providerId: "",
  upstreamModel: "",
  inputUsdPerMillion: 0,
  outputUsdPerMillion: 0,
  inputCreditsPer1k: 0,
  outputCreditsPer1k: 0,
  defaultMaxOutputTokens: 4096,
  maxTokensField: "max_tokens",
});

function asForm(model: CatalogModel): ModelForm {
  const {
    id,
    displayName,
    providerId,
    upstreamModel,
    inputUsdPerMillion,
    outputUsdPerMillion,
    inputCreditsPer1k,
    outputCreditsPer1k,
    defaultMaxOutputTokens,
    maxTokensField,
  } = model;
  return {
    id,
    displayName,
    providerId,
    upstreamModel,
    inputUsdPerMillion,
    outputUsdPerMillion,
    inputCreditsPer1k,
    outputCreditsPer1k,
    defaultMaxOutputTokens,
    maxTokensField,
  };
}

function hasCost(model: ModelForm) {
  return (
    model.inputUsdPerMillion > 0 ||
    model.outputUsdPerMillion > 0 ||
    model.inputCreditsPer1k > 0 ||
    model.outputCreditsPer1k > 0
  );
}

export function ModelPanel() {
  const load = useServerFn(getModelEditorData);
  const save = useServerFn(saveModel);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CatalogModel | null>(null);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["model-editor"],
    queryFn: () => load(),
  });
  const mutation = useMutation({
    mutationFn: (model: ModelForm) => save({ data: model }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Modelo salvo no catalogo.");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["model-editor"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o modelo."),
  });

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Modelos</h2>
          <p className="text-sm text-muted-foreground">
            Plano e disponibilidade sao herdados do provedor. Aqui voce ajusta apenas exibicao,
            custo e limites.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["model-editor"] })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            onClick={() =>
              setEditing({
                ...emptyModel(),
                active: false,
                inheritedPlan: "all",
                providerEnabled: false,
                pricingSource: "",
              })
            }
            className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
          >
            <Plus className="size-3.5" /> Novo modelo
          </button>
        </div>
      </header>

      {editing ? (
        <ModelFormPanel
          key={editing.id || "new"}
          initial={editing}
          providers={data?.providers ?? []}
          saving={mutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(model) => mutation.mutate(model)}
        />
      ) : null}

      {isLoading ? (
        <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando modelos...
        </div>
      ) : null}
      {!isLoading && !data?.models.length ? (
        <div className="panel p-6 text-sm text-muted-foreground">
          Nenhum modelo importado. Cadastre um provedor e carregue os modelos dele.
        </div>
      ) : null}
      <div className="grid gap-3">
        {(data?.models ?? []).map((model) => (
          <article
            key={model.id}
            className="panel flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{model.displayName}</h3>
                <Status available={model.providerEnabled && model.active} />
              </div>
              <p className="mono mt-1 truncate text-xs text-muted-foreground">
                {model.id} · {model.providerId} · plano herdado: {planLabel(model.inheritedPlan)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {model.pricingSource === "default_paid"
                  ? `Tarifa padrao: ${model.inputCreditsPer1k} credito(s) de entrada e ${model.outputCreditsPer1k} de saida por 1.000 tokens.`
                  : hasCost(model)
                    ? `Custo personalizado · limite de saida: ${model.defaultMaxOutputTokens.toLocaleString("pt-BR")} tokens`
                    : "Sem custo configurado: uso sera cobrado pela cota minima do plano."}
              </p>
            </div>
            <button
              onClick={() => setEditing(model)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary"
            >
              <Pencil className="size-3.5" /> Editar
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Status({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${available ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}
    >
      <Power className="size-3" /> {available ? "Disponivel" : "Indisponivel"}
    </span>
  );
}

function ModelFormPanel({
  initial,
  providers,
  saving,
  onSave,
  onCancel,
}: {
  initial: CatalogModel;
  providers: ProviderOption[];
  saving: boolean;
  onSave: (model: ModelForm) => void;
  onCancel: () => void;
}) {
  const [model, setModel] = useState<ModelForm>(asForm(initial));
  const priced = useMemo(() => hasCost(model), [model]);
  const update = <K extends keyof ModelForm>(key: K, value: ModelForm[K]) =>
    setModel((current) => ({ ...current, [key]: value }));
  const provider = providers.find((item) => item.id === model.providerId);
  const inheritedPlan: ProviderPlan = provider?.availablePlans ?? "all";
  const valid =
    model.id.length >= 2 &&
    model.displayName.length >= 2 &&
    model.providerId.length >= 2 &&
    model.upstreamModel.length >= 1;
  return (
    <article className="panel glow-ring p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{initial.id ? "Editar modelo" : "Novo modelo"}</h3>
          <p className="text-sm text-muted-foreground">
            Preencha os campos abaixo; nenhum JSON e exibido ou exigido.
          </p>
        </div>
        <Status available={Boolean(provider?.enabled)} />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Plano e disponibilidade sao <b>herdados do provedor</b>: este modelo seguira{" "}
          <b>
            {provider ? `${provider.name} (${planLabel(inheritedPlan)})` : "o provedor selecionado"}
          </b>{" "}
          e nao pode ser alterado individualmente.
        </p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextField
          label="Identificador"
          value={model.id}
          disabled={Boolean(initial.id)}
          placeholder="ex: cliproxyapi-gpt-5-6"
          onChange={(value) => update("id", value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
        />
        <TextField
          label="Nome para o aplicativo"
          value={model.displayName}
          placeholder="ex: GPT-5.6 Sol"
          onChange={(value) => update("displayName", value)}
        />
        <SelectField
          label="Provedor"
          value={model.providerId}
          onChange={(value) => update("providerId", value)}
        >
          <option value="">Selecione o provedor</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.enabled ? "" : " (desativado)"}
            </option>
          ))}
        </SelectField>
        <TextField
          label="ID enviado ao provedor"
          value={model.upstreamModel}
          placeholder="ex: gpt-5.6-sol"
          onChange={(value) => update("upstreamModel", value)}
        />
        <NumberField
          label="Limite padrao de saida (tokens)"
          value={model.defaultMaxOutputTokens}
          min={1}
          onChange={(value) => update("defaultMaxOutputTokens", value)}
        />
        <SelectField
          label="Campo de tokens"
          value={model.maxTokensField}
          onChange={(value) => update("maxTokensField", value as ModelForm["maxTokensField"])}
        >
          <option value="max_tokens">max_tokens</option>
          <option value="max_completion_tokens">max_completion_tokens</option>
        </SelectField>
      </div>
      <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4 text-primary" />
          <h4 className="text-sm font-semibold">Custo de uso</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe custo em USD por milhao de tokens ou creditos internos por 1.000 tokens. Modelos
          sem custo usam a cobranca minima da cota do plano. No Plano Pago, o administrador aplica
          automaticamente a tarifa padrao.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <NumberField
            label="USD entrada / 1 milhao"
            value={model.inputUsdPerMillion}
            min={0}
            step="any"
            onChange={(value) => update("inputUsdPerMillion", value)}
          />
          <NumberField
            label="USD saida / 1 milhao"
            value={model.outputUsdPerMillion}
            min={0}
            step="any"
            onChange={(value) => update("outputUsdPerMillion", value)}
          />
          <NumberField
            label="Creditos entrada / 1.000"
            value={model.inputCreditsPer1k}
            min={0}
            step="any"
            onChange={(value) => update("inputCreditsPer1k", value)}
          />
          <NumberField
            label="Creditos saida / 1.000"
            value={model.outputCreditsPer1k}
            min={0}
            step="any"
            onChange={(value) => update("outputCreditsPer1k", value)}
          />
        </div>
        {model.providerId && provider && !provider.enabled ? (
          <p className="mt-3 text-xs text-amber-300">
            O provedor esta desativado: o modelo fica indisponivel no aplicativo ate o provedor ser
            reativado.
          </p>
        ) : null}
        {priced ? (
          initial.pricingSource === "default_paid" ? (
            <p className="mt-3 text-xs text-emerald-300">
              Tarifa padrao aplicada automaticamente: {DEFAULT_PAID_INPUT_CREDITS_PER_1K} credito de
              entrada e {DEFAULT_PAID_OUTPUT_CREDITS_PER_1K} de saida por 1.000 tokens. Voce pode
              personalizar os valores.
            </p>
          ) : null
        ) : provider?.availablePlans === "paid" ? (
          <p className="mt-3 text-xs text-emerald-300">
            Ao salvar, sera aplicada automaticamente a tarifa padrao de{" "}
            {DEFAULT_PAID_INPUT_CREDITS_PER_1K} credito de entrada e{" "}
            {DEFAULT_PAID_OUTPUT_CREDITS_PER_1K} de saida por 1.000 tokens.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Sem custo informado: sera usada a cobranca minima da cota do plano.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          disabled={saving || !valid}
          onClick={() => onSave(model)}
          className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{" "}
          Salvar modelo
        </button>
      </div>
    </article>
  );
}

function TextField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60"
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step?: number | "any";
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      >
        {children}
      </select>
    </label>
  );
}
