import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, ImagePlus, Save } from "lucide-react";
import { toast } from "sonner";

import { getAdminDashboard, saveNotificationSettings } from "@/lib/admin-dashboard.functions";
import { Panel, SectionHeader } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

export function NotificationsPanel({ data }: { data: Dashboard }) {
  const [form, setForm] = useState(data.config.notification);
  const save = useServerFn(saveNotificationSettings);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => save({ data: { ...form, frequency: form.frequency as "always" | "once_per_revision" | "once_per_day" } }),
    onSuccess: (result) => {
      toast.success(`Diálogo publicado no Firebase (revisão ${result.revision}).`);
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Não foi possível publicar a notificação."),
  });
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4">
      <SectionHeader title="Notificações" description="Publique avisos remotos que o aplicativo consulta diretamente no Firebase." />
      <Panel className="p-1"><div className="flex gap-1"><button className="rounded-lg bg-primary/20 px-4 py-2 text-xs font-semibold text-primary">Diálogo ao abrir o app</button><button disabled title="Requer Firebase Cloud Messaging" className="rounded-lg px-4 py-2 text-xs text-muted-foreground">Notificações push</button></div></Panel>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Panel className="p-4">
          <h3 className="font-semibold">Configuração do diálogo</h3>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-border p-3 text-xs"><input type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} /> Exibir este diálogo no aplicativo</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título"><input value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>
            <Field label="Frequência"><select value={form.frequency} onChange={(event) => update("frequency", event.target.value)}><option value="always">Sempre que abrir o app</option><option value="once_per_revision">Uma vez por publicação</option><option value="once_per_day">Uma vez por dia</option></select></Field>
          </div>
          <Field label="Texto do aviso"><textarea rows={6} value={form.body} onChange={(event) => update("body", event.target.value)} /></Field>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-border p-3">
            {form.iconDataUrl ? <img src={form.iconDataUrl} alt="Ícone" className="size-14 rounded-xl object-cover" /> : <BellRing className="size-10 text-primary" />}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><ImagePlus className="size-4" /> Escolher ícone<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_500_000) return toast.error("A imagem deve ter até 1,5 MB."); const reader = new FileReader(); reader.onload = () => update("iconDataUrl", String(reader.result ?? "")); reader.readAsDataURL(file); }} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome do botão"><input value={form.buttonLabel} onChange={(event) => update("buttonLabel", event.target.value)} /></Field><Field label="Link ao clicar"><input value={form.buttonUrl} onChange={(event) => update("buttonUrl", event.target.value)} placeholder="https://..." /></Field></div>
          <button disabled={mutation.isPending || !form.title || !form.body} onClick={() => mutation.mutate()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4" /> Salvar e publicar diálogo</button>
        </Panel>
        <Panel className="h-fit p-4"><h3 className="text-xs font-semibold">Prévia no aplicativo</h3><div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-6 text-center shadow-2xl">{form.iconDataUrl ? <img src={form.iconDataUrl} alt="" className="mx-auto size-16 rounded-2xl object-cover" /> : <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/20"><BellRing className="size-8 text-primary" /></div>}<h4 className="mt-4 text-lg font-bold">{form.title || "Título"}</h4><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{form.body || "Conteúdo do aviso"}</p>{form.buttonLabel ? <button className="mt-6 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">{form.buttonLabel}</button> : null}</div><p className="mt-2 text-[0.68rem] text-muted-foreground">Revisão atual: {form.revision || 0}</p></Panel>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-[0.7rem] font-medium text-muted-foreground">{label}<div className="mt-1 [&>*]:w-full [&>*]:rounded-lg [&>*]:border [&>*]:border-input [&>*]:bg-background [&>*]:px-3 [&>*]:py-2 [&>*]:text-xs [&>*]:text-foreground [&>*]:outline-none">{children}</div></label>;
}
