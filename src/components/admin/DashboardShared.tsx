import type { ReactNode } from "react";
import { Activity, Cpu, Database, HardDrive, Network, Server } from "lucide-react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card/70 ${className}`}>{children}</div>;
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="min-w-0 p-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

export function ProgressBar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "accent" | "danger" }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = tone === "danger" ? "bg-destructive" : tone === "accent" ? "bg-accent" : "bg-primary";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-red-500/40 bg-red-500/10 text-red-400"}`}>
      <span className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`} />
      {label ?? (active ? "Ativo" : "Inativo")}
    </span>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  );
}

export type SystemMetrics = {
  hostname: string;
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  rxBytes: number;
  txBytes: number;
  uptimeSeconds: number;
  timestamp: number;
};

const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

export function ServerStatusBar({ metrics }: { metrics?: SystemMetrics }) {
  const memoryPercent = metrics?.memoryTotal ? (metrics.memoryUsed / metrics.memoryTotal) * 100 : 0;
  const diskPercent = metrics?.diskTotal ? (metrics.diskUsed / metrics.diskTotal) * 100 : 0;
  return (
    <div className="border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto grid max-w-[1480px] gap-2 text-[0.65rem] sm:grid-cols-2 lg:grid-cols-6">
        <StatusItem icon={Server} label="VPS" value={metrics ? "ONLINE" : "CARREGANDO"} active />
        <StatusItem icon={Cpu} label="CPU" value={`${(metrics?.cpuPercent ?? 0).toFixed(1)}%`} progress={metrics?.cpuPercent ?? 0} />
        <StatusItem icon={Activity} label="RAM" value={`${memoryPercent.toFixed(1)}% · ${bytes(metrics?.memoryUsed ?? 0)}`} progress={memoryPercent} />
        <StatusItem icon={HardDrive} label="DISCO" value={`${diskPercent.toFixed(1)}% · ${bytes(metrics?.diskUsed ?? 0)}`} progress={diskPercent} />
        <StatusItem icon={Network} label="REDE" value={`↓ ${bytes(metrics?.rxBytes ?? 0)} · ↑ ${bytes(metrics?.txBytes ?? 0)}`} />
        <StatusItem icon={Database} label="UPTIME" value={duration(metrics?.uptimeSeconds ?? 0)} />
      </div>
    </div>
  );
}

function StatusItem({ icon: Icon, label, value, progress, active }: { icon: typeof Server; label: string; value: string; progress?: number; active?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-semibold text-muted-foreground"><Icon className="size-3" /> {label}</span>
        <span className={active ? "font-bold text-emerald-400" : "font-semibold tabular-nums"}>{value}</span>
      </div>
      {typeof progress === "number" ? <div className="mt-1.5"><ProgressBar value={progress} max={100} /></div> : null}
    </div>
  );
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

export function formatDate(timestamp: number, includeTime = false) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("pt-BR", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(timestamp));
}
