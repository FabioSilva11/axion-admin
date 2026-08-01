import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Users, Layers, Cpu, Server, Loader2 } from "lucide-react";

import { getOverview } from "@/lib/admin.functions";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="panel flex items-center gap-4 p-4">
      <span className="accent-surface inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function OverviewSection() {
  const fetchOverview = useServerFn(getOverview);
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: () => fetchOverview() });

  if (isLoading || !data) {
    return (
      <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando visão geral…
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Visão geral</h2>
        <p className="text-sm text-muted-foreground">Resumo em tempo real do banco de dados Axion.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuários" value={data.totals.users} icon={Users} />
        <StatCard label="Planos" value={data.totals.plans} icon={Layers} />
        <StatCard label="Modelos" value={data.totals.models} icon={Cpu} />
        <StatCard label="Provedores" value={data.totals.providers} icon={Server} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" /> Status dos serviços
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">API principal</span>
              <StatusPill online={data.apiOnline} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">CLI Proxy</span>
              <StatusPill online={data.proxyOnline} />
            </li>
          </ul>
          {data.apiEndpoint ? (
            <p className="mono mt-4 truncate rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              {data.apiEndpoint}
            </p>
          ) : null}
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-semibold">Usuários por plano</h3>
          <ul className="mt-4 space-y-3">
            {Object.entries(data.perPlan).map(([plan, count]) => {
              const percent = data.totals.users ? (count / data.totals.users) * 100 : 0;
              return (
                <li key={plan}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{plan}</span>
                    <span className="text-muted-foreground tabular-nums">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="accent-surface h-full rounded-full" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <h3 className="border-b border-border p-5 text-sm font-semibold">Últimos usuários</h3>
        <div className="divide-y divide-border">
          {data.recentUsers.map((user) => (
            <div key={user.uid} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-xs capitalize text-primary">
                  {user.plan}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        online ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive"
      }`}
    >
      <span className={`size-1.5 rounded-full ${online ? "bg-accent" : "bg-destructive"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
