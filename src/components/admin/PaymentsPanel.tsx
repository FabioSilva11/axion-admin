import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { synchronizePayment } from "@/lib/admin.functions";
import { getAdminDashboard } from "@/lib/admin-dashboard.functions";
import { MetricCard, Panel, SectionHeader, StatusBadge, formatCurrency, formatDate } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

export function PaymentsPanel({ data }: { data: Dashboard }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const sync = useServerFn(synchronizePayment);
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: (checkoutId: string) => sync({ data: { checkoutId } }), onSuccess: (result) => { result.ok ? toast.success(`Pagamento atualizado: ${result.status}`) : toast.error(result.error); queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }); }, onError: () => toast.error("Falha ao consultar o Mercado Pago.") });
  const visible = useMemo(() => data.payments.filter((payment) => (status === "all" || payment.status === status) && `${payment.userName} ${payment.userEmail} ${payment.checkoutId}`.toLowerCase().includes(search.toLowerCase())), [data.payments, search, status]);
  const pending = data.payments.filter((payment) => payment.status === "pending").length;
  const approved = data.payments.filter((payment) => payment.activated).length;
  return <section className="space-y-4">
    <SectionHeader title="Planos e receita" description="Acompanhe assinaturas, pagamentos PIX e validação automática direta no Mercado Pago." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Receita confirmada" value={formatCurrency(data.totals.revenueCents)} /><MetricCard label="Pagamentos aprovados" value={String(approved)} /><MetricCard label="Pagamentos pendentes" value={String(pending)} /><MetricCard label="Assinaturas ativas" value={String(data.totals.activeSubscriptions)} /></div>
    <Panel className="flex flex-wrap gap-2 p-3"><label className="relative min-w-[230px] flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário ou pagamento" className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-xs" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-xs"><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="approved">Aprovados</option><option value="cancelled">Cancelados</option><option value="expired">Expirados</option></select></Panel>
    <Panel className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr>{["Usuário","Plano","Valor","Status","Validação","Criado","Expira","Ações"].map((name) => <th key={name} className="px-3 py-3 font-medium">{name}</th>)}</tr></thead><tbody>{visible.map((payment) => <tr key={payment.checkoutId} className="border-b border-border/60 last:border-0"><td className="px-3 py-3"><p className="font-semibold">{payment.userName}</p><p className="text-[0.65rem] text-muted-foreground">{payment.userEmail}</p></td><td className="px-3 py-3">{data.plans.find((plan) => plan.id === payment.planId)?.name ?? payment.planId}</td><td className="px-3 py-3 font-semibold">{formatCurrency(payment.amountCents)}</td><td className="px-3 py-3"><StatusBadge active={payment.activated} label={payment.status} /></td><td className="px-3 py-3">{payment.activated ? "Plano ativado" : payment.statusDetail || "Aguardando pagamento"}</td><td className="px-3 py-3">{formatDate(payment.createdAt, true)}</td><td className="px-3 py-3">{formatDate(payment.expiresAt, true)}</td><td className="px-3 py-3"><button disabled={mutation.isPending || payment.activated} onClick={() => mutation.mutate(payment.checkoutId)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-40"><RefreshCw className="size-3.5" /> Consultar</button></td></tr>)}</tbody></table>{visible.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum pagamento encontrado.</p> : null}</Panel>
  </section>;
}
