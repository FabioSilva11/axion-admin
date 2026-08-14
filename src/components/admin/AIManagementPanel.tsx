import { useState } from "react";
import { Cpu, Server } from "lucide-react";
import { ModelPanel } from "./ModelPanel";
import { ProviderPanel } from "./ProviderPanel";

export function AIManagementPanel() {
  const [tab, setTab] = useState<"providers" | "models">("providers");
  return <section className="space-y-4"><div><h2 className="text-xl font-bold">IA: provedores e modelos</h2><p className="text-xs text-muted-foreground">Gerencie endpoints, credenciais, catálogo e custos dos modelos.</p></div><div className="inline-flex rounded-lg border border-border bg-card p-1"><button onClick={() => setTab("providers")} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold ${tab === "providers" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Server className="size-4" /> Provedores</button><button onClick={() => setTab("models")} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold ${tab === "models" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Cpu className="size-4" /> Modelos</button></div>{tab === "providers" ? <ProviderPanel /> : <ModelPanel />}</section>;
}
