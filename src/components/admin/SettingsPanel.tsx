import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, CreditCard, Save, Settings, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  getAdminDashboard,
  saveAppBlockSettings,
  saveAppSettings,
} from "@/lib/admin-dashboard.functions";
import { Panel, SectionHeader } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

export function SettingsPanel({ data }: { data: Dashboard }) {
  const saveApp = useServerFn(saveAppSettings);
  const saveBlock = useServerFn(saveAppBlockSettings);
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(data.config.settings);
  const [accessBlock, setAccessBlock] = useState(data.config.accessBlock);

  const appMutation = useMutation({
    mutationFn: () => saveApp({ data: settings }),
    onSuccess: () => {
      toast.success("Links publicados no Firebase.");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Falha ao salvar os links."),
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      saveBlock({
        data: {
          enabled: accessBlock.enabled,
          title: accessBlock.title,
          body: accessBlock.body,
        },
      }),
    onSuccess: () => {
      toast.success(
        accessBlock.enabled
          ? "Bloqueio total ativado no aplicativo."
          : "Acesso ao aplicativo liberado.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Falha ao atualizar o bloqueio do aplicativo."),
  });

  const set = (key: keyof typeof settings, value: string) =>
    setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Configurações"
        description="Pagamentos, links públicos e disponibilidade remota do aplicativo."
      />

      <ConfigTitle
        number="01"
        icon={CreditCard}
        title="Pagamentos"
        subtitle="Use esta URL na configuração de Webhooks do Mercado Pago."
      />
      <Panel className="p-4">
        <h3 className="font-semibold">URL do webhook</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Cadastre esta URL para o tópico de pagamentos por Orders. Nenhuma credencial é exibida ou
          alterada pelo administrador.
        </p>
        <WebhookUrl value={data.config.payments.webhookUrl} />
      </Panel>

      <ConfigTitle
        number="02"
        icon={Settings}
        title="Conteúdo e comunidade"
        subtitle="Links atualizados no Firebase sem recompilar o aplicativo."
      />
      <Panel className="grid gap-3 p-4 md:grid-cols-2">
        <Field label="Canal do YouTube">
          <input
            value={settings.youtube}
            onChange={(event) => set("youtube", event.target.value)}
            placeholder="@canal ou URL"
          />
        </Field>
        <Field label="Telegram">
          <input
            value={settings.telegram}
            onChange={(event) => set("telegram", event.target.value)}
          />
        </Field>
        <Field label="WhatsApp">
          <input
            value={settings.whatsapp}
            onChange={(event) => set("whatsapp", event.target.value)}
          />
        </Field>
        <Field label="Facebook">
          <input
            value={settings.facebook}
            onChange={(event) => set("facebook", event.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <SaveButton
            pending={appMutation.isPending}
            onClick={() => appMutation.mutate()}
            label="Salvar links"
          />
        </div>
      </Panel>

      <ConfigTitle
        number="03"
        icon={ShieldAlert}
        title="Bloqueio total do aplicativo"
        subtitle="Substitui todas as telas do Android por um aviso obrigatório."
      />
      <Panel className="p-4">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
          <span>
            <b className="block text-sm">Bloquear o Axion inteiro</b>
            <span className="mt-1 block text-xs text-muted-foreground">
              O acesso é liberado automaticamente quando esta opção for desativada.
            </span>
          </span>
          <input
            type="checkbox"
            checked={accessBlock.enabled}
            onChange={(event) =>
              setAccessBlock((current) => ({ ...current, enabled: event.target.checked }))
            }
          />
        </label>
        <div className="mt-4 grid gap-3">
          <Field label="Título do aviso">
            <input
              value={accessBlock.title}
              onChange={(event) =>
                setAccessBlock((current) => ({ ...current, title: event.target.value }))
              }
              maxLength={120}
            />
          </Field>
          <Field label="Mensagem exibida na tela bloqueada">
            <textarea
              rows={6}
              value={accessBlock.body}
              onChange={(event) =>
                setAccessBlock((current) => ({ ...current, body: event.target.value }))
              }
              maxLength={4_000}
            />
          </Field>
        </div>
        {accessBlock.enabled ? (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Atenção: depois de salvar, usuários com acesso ao Firebase verão somente esta mensagem.
          </p>
        ) : null}
        <SaveButton
          pending={blockMutation.isPending}
          onClick={() => blockMutation.mutate()}
          label={
            accessBlock.enabled ? "Salvar e bloquear aplicativo" : "Salvar e liberar aplicativo"
          }
        />
      </Panel>
    </section>
  );
}

function ConfigTitle({
  number,
  icon: Icon,
  title,
  subtitle,
}: {
  number: string;
  icon: typeof Settings;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
        {number}
      </span>
      <Icon className="size-5 text-primary" />
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[0.7rem] font-medium text-muted-foreground">
      {label}
      <div className="mt-1 [&>*]:w-full [&>*]:rounded-lg [&>*]:border [&>*]:border-input [&>*]:bg-background [&>*]:px-3 [&>*]:py-2 [&>*]:text-xs [&>*]:text-foreground [&>*]:outline-none">
        {children}
      </div>
    </label>
  );
}

function WebhookUrl({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <code className="break-all text-xs text-primary">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("URL do webhook copiada.");
          window.setTimeout(() => setCopied(false), 1_500);
        }}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
      >
        {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
        {copied ? "Copiada" : "Copiar URL"}
      </button>
    </div>
  );
}

function SaveButton({
  pending,
  onClick,
  label,
}: {
  pending: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      disabled={pending}
      onClick={onClick}
      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
    >
      <Save className="size-4" />
      {label}
    </button>
  );
}
