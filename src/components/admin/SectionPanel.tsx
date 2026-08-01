import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { deleteRecord, getSectionData, saveRecord } from "@/lib/admin.functions";
import type { SectionDef } from "@/lib/admin-sections";

function previewFields(json: string) {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, value]) => typeof value !== "object")
      .slice(0, 4);
  } catch {
    return [];
  }
}

export function SectionPanel({ section }: { section: SectionDef }) {
  const fetchSection = useServerFn(getSectionData);
  const save = useServerFn(saveRecord);
  const remove = useServerFn(deleteRecord);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<{ id: string; json: string; isNew: boolean } | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["section", section.key],
    queryFn: () => fetchSection({ data: { section: section.key } }),
  });

  const saveMutation = useMutation({
    mutationFn: (input: { recordId?: string; value: string }) =>
      save({ data: { section: section.key, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Alterações salvas");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["section", section.key] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast.error("Erro ao salvar no banco de dados"),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => remove({ data: { section: section.key, recordId } }),
    onSuccess: () => {
      toast.success("Registro removido");
      queryClient.invalidateQueries({ queryKey: ["section", section.key] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast.error("Erro ao remover registro"),
  });

  const isSingle = section.kind === "single";

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{section.label}</h2>
          <p className="text-sm text-muted-foreground">{section.description}</p>
          <p className="mono mt-1 text-xs text-muted-foreground/70">/{section.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["section", section.key] })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium transition hover:bg-secondary"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          {!isSingle ? (
            <button
              onClick={() => setEditing({ id: "", json: "{\n  \n}", isNew: true })}
              className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-90"
            >
              <Plus className="size-3.5" />
              Novo registro
            </button>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando dados…
        </div>
      ) : isSingle ? (
        <SingleEditor
          json={data?.json ?? "{}"}
          saving={saveMutation.isPending}
          onSave={(value) => saveMutation.mutate({ value })}
        />
      ) : (
        <div className="grid gap-3">
          {(data?.records ?? []).length === 0 ? (
            <div className="panel p-6 text-sm text-muted-foreground">Nenhum registro nesta seção.</div>
          ) : null}
          {(data?.records ?? []).map((record) => (
            <article key={record.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono truncate text-sm font-semibold text-primary">{record.id}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {previewFields(record.json).map(([key, value]) => (
                      <div key={key} className="flex gap-1">
                        <dt className="text-muted-foreground/70">{key}:</dt>
                        <dd className="text-foreground">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() =>
                      setEditing(
                        editing?.id === record.id && !editing.isNew
                          ? null
                          : { id: record.id, json: record.json, isNew: false },
                      )
                    }
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium transition hover:bg-secondary"
                  >
                    {editing?.id === record.id && !editing.isNew ? "Fechar" : "Editar"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${record.id}" definitivamente?`)) {
                        deleteMutation.mutate(record.id);
                      }
                    }}
                    className="rounded-lg border border-destructive/40 px-2.5 py-1.5 text-destructive transition hover:bg-destructive/10"
                    aria-label={`Remover ${record.id}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              {editing?.id === record.id && !editing.isNew ? (
                <RecordEditor
                  json={editing.json}
                  saving={saveMutation.isPending}
                  onChange={(json) => setEditing({ ...editing, json })}
                  onSave={() => saveMutation.mutate({ recordId: record.id, value: editing.json })}
                />
              ) : null}
            </article>
          ))}

          {editing?.isNew ? (
            <article className="panel glow-ring p-4">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Identificador do registro
              </label>
              <input
                value={editing.id}
                onChange={(event) => setEditing({ ...editing, id: event.target.value })}
                placeholder="ex: plano-premium"
                className="mono mt-1.5 w-full rounded-lg border border-input bg-secondary/60 px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <RecordEditor
                json={editing.json}
                saving={saveMutation.isPending}
                onChange={(json) => setEditing({ ...editing, json })}
                onSave={() => saveMutation.mutate({ recordId: editing.id, value: editing.json })}
                onCancel={() => setEditing(null)}
              />
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RecordEditor({
  json,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  json: string;
  saving: boolean;
  onChange: (json: string) => void;
  onSave: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <textarea
        value={json}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        rows={Math.min(20, json.split("\n").length + 2)}
        className="mono w-full rounded-lg border border-input bg-background/70 p-3 text-xs leading-relaxed outline-none focus:border-ring"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="accent-surface inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Salvar
        </button>
        {onCancel ? (
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-secondary"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SingleEditor({
  json,
  saving,
  onSave,
}: {
  json: string;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(json);
  const [loadedFrom, setLoadedFrom] = useState(json);
  if (loadedFrom !== json) {
    setLoadedFrom(json);
    setValue(json);
  }

  return (
    <div className="panel p-4">
      <RecordEditor json={value} saving={saving} onChange={setValue} onSave={() => onSave(value)} />
    </div>
  );
}
