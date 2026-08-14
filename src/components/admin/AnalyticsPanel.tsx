import { useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bot, CreditCard, RefreshCw, Server, Users } from "lucide-react";

import { getAdminDashboard } from "@/lib/admin-dashboard.functions";
import { MetricCard, Panel, ProgressBar, SectionHeader, StatusBadge, formatCurrency, formatDate, formatNumber } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;
type AnalyticsTab = "overview" | "usage" | "online" | "models" | "providers" | "revenue" | "alerts" | "reports";

const TABS: Array<{ id: AnalyticsTab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "usage", label: "Uso e custos" },
  { id: "online", label: "Usuários online" },
  { id: "models", label: "Modelos" },
  { id: "providers", label: "Provedores" },
  { id: "revenue", label: "Planos e receita" },
  { id: "alerts", label: "Alertas" },
  { id: "reports", label: "Relatórios" },
];

export function AnalyticsPanel({ data, refreshing, onRefresh }: { data: Dashboard; refreshing: boolean; onRefresh: () => void }) {
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Analytics"
        description={`Dados reais do Firebase · atualizado em ${new Date(data.generatedAt).toLocaleTimeString("pt-BR")}`}
        action={
          <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary">
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </button>
        }
      />
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/50 p-1">
        {TABS.map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? <Overview data={data} /> : null}
      {tab === "usage" ? <Usage data={data} /> : null}
      {tab === "online" ? <OnlineUsers data={data} /> : null}
      {tab === "models" ? <Ranking title="Modelos mais usados" items={data.modelUsage.map((item) => ({ id: item.modelId, label: item.name, value: item.tokens, detail: `${formatNumber(item.requests)} requisições` }))} /> : null}
      {tab === "providers" ? <ProviderAnalytics data={data} /> : null}
      {tab === "revenue" ? <Revenue data={data} /> : null}
      {tab === "alerts" ? <Alerts data={data} /> : null}
      {tab === "reports" ? <PaymentsReport data={data} /> : null}
    </section>
  );
}

function Overview({ data }: { data: Dashboard }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Online agora" value={formatNumber(data.totals.online)} hint="atividade nos últimos 5 min" />
        <MetricCard label="Usuários" value={formatNumber(data.totals.users)} />
        <MetricCard label="Tokens entrada" value={formatNumber(data.totals.inputTokens)} />
        <MetricCard label="Tokens saída" value={formatNumber(data.totals.outputTokens)} />
        <MetricCard label="Requisições" value={formatNumber(data.modelUsage.reduce((sum, item) => sum + item.requests, 0))} />
        <MetricCard label="Créditos" value={formatNumber(data.totals.credits)} />
        <MetricCard label="Receita" value={formatCurrency(data.totals.revenueCents)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <DailyBars data={data.dailyUsage} />
        <Panel className="p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Activity className="size-4 text-primary" /> Saúde dos dados</h3>
          <div className="mt-4 space-y-3 text-xs">
            <HealthLine label="API principal" good={data.config.api.online} detail={data.config.api.endpoint || "Sem endpoint"} />
            <HealthLine label="CLI Proxy" good={data.config.proxy.online} detail={data.config.proxy.endpoint || "Sem endpoint"} />
            <HealthLine label="Provedores ativos" good={data.providers.some((provider) => provider.enabled)} detail={`${data.providers.filter((provider) => provider.enabled).length} de ${data.providers.length}`} />
            <HealthLine label="Mercado Pago" good={data.config.payments.configured} detail={data.config.payments.mode} />
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranking title="Modelos mais usados" items={data.modelUsage.slice(0, 8).map((item) => ({ id: item.modelId, label: item.name, value: item.tokens, detail: `${item.requests} req.` }))} />
        <Ranking title="Consumo por provedor" items={data.providerUsage.slice(0, 8).map((item) => ({ id: item.providerId, label: item.name, value: item.tokens, detail: `${item.requests} req.` }))} />
      </div>
    </div>
  );
}

function Usage({ data }: { data: Dashboard }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DailyBars data={data.dailyUsage} />
      <Ranking title="Créditos por modelo" items={data.modelUsage.map((item) => ({ id: item.modelId, label: item.name, value: item.credits, detail: `${formatNumber(item.tokens)} tokens` }))} />
    </div>
  );
}

function OnlineUsers({ data }: { data: Dashboard }) {
  const online = data.users.filter((user) => user.online);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Online agora" value={String(online.length)} />
        <MetricCard label="Ativos em 5 minutos" value={String(online.length)} />
        <MetricCard label="Base online" value={`${data.totals.users ? ((online.length / data.totals.users) * 100).toFixed(1) : "0"}%`} />
      </div>
      <Panel className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-bold">Sessões ativas</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-muted-foreground"><tr>{["Status", "Usuário", "Plano", "Papel", "Uso", "Último sinal"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{online.map((user) => <tr key={user.uid}><td className="px-4 py-3"><StatusBadge active label="Online" /></td><td className="px-4 py-3"><p className="font-semibold">{user.name}</p><p className="text-muted-foreground">{user.email}</p></td><td className="px-4 py-3">{user.plan}</td><td className="px-4 py-3">{user.role}</td><td className="px-4 py-3">{formatNumber(user.creditsUsed)} créditos</td><td className="px-4 py-3">{formatDate(user.lastActiveAt, true)}</td></tr>)}</tbody>
          </table>
        </div>
        {!online.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum usuário ativo nos últimos cinco minutos.</p> : null}
      </Panel>
    </div>
  );
}

function ProviderAnalytics({ data }: { data: Dashboard }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Ranking title="Tokens por provedor" items={data.providers.map((item) => ({ id: item.id, label: item.name, value: item.tokens, detail: `${item.requests} requisições` }))} />
      <Panel className="p-4"><h3 className="text-sm font-bold">Disponibilidade</h3><div className="mt-4 space-y-3">{data.providers.map((provider) => <div key={provider.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{provider.name}</p><p className="truncate text-xs text-muted-foreground">{provider.baseUrl}</p></div><StatusBadge active={provider.enabled && provider.credentialConfigured} label={provider.enabled ? (provider.credentialConfigured ? "Disponível" : "Sem chave") : "Desativado"} /></div>)}</div></Panel>
    </div>
  );
}

function Revenue({ data }: { data: Dashboard }) {
  const perPlan = data.plans.map((plan) => ({ ...plan, users: data.users.filter((user) => user.plan === plan.id).length }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><MetricCard label="Assinaturas ativas" value={String(data.totals.activeSubscriptions)} /><MetricCard label="Pagamentos pendentes" value={String(data.payments.filter((payment) => !payment.activated).length)} /><MetricCard label="Planos publicados" value={String(data.plans.filter((plan) => plan.active).length)} /><MetricCard label="Receita confirmada" value={formatCurrency(data.totals.revenueCents)} /></div>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Ranking title="Distribuição de usuários" items={perPlan.map((plan) => ({ id: plan.id, label: plan.name, value: plan.users, detail: formatCurrency(plan.priceCents) }))} />
        <PaymentsReport data={data} compact />
      </div>
    </div>
  );
}

function Alerts({ data }: { data: Dashboard }) {
  const alerts = [
    ...data.providers.filter((provider) => !provider.enabled || !provider.credentialConfigured).map((provider) => ({ title: `Provedor ${provider.name}`, body: !provider.enabled ? "Provedor desativado." : "Credencial ausente." })),
    ...data.models.filter((model) => !model.active).map((model) => ({ title: `Modelo ${model.name}`, body: "Modelo não publicado no aplicativo." })),
    ...(data.config.payments.configured ? [] : [{ title: "Mercado Pago", body: "Credencial de pagamento ausente no servidor." }]),
  ];
  return <Panel className="p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="size-4 text-amber-400" /> Alertas operacionais</h3><div className="mt-4 space-y-2">{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-sm font-semibold text-amber-300">{alert.title}</p><p className="text-xs text-muted-foreground">{alert.body}</p></div>)}{!alerts.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum alerta ativo.</p> : null}</div></Panel>;
}

function PaymentsReport({ data, compact = false }: { data: Dashboard; compact?: boolean }) {
  return <Panel className="overflow-hidden"><div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold"><CreditCard className="size-4 text-primary" /> Assinaturas e pagamentos</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-muted-foreground"><tr>{["Usuário", "Plano", "Valor", "Status", "Validação", "Data"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.payments.slice(0, compact ? 8 : 50).map((payment) => <tr key={payment.checkoutId}><td className="px-4 py-3"><p className="font-semibold">{payment.userName}</p><p className="text-muted-foreground">{payment.userEmail}</p></td><td className="px-4 py-3">{payment.planId}</td><td className="px-4 py-3">{formatCurrency(payment.amountCents)}</td><td className="px-4 py-3"><StatusBadge active={payment.activated} label={payment.activated ? "Confirmado" : payment.status} /></td><td className="px-4 py-3">{payment.statusDetail || "Aguardando"}</td><td className="px-4 py-3">{formatDate(payment.createdAt)}</td></tr>)}</tbody></table></div>{!data.payments.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : null}</Panel>;
}

function DailyBars({ data }: { data: Dashboard["dailyUsage"] }) {
  const max = Math.max(1, ...data.map((item) => item.tokens));
  return <Panel className="p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="size-4 text-primary" /> Consumo diário</h3><div className="mt-4 space-y-2.5">{data.map((item) => <div key={item.day} className="grid grid-cols-[72px_1fr_92px] items-center gap-3 text-xs"><span>{new Date(`${item.day}T12:00:00`).toLocaleDateString("pt-BR")}</span><ProgressBar value={item.tokens} max={max} /><span className="text-right tabular-nums text-muted-foreground">{formatNumber(item.tokens)}</span></div>)}{!data.length ? <p className="py-8 text-center text-sm text-muted-foreground">O consumo aparecerá após as primeiras requisições.</p> : null}</div></Panel>;
}

function Ranking({ title, items }: { title: string; items: Array<{ id: string; label: string; value: number; detail: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <Panel className="p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><Bot className="size-4 text-primary" /> {title}</h3><div className="mt-4 space-y-3">{items.map((item) => <div key={item.id}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{item.label || item.id}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(item.value)} · {item.detail}</span></div><ProgressBar value={item.value} max={max} /></div>)}{!items.length ? <p className="py-8 text-center text-sm text-muted-foreground">Sem dados neste período.</p> : null}</div></Panel>;
}

function HealthLine({ label, good, detail }: { label: string; good: boolean; detail: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="font-semibold">{label}</p><p className="truncate text-muted-foreground">{detail}</p></div><StatusBadge active={good} /></div>;
}
