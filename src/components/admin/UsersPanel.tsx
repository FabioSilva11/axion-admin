import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Coins, Search, Shield, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { getAdminDashboard, updateDashboardUser } from "@/lib/admin-dashboard.functions";
import { MetricCard, Panel, ProgressBar, SectionHeader, StatusBadge, formatDate, formatNumber } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;
type User = Dashboard["users"][number];

export function UsersPanel({ data }: { data: Dashboard }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const updateUser = useServerFn(updateDashboardUser);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { user: User; planId?: string; role?: "user" | "admin"; blocked?: boolean; creditDelta?: number }) =>
      updateUser({ data: {
        uid: input.user.uid,
        planId: input.planId ?? input.user.plan,
        role: input.role ?? (input.user.role === "admin" ? "admin" : "user"),
        blocked: input.blocked ?? input.user.blocked,
        creditDelta: input.creditDelta ?? 0,
      } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.error);
      toast.success("Usuário atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Não foi possível atualizar o usuário"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.users.filter((user) => {
      if (term && !`${user.name} ${user.email} ${user.uid}`.toLowerCase().includes(term)) return false;
      if (planFilter !== "all" && user.plan !== planFilter) return false;
      if (accessFilter === "active" && user.blocked) return false;
      if (accessFilter === "blocked" && !user.blocked) return false;
      return true;
    });
  }, [data.users, search, planFilter, accessFilter]);

  return (
    <section className="space-y-4">
      <SectionHeader title="Usuários" description="Gerencie acesso, plano, consumo, saldo e atividade." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Cadastrados" value={String(data.totals.users)} />
        <MetricCard label="Assinaturas ativas" value={String(data.totals.activeSubscriptions)} />
        <MetricCard label="Administradores" value={String(data.users.filter((user) => user.role === "admin").length)} />
        <MetricCard label="Bloqueados" value={String(data.totals.blocked)} />
        <MetricCard label="Online" value={String(data.totals.online)} />
      </div>
      <Panel className="flex flex-wrap gap-2 p-3">
        <label className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail ou UID" className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-primary" /></label>
        <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-xs"> <option value="all">Todos os planos</option>{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-xs"><option value="all">Todos os acessos</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option></select>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="border-b border-border text-muted-foreground"><tr>{["Usuário", "Papel", "Acesso", "Plano", "Assinatura", "Consumo", "Saldo", "Atividade", "Cadastro", "Ações"].map((label) => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => (
                <tr key={user.uid} className="align-top hover:bg-secondary/20">
                  <td className="px-3 py-3"><button onClick={() => setExpanded(expanded === user.uid ? null : user.uid)} className="text-left"><p className="font-bold">{user.name}</p><p className="max-w-[200px] truncate text-muted-foreground">{user.email}</p>{expanded === user.uid ? <p className="mt-1 max-w-[210px] break-all font-mono text-[0.62rem] text-muted-foreground">{user.uid}</p> : null}</button></td>
                  <td className="px-3 py-3"><select value={user.role === "admin" ? "admin" : "user"} disabled={mutation.isPending} onChange={(event) => mutation.mutate({ user, role: event.target.value as "user" | "admin" })} className="rounded-lg border border-input bg-background px-2 py-1"><option value="user">Usuário</option><option value="admin">Admin</option></select></td>
                  <td className="px-3 py-3"><StatusBadge active={!user.blocked} label={user.blocked ? "Bloqueado" : "Ativo"} /></td>
                  <td className="px-3 py-3"><select value={user.plan} disabled={mutation.isPending} onChange={(event) => mutation.mutate({ user, planId: event.target.value })} className="max-w-[150px] rounded-lg border border-input bg-background px-2 py-1">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td>
                  <td className="px-3 py-3"><StatusBadge active={user.subscriptionStatus === "active"} label={user.subscriptionStatus === "active" ? "Ativa" : user.subscriptionStatus === "none" ? "Sem assinatura" : user.subscriptionStatus} />{user.subscriptionExpiresAt ? <p className="mt-1 text-muted-foreground">vence {formatDate(user.subscriptionExpiresAt)}</p> : null}</td>
                  <td className="px-3 py-3"><div className="w-36"><p className="mb-1 tabular-nums">{formatNumber(user.creditsUsed)} / {formatNumber(user.creditLimit)}</p><ProgressBar value={user.creditsUsed} max={user.creditLimit} /></div></td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{formatNumber(user.creditsRemaining)}</td>
                  <td className="px-3 py-3"><StatusBadge active={user.online} label={user.online ? "Online" : "Offline"} /><p className="mt-1 text-muted-foreground">{formatDate(user.lastActiveAt, true)}</p></td>
                  <td className="px-3 py-3">{formatDate(user.createdAt)}</td>
                  <td className="px-3 py-3"><div className="flex gap-1.5"><button title="Ajustar créditos" disabled={mutation.isPending} onClick={() => { const raw = prompt("Quantidade de créditos para adicionar ou remover:", "1000"); const delta = Number(raw); if (Number.isSafeInteger(delta) && delta !== 0) mutation.mutate({ user, creditDelta: delta }); }} className="rounded-lg border border-primary/40 p-2 text-primary hover:bg-primary/10"><Coins className="size-3.5" /></button><button title={user.role === "admin" ? "Tornar usuário" : "Tornar administrador"} disabled={mutation.isPending} onClick={() => mutation.mutate({ user, role: user.role === "admin" ? "user" : "admin" })} className="rounded-lg border border-border p-2 hover:bg-secondary">{user.role === "admin" ? <UserCheck className="size-3.5" /> : <Shield className="size-3.5" />}</button><button title={user.blocked ? "Desbloquear" : "Bloquear"} disabled={mutation.isPending} onClick={() => { if (user.blocked || confirm(`Bloquear o acesso de ${user.name}?`)) mutation.mutate({ user, blocked: !user.blocked }); }} className={`rounded-lg border p-2 ${user.blocked ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"}`}><Ban className="size-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Mostrando {filtered.length} de {data.users.length} usuários</p>
      </Panel>
    </section>
  );
}
