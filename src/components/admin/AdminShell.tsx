import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Bell,
  Bot,
  CreditCard,
  Globe,
  Layers,
  Loader2,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { adminLogout } from "@/lib/admin.functions";
import { getAdminDashboard, getSystemMetrics } from "@/lib/admin-dashboard.functions";
import { AIManagementPanel } from "./AIManagementPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PaymentsPanel } from "./PaymentsPanel";
import { PlansPanel } from "./PlansPanel";
import { ServerStatusBar } from "./DashboardShared";
import { LandingAnalyticsPanel } from "./LandingAnalyticsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SystemPanel } from "./SystemPanel";
import { UsersPanel } from "./UsersPanel";

type Page =
  | "analytics"
  | "landing"
  | "users"
  | "ai"
  | "plans"
  | "payments"
  | "notifications"
  | "settings"
  | "system";
const NAV: Array<{ id: Page; label: string; icon: typeof Users }> = [
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "landing", label: "Página / APK", icon: Globe },
  { id: "users", label: "Usuários", icon: Users },
  { id: "ai", label: "IA: Provedores e Modelos", icon: Bot },
  { id: "plans", label: "Planos", icon: Layers },
  { id: "payments", label: "Pagamentos", icon: CreditCard },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "settings", label: "Config", icon: Settings },
  { id: "system", label: "Sistema", icon: ShieldCheck },
];

export function AdminShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [active, setActive] = useState<Page>("analytics");
  const logout = useServerFn(adminLogout);
  const loadDashboard = useServerFn(getAdminDashboard);
  const loadMetrics = useServerFn(getSystemMetrics);
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => loadDashboard(),
    refetchInterval: 30_000,
  });
  const metrics = useQuery({
    queryKey: ["system-metrics"],
    queryFn: () => loadMetrics(),
    refetchInterval: 10_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <ServerStatusBar metrics={metrics.data} />
      <div className="flex min-h-[calc(100vh-60px)]">
        <aside className="sticky top-0 flex h-screen w-20 shrink-0 flex-col border-r border-border bg-card/75 p-3 backdrop-blur sm:w-64 sm:p-4">
          <button
            onClick={() => setActive("analytics")}
            className="flex items-center justify-center gap-3 rounded-xl px-1 py-2 sm:justify-start"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-400 font-black text-white shadow-lg shadow-primary/20">
              A
            </span>
            <span className="hidden text-left text-base font-bold sm:block">
              Axion <b className="text-primary">Admin</b>
              <small className="mt-0.5 block text-[0.62rem] font-normal uppercase tracking-widest text-muted-foreground">
                Painel de controle
              </small>
            </span>
          </button>

          <p className="mb-2 mt-7 hidden px-3 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 sm:block">
            Navegação
          </p>
          <nav className="flex flex-1 flex-col gap-1.5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                title={label}
                onClick={() => setActive(id)}
                className={`group flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-xs font-medium transition sm:justify-start ${active === id ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Icon className="size-[1.1rem] shrink-0" />
                <span className="hidden text-left sm:block">{label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 hidden rounded-xl bg-secondary/50 px-3 py-2.5 sm:block">
              <p className="truncate text-xs font-semibold">{username}</p>
              <p className="text-[0.65rem] text-muted-foreground">Administrador</p>
            </div>
            <button
              title="Sair"
              onClick={async () => {
                await logout();
                queryClient.clear();
                onLogout();
              }}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 sm:justify-start"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="hidden sm:block">Sair do painel</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-[1480px]">
            {dashboard.isLoading ? (
              <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" /> Carregando dados do
                Firebase...
              </div>
            ) : dashboard.error || !dashboard.data ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                Não foi possível carregar o painel.{" "}
                <button onClick={() => dashboard.refetch()} className="ml-2 underline">
                  Tentar novamente
                </button>
              </div>
            ) : (
              <PageContent
                page={active}
                data={dashboard.data}
                refreshing={dashboard.isFetching}
                onRefresh={() => dashboard.refetch()}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function PageContent({
  page,
  data,
  refreshing,
  onRefresh,
}: {
  page: Page;
  data: Awaited<ReturnType<typeof getAdminDashboard>>;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (page === "users") return <UsersPanel data={data} />;
  if (page === "ai") return <AIManagementPanel />;
  if (page === "plans") return <PlansPanel data={data} />;
  if (page === "payments") return <PaymentsPanel data={data} />;
  if (page === "notifications") return <NotificationsPanel data={data} />;
  if (page === "settings") return <SettingsPanel data={data} />;
  if (page === "system") return <SystemPanel data={data} />;
  if (page === "landing") return <LandingAnalyticsPanel />;
  return <AnalyticsPanel data={data} refreshing={refreshing} onRefresh={onRefresh} />;
}
