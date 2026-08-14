import { getAdminDashboard } from "@/lib/admin-dashboard.functions";
import { ApiManualSection } from "./ApiManualSection";
import { Panel, SectionHeader, StatusBadge } from "./DashboardShared";

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;
export function SystemPanel({ data }: { data: Dashboard }) {
  return <section className="space-y-5"><SectionHeader title="Sistema e API" description="Saúde dos serviços, endpoints públicos e manual de integração." /><div className="grid gap-3 md:grid-cols-2"><Panel className="p-4"><div className="flex justify-between"><h3 className="font-semibold">API principal</h3><StatusBadge active={data.config.api.online} /></div><p className="mt-3 break-all font-mono text-xs text-primary">{data.config.api.endpoint || "Endpoint não publicado"}</p><p className="mt-2 text-xs text-muted-foreground">O aplicativo lê este endereço no Firebase em config/api.</p></Panel><Panel className="p-4"><div className="flex justify-between"><h3 className="font-semibold">CLI Proxy</h3><StatusBadge active={data.config.proxy.online} /></div><p className="mt-3 break-all font-mono text-xs text-primary">{data.config.proxy.endpoint || "Endpoint não publicado"}</p></Panel></div><ApiManualSection /></section>;
}
