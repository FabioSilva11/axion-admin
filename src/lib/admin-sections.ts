export type SectionKind = "collection" | "single";

export type SectionDef = {
  key: string;
  label: string;
  path: string;
  kind: SectionKind;
  description: string;
  icon: "users" | "plans" | "models" | "providers" | "payment" | "api" | "proxy";
  allowCreate?: boolean;
  allowDelete?: boolean;
};

export const SECTIONS: SectionDef[] = [
  {
    key: "users",
    label: "Usuários",
    path: "users",
    kind: "collection",
    description: "Contas registradas no aplicativo Axion",
    icon: "users",
    allowCreate: false,
    allowDelete: false,
  },
  {
    key: "plans",
    label: "Planos",
    path: "config/plans",
    kind: "collection",
    description: "Planos, créditos e preços",
    icon: "plans",
  },
  {
    key: "models",
    label: "Modelos",
    path: "axionSettings/config/models",
    kind: "collection",
    description: "Modelos de IA, custos e plano herdado do provedor",
    icon: "models",
  },
  {
    key: "providers",
    label: "Provedores",
    path: "axionSettings/config/providers",
    kind: "collection",
    description: "Endpoints e chaves de API dos provedores",
    icon: "providers",
  },
  {
    key: "billing",
    label: "Cobrança da IA",
    path: "axionSettings/private/billing",
    kind: "single",
    description: "Conversão de custos dos provedores em créditos",
    icon: "payment",
  },
  {
    key: "payments",
    label: "Pagamentos",
    path: "axionSettings/private/payments",
    kind: "collection",
    description: "Orders Pix, conciliação e ativação das assinaturas",
    icon: "payment",
    allowCreate: false,
    allowDelete: false,
  },
  {
    key: "api",
    label: "Config da API",
    path: "config/api",
    kind: "single",
    description: "Túnel e status do servidor da API",
    icon: "api",
  },
  {
    key: "cliProxy",
    label: "CLI Proxy",
    path: "config/cli-proxy",
    kind: "single",
    description: "Túnel e status do proxy CLI",
    icon: "proxy",
  },
];

export function findSection(key: string) {
  return SECTIONS.find((section) => section.key === key);
}
