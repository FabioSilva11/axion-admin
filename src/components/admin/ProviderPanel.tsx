import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  KeyRound,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteProvider,
  discoverProviderModels,
  discoverSavedProviderModels,
  getProviderList,
  importSavedProviderModels,
  saveProvider,
  saveProviderWithModels,
  syncProviderCatalog,
} from "@/lib/admin.functions";
import { planLabel, type ProviderPlan } from "@/lib/provider-plans";

type FormState = {
  providerId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  availablePlans: ProviderPlan;
};
type SavedProvider = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  availablePlans: ProviderPlan;
  modelCount: number;
  hasApiKey: boolean;
};

const emptyForm = (): FormState => ({
  providerId: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  enabled: true,
  availablePlans: "all",
});

export function ProviderPanel() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedProviderImportId, setSavedProviderImportId] = useState<string | null>(null);
  const list = useServerFn(getProviderList);
  const save = useServerFn(saveProvider);
  const discover = useServerFn(discoverProviderModels);
  const discoverSaved = useServerFn(discoverSavedProviderModels);
  const importModels = useServerFn(saveProviderWithModels);
  const importSavedModels = useServerFn(importSavedProviderModels);
  const remove = useServerFn(deleteProvider);
  const sync = useServerFn(syncProviderCatalog);
  const queryClient = useQueryClient();
  const {
    data: providers = [],
    isLoading,
    isFetching,
  } = useQuery({ queryKey: ["providers"], queryFn: () => list() });
  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success(editingId ? "Provedor atualizado." : "Provedor cadastrado.");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["model-editor"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      if (!editingId) setEditingId(form.providerId);
      setForm((current) => ({ ...current, apiKey: "" }));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o provedor."),
  });
  const syncMutation = useMutation({
    mutationFn: () => sync(),
    onSuccess: (result) => {
      toast.success(
        `Catálogo sincronizado: ${result.updatedModels} modelos e ${result.updatedPlans} planos atualizados.`,
      );
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["model-editor"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast.error("Nao foi possivel sincronizar o catalogo."),
  });
  const discoverMutation = useMutation({
    mutationFn: () =>
      discover({
        data: {
          providerId: form.providerId,
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      setModels(result.models);
      setSelected(new Set());
      setSavedProviderImportId(null);
      setDialogOpen(true);
    },
    onError: () => toast.error("Para consultar modelos, informe a API key atual do provedor."),
  });
  const discoverSavedMutation = useMutation({
    mutationFn: (provider: SavedProvider) => discoverSaved({ data: { providerId: provider.id } }),
    onSuccess: (result, provider) => {
      if (!result.ok) return toast.error(result.error);
      setModels(result.models);
      setSelected(new Set());
      setSavedProviderImportId(provider.id);
      setDialogOpen(true);
    },
    onError: () => toast.error("Nao foi possivel consultar os modelos do provedor."),
  });
  const importMutation = useMutation({
    mutationFn: () =>
      savedProviderImportId
        ? importSavedModels({
            data: { providerId: savedProviderImportId, modelIds: [...selected] },
          })
        : importModels({
            data: {
              providerId: form.providerId,
              name: form.name,
              baseUrl: form.baseUrl,
              apiKey: form.apiKey,
              availablePlans: form.availablePlans,
              modelIds: [...selected],
            },
          }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success(`${result.imported} modelos importados.`);
      setDialogOpen(false);
      setSavedProviderImportId(null);
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["model-editor"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Nao foi possivel importar os modelos."),
  });
  const deleteMutation = useMutation({
    mutationFn: (providerId: string) => remove({ data: { providerId } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error("Nao foi possivel excluir o provedor.");
      toast.success(`Provedor e ${result.removedModels} modelos removidos.`);
      if (editingId) cancelEditing();
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["model-editor"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Nao foi possivel excluir o provedor."),
  });
  const canSave = useMemo(
    () =>
      form.providerId.length >= 2 &&
      form.name.length >= 2 &&
      /^https?:\/\//.test(form.baseUrl) &&
      (Boolean(editingId) || form.apiKey.length > 0),
    [form, editingId],
  );
  const canDiscover =
    form.providerId.length >= 2 &&
    form.name.length >= 2 &&
    /^https?:\/\//.test(form.baseUrl) &&
    form.apiKey.length > 0;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const startEditing = (provider: SavedProvider) => {
    setEditingId(provider.id);
    setForm({
      providerId: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: "",
      enabled: provider.enabled,
      availablePlans: provider.availablePlans,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEditing = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModels([]);
    setSelected(new Set());
  };
  const toggle = (model: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  const allModelsSelected = models.length > 0 && selected.size === models.length;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Provedores</h2>
          <p className="text-sm text-muted-foreground">
            O provedor controla o plano e a disponibilidade de todos os seus modelos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["providers"] })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Layers className="size-3.5" />
            )}{" "}
            Sincronizar disponibilidade
          </button>
          <button
            onClick={cancelEditing}
            className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
          >
            <Plus className="size-3.5" /> Novo provedor
          </button>
        </div>
      </header>

      <article className="panel glow-ring p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {editingId ? "Editar e renomear provedor" : "Cadastrar provedor"}
            </h3>
            <p className="text-sm text-muted-foreground">
              A chave nunca e exibida. Ao editar, deixe-a vazia para manter a credencial salva.
            </p>
          </div>
          {editingId ? (
            <button
              onClick={cancelEditing}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              Cancelar edicao
            </button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            label="Identificador tecnico"
            value={form.providerId}
            placeholder="ex: openrouter"
            disabled={Boolean(editingId)}
            onChange={(value) =>
              update("providerId", value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
            }
          />
          <Field
            label="Nome exibido"
            value={form.name}
            placeholder="ex: OpenRouter"
            onChange={(value) => update("name", value)}
          />
          <Field
            label="Endpoint base"
            value={form.baseUrl}
            placeholder="https://api.exemplo.com/v1"
            onChange={(value) => update("baseUrl", value)}
          />
          <Field
            label={editingId ? "Nova API key (opcional)" : "API key"}
            value={form.apiKey}
            placeholder={editingId ? "Deixe vazio para manter a atual" : "Cole a chave aqui"}
            type="password"
            onChange={(value) => update("apiKey", value)}
          />
          <PlanField
            value={form.availablePlans}
            onChange={(value) => update("availablePlans", value)}
          />
          <div className="grid gap-1.5 self-end text-xs font-medium text-muted-foreground">
            <span>Disponibilidade dos modelos</span>
            <p className="text-[0.7rem] font-normal leading-relaxed text-muted-foreground/80">
              Aplicada automaticamente a todos os modelos deste provedor. Nao e possivel configurar
              o plano de cada modelo individualmente.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
            />{" "}
            Provedor ativo
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!canDiscover || discoverMutation.isPending}
              onClick={() => discoverMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
            >
              {discoverMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}{" "}
              Carregar modelos
            </button>
            <button
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}{" "}
              Salvar provedor
            </button>
          </div>
        </div>
      </article>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Provedores salvos
        </h3>
        {isLoading ? (
          <div className="panel flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando provedores...
          </div>
        ) : null}
        {!isLoading && !providers.length ? (
          <div className="panel p-5 text-sm text-muted-foreground">Nenhum provedor cadastrado.</div>
        ) : null}
        <div className="grid gap-3">
          {providers.map((provider) => (
            <article
              key={provider.id}
              className="panel flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Server className="size-4 text-primary" />
                  <h4 className="font-semibold">{provider.name}</h4>
                  <Status enabled={provider.enabled} />
                  <PlanBadge plan={provider.availablePlans} />
                </div>
                <p className="mono mt-1 truncate text-xs text-muted-foreground">
                  {provider.id} · {provider.baseUrl}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{provider.modelCount} modelos vinculados</span>
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="size-3" />{" "}
                    {provider.hasApiKey ? "Chave configurada" : "Sem chave"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!provider.hasApiKey || discoverSavedMutation.isPending}
                  onClick={() => discoverSavedMutation.mutate(provider)}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {discoverSavedMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Search className="size-3.5" />
                  )}{" "}
                  Carregar modelos
                </button>
                <button
                  onClick={() => startEditing(provider)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Excluir ${provider.name} e os ${provider.modelCount} modelos vinculados? Esta acao nao pode ser desfeita.`,
                      )
                    )
                      deleteMutation.mutate(provider.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel max-h-[85vh] w-full max-w-2xl overflow-hidden p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Selecionar modelos</h3>
                <p className="text-sm text-muted-foreground">
                  {models.length} encontrados. Comece escolhendo somente os modelos que deseja
                  importar.
                </p>
              </div>
              <button
                onClick={() => setDialogOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 max-h-[46vh] overflow-y-auto rounded-lg border border-border">
              {models.map((model) => (
                <label
                  key={model}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(model)}
                    onChange={() => toggle(model)}
                  />
                  <span className="mono">{model}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setSelected(allModelsSelected ? new Set() : new Set(models))}
                className="text-xs text-primary"
              >
                {allModelsSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <button
                disabled={!selected.size || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {importMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}{" "}
                Importar {selected.size} modelos
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Status({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}
    >
      <Power className="size-3" /> {enabled ? "Ativo" : "Desativado"}
    </span>
  );
}
function PlanBadge({ plan }: { plan: ProviderPlan }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${plan === "paid" ? "bg-violet-500/15 text-violet-300" : plan === "free" ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-400"}`}
    >
      <Layers className="size-3" /> {planLabel(plan)}
    </span>
  );
}
function Field({
  label,
  value,
  placeholder,
  disabled,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60"
      />
    </label>
  );
}
function PlanField({
  value,
  onChange,
}: {
  value: ProviderPlan;
  onChange: (value: ProviderPlan) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      Disponivel para
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ProviderPlan)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      >
        <option value="all">Todos os planos</option>
        <option value="paid">Plano Pago</option>
        <option value="free">Plano Free</option>
      </select>
    </label>
  );
}
