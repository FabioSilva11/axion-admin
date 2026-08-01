import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Users,
  Layers,
  Cpu,
  Server,
  CreditCard,
  Radio,
  Terminal,
  LogOut,
} from "lucide-react";

import { SECTIONS, type SectionDef } from "@/lib/admin-sections";
import { adminLogout } from "@/lib/admin.functions";
import { OverviewSection } from "./OverviewSection";
import { SectionPanel } from "./SectionPanel";

const ICONS = {
  users: Users,
  plans: Layers,
  models: Cpu,
  providers: Server,
  payment: CreditCard,
  api: Radio,
  proxy: Terminal,
} as const;

export function AdminShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [active, setActive] = useState<string>("overview");
  const logout = useServerFn(adminLogout);
  const queryClient = useQueryClient();

  const section: SectionDef | undefined = SECTIONS.find((item) => item.key === active);

  const dataGroup = SECTIONS.filter((item) => item.kind === "collection");
  const configGroup = SECTIONS.filter((item) => item.kind === "single");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-sidebar-border bg-sidebar p-4 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5">
          <span className="accent-surface inline-flex size-9 items-center justify-center rounded-lg text-sm font-bold">
            A
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Axion Admin</p>
            <p className="text-xs text-muted-foreground">{username}</p>
          </div>
        </div>

        <nav className="mt-6 space-y-6">
          <NavGroup title="Painel">
            <NavItem
              label="Visão geral"
              icon={LayoutDashboard}
              active={active === "overview"}
              onClick={() => setActive("overview")}
            />
          </NavGroup>

          <NavGroup title="Dados">
            {dataGroup.map((item) => (
              <NavItem
                key={item.key}
                label={item.label}
                icon={ICONS[item.icon]}
                active={active === item.key}
                onClick={() => setActive(item.key)}
              />
            ))}
          </NavGroup>

          <NavGroup title="Chaves e serviços">
            {configGroup.map((item) => (
              <NavItem
                key={item.key}
                label={item.label}
                icon={ICONS[item.icon]}
                active={active === item.key}
                onClick={() => setActive(item.key)}
              />
            ))}
          </NavGroup>
        </nav>

        <button
          onClick={async () => {
            await logout();
            queryClient.clear();
            onLogout();
          }}
          className="mt-8 inline-flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-3.5" /> Sair
        </button>
      </aside>

      <main className="flex-1 p-5 lg:p-8">
        <div className="mx-auto max-w-5xl">
          {section ? <SectionPanel section={section} /> : <OverviewSection />}
        </div>
      </main>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </p>
      <div className="mt-2 space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Users;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-sidebar-accent font-medium text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
