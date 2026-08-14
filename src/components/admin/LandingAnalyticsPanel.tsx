import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  Download,
  Eye,
  Globe2,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getLandingAnalytics } from "@/lib/landing-analytics.functions";
import { MetricCard, Panel, SectionHeader, formatDate, formatNumber } from "./DashboardShared";
import { LandingMap } from "./LandingMap";

type Report = Awaited<ReturnType<typeof getLandingAnalytics>>;

const EVENT_LABELS: Record<string, string> = {
  page_view: "Visita",
  download: "Download do APK",
  download_click: "Download do APK",
  apk_click: "Clique no APK",
  download_conversion: "Download",
  google_play_click: "Clique Google Play",
  start_free_click: "Clique começar grátis",
  subscribe_premium_click: "Clique assinar",
  pricing_section_view: "Viu planos",
  faq_open: "Abriu FAQ",
  qr_code_click: "Clique no QR Code",
};

export function LandingAnalyticsPanel() {
  const load = useServerFn(getLandingAnalytics);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["landing-analytics"],
    queryFn: () => load(),
  });

  if (!data) {
    return (
      <Panel className="p-10 text-center text-sm text-muted-foreground">
        Carregando analytics da página de vendas…
      </Panel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Desempenho da página (APK)"
        description={`Visitas e downloads da landing · atualizado em ${new Date(data.generatedAt).toLocaleTimeString("pt-BR")}`}
        action={
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Visitas"
          value={formatNumber(data.totals.visits)}
          hint="carregamentos da página"
        />
        <MetricCard
          label="Downloads"
          value={formatNumber(data.totals.downloads)}
          hint="cliques no botão de download"
        />
        <MetricCard
          label="Conversão"
          value={`${data.conversion.toFixed(1)}%`}
          hint="downloads ÷ visitas"
        />
        <MetricCard
          label="Visitantes únicos"
          value={formatNumber(data.totals.visitors)}
          hint="baseado em visitas rastreadas"
        />
        <MetricCard
          label="Países"
          value={formatNumber(data.totals.countries)}
          hint="localizações únicas"
        />
        <MetricCard
          label="Eventos"
          value={formatNumber(data.totals.events)}
          hint="interações registradas"
        />
      </div>

      <Panel className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <MousePointerClick className="size-4 text-primary" /> Visitas e downloads por dia (últimos
          30 dias)
        </h3>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.2)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tickFormatter={(value: string) =>
                  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })
                }
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#0b1020",
                  border: "1px solid rgba(148,163,184,0.3)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  formatNumber(value),
                  name === "visits" ? "Visitas" : name === "downloads" ? "Downloads" : name,
                ]}
              />
              <Legend
                formatter={(value: string) => (value === "visits" ? "Visitas" : "Downloads")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="visits" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="downloads" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!data.series.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sem dados ainda — as visitas aparecerão após o primeiro acesso à página.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold">
            <Globe2 className="size-4 text-primary" /> Localização dos usuários
          </div>
          <div className="p-4">
            <LandingMap points={data.map} />
          </div>
          {!data.map.length ? (
            <p className="px-4 pb-6 text-center text-sm text-muted-foreground">
              Localizações aparecerão após as primeiras visitas.
            </p>
          ) : null}
        </Panel>

        <div className="space-y-4">
          <Ranking
            title="Países"
            icon={Globe2}
            items={data.topCountries.map((item) => ({ label: item.name, value: item.count }))}
          />
          <Ranking
            title="Dispositivos"
            icon={MonitorSmartphone}
            items={data.devices.map((item) => ({ label: item.label, value: item.count }))}
          />
          <Ranking
            title="Origem do tráfego"
            icon={Eye}
            items={data.topReferrers.map((item) => ({ label: item.referrer, value: item.count }))}
          />
        </div>
      </div>

      <RecentEvents data={data} />
    </section>
  );
}

function Ranking({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Globe2;
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <Panel className="p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" /> {title}
      </h3>
      <div className="mt-3 space-y-2.5">
        {items.slice(0, 8).map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium">{item.label || "(direto)"}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatNumber(item.value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (item.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {!items.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : null}
      </div>
    </Panel>
  );
}

function RecentEvents({ data }: { data: Report }) {
  const events = data.recent
    .filter(
      (item) =>
        item.event === "page_view" || item.event === "download" || item.event === "apk_click",
    )
    .slice(0, 40);
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold">
        <ArrowDownToLine className="size-4 text-primary" /> Atividade recente da página
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              {["Evento", "Página", "Localização", "Dispositivo", "Quando"].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    {item.event === "page_view" ? (
                      <Eye className="size-3.5 text-violet-400" />
                    ) : (
                      <Download className="size-3.5 text-emerald-400" />
                    )}
                    {EVENT_LABELS[item.event] ?? item.event}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{item.path}</td>
                <td className="px-4 py-3">
                  {[item.city, item.country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">{item.device}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(item.ts, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!events.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma atividade registrada ainda.
        </p>
      ) : null}
    </Panel>
  );
}
