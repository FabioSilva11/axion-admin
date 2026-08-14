import { getAdminDashboard } from "@/lib/admin-dashboard.functions";
import { MetricCard, Panel, SectionHeader, formatCurrency, formatDate } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

export function PaymentsPanel({ data }: { data: Dashboard }) {
  const stats = data.paymentStats;
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Planos e receita"
        description="Somente totais agregados. Pagamentos concluídos ou expirados são removidos do Firebase."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Receita confirmada" value={formatCurrency(stats.revenueCents)} />
        <MetricCard label="Valor aguardando" value={formatCurrency(stats.pendingAmountCents)} />
        <MetricCard label="Pagamentos aprovados" value={String(stats.approvedCount)} />
        <MetricCard label="Pagamentos pendentes" value={String(stats.pendingCount)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cobranças criadas" value={String(stats.createdCount)} />
        <MetricCard label="Expiradas" value={String(stats.expiredCount)} />
        <MetricCard label="Falhas/cancelamentos" value={String(stats.failedCount)} />
        <MetricCard label="Assinaturas ativas" value={String(data.totals.activeSubscriptions)} />
      </div>
      <Panel className="p-4">
        <h3 className="text-sm font-bold">Privacidade e retenção</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          O Firebase mantém apenas cobranças ainda pendentes. Ao aprovar, expirar, cancelar ou
          falhar, a cobrança é contabilizada nos totais acima e removida. O histórico detalhado
          pertence ao dispositivo Android do usuário.
        </p>
        <p className="mt-3 text-[0.7rem] text-muted-foreground">
          Totais atualizados em{" "}
          {stats.updatedAt ? formatDate(stats.updatedAt, true) : "aguardando o primeiro pagamento"}.
        </p>
      </Panel>
    </section>
  );
}
