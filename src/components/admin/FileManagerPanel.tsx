import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderArchive, Loader2, Package, Play, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Panel, SectionHeader, StatusBadge } from "./DashboardShared";

type LandingFile = { name: string; size: number; mtime: number; active: boolean };

const ACTIVE_NAME = "axion.apk";

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const formatDate = (mtime: number) =>
  mtime ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(mtime)) : "—";

export function FileManagerPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["landing-files"],
    queryFn: async () => {
      const res = await fetch("/api/files?dir=apk");
      if (!res.ok) throw new Error("Falha ao listar arquivos.");
      const data = (await res.json()) as { files: LandingFile[] };
      return data.files;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["landing-files"] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/files?dir=apk&name=${encodeURIComponent(file.name)}&size=${file.size}`);
        xhr.setRequestHeader("Content-Type", "application/vnd.android.package-archive");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            try {
              const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
              reject(new Error(body.error?.message ?? "Upload falhou."));
            } catch {
              reject(new Error(`Upload falhou (HTTP ${xhr.status}).`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Falha de rede durante o upload."));
        xhr.send(file);
      });
    },
    onSuccess: (_data, file) => {
      toast.success(file.name === ACTIVE_NAME ? "Aplicativo atualizado e publicado." : `Arquivo ${file.name} enviado.`);
      setProgress(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setProgress(null);
    },
  });

  const activate = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/files?dir=apk&name=${encodeURIComponent(name)}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Falha ao ativar o arquivo.");
    },
    onSuccess: () => {
      toast.success("Novo aplicativo ativado e publicado.");
      invalidate();
    },
    onError: () => toast.error("Não foi possível ativar o arquivo."),
  });

  const remove = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/files?dir=apk&name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir o arquivo.");
    },
    onSuccess: () => {
      toast.success("Arquivo excluído.");
      invalidate();
    },
    onError: () => toast.error("Não foi possível excluir o arquivo."),
  });

  const files = list.data ?? [];
  const active = files.find((file) => file.name === ACTIVE_NAME) ?? files.find((file) => file.active);
  const candidates = files.filter((file) => file.name !== ACTIVE_NAME && file.name.endsWith(".apk"));

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) upload.mutate(file);
      event.target.value = "";
    },
    [upload],
  );

  const downloadUrl = (name: string) => `/api/files?dir=apk&name=${encodeURIComponent(name)}&download=1`;

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Arquivos da Landing"
        description="Gerencie o aplicativo (APK) publicado na página de vendas. O arquivo axion.apk é o que os usuários baixam."
        action={
          <button
            onClick={() => list.refetch()}
            disabled={list.isFetching}
            title="Atualizar"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${list.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Panel className="p-4">
          <h3 className="font-semibold">Aplicativo ativo</h3>
          {list.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Carregando...</p>
          ) : active ? (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <Package className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold">{active.name}</p>
                  <StatusBadge active label="Ativo" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(active.size)} · atualizado {formatDate(active.mtime)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={downloadUrl(active.name)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <Download className="size-3.5" /> Baixar APK atual
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Nenhum aplicativo ativo. Envie um APK para publicar.</p>
          )}

          <div className="mt-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
            <p className="text-xs font-semibold">Enviar novo aplicativo</p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Envie um APK com o nome <b className="font-mono">axion.apk</b> para substituir o atual, ou envie outra versão
              e depois ative usando a lista abaixo.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending || list.isLoading}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {upload.isPending ? "Enviando..." : "Escolher arquivo .apk"}
            </button>
            <input ref={fileInputRef} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden" onChange={onPick} />
            {upload.isPending ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress ?? 0}%` }} />
                </div>
                <p className="mt-1.5 text-center text-[0.68rem] tabular-nums text-muted-foreground">{progress ?? 0}%</p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <FolderArchive className="size-3.5 text-muted-foreground" /> Arquivos publicados
            </p>
            <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[0.65rem] text-muted-foreground">
              {files.length} {files.length === 1 ? "arquivo" : "arquivos"}
            </span>
          </div>
          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {list.isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Carregando...</p>
            ) : files.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Nenhum arquivo na pasta pública.</p>
            ) : (
              files.map((file) => (
                <div key={file.name} className="flex items-center gap-3 px-4 py-2.5">
                  <Package className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold">{file.name}</p>
                    <p className="text-[0.68rem] text-muted-foreground">
                      {formatBytes(file.size)} · {formatDate(file.mtime)}
                    </p>
                  </div>
                  {file.active ? (
                    <StatusBadge active label="Ativo" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      {file.name.endsWith(".apk") ? (
                        <button
                          onClick={() => activate.mutate(file.name)}
                          disabled={activate.isPending}
                          title="Tornar este arquivo o aplicativo ativo"
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
                        >
                          <Play className="size-3" /> Ativar
                        </button>
                      ) : null}
                      <a
                        href={downloadUrl(file.name)}
                        title="Baixar"
                        className="inline-flex items-center rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <Download className="size-3.5" />
                      </a>
                      <button
                        onClick={() => remove.mutate(file.name)}
                        disabled={remove.isPending}
                        title="Excluir"
                        className="inline-flex items-center rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {candidates.length > 0 ? (
        <Panel className="p-4">
          <h3 className="text-xs font-semibold">Versões disponíveis para ativar</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.map((file) => (
              <button
                key={file.name}
                onClick={() => activate.mutate(file.name)}
                disabled={activate.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                <Play className="size-3" /> {file.name}
              </button>
            ))}
          </div>
        </Panel>
      ) : null}
    </section>
  );
}

export { formatBytes };
