export type SectionKind = "collection" | "single";

export type SectionDef = {
  key: string;
  label: string;
  path: string;
  kind: SectionKind;
  description: string;
  icon: "users" | "plans" | "models" | "providers" | "payment" | "api" | "proxy";
};

export const SECTIONS: SectionDef[] = [
  {
    key: "users",
    label: "Usuários",
    path: "users",
    kind: "collection",
    description: "Contas registradas no aplicativo Axion",
    icon: "users",
  },
  {
    key: "plans",
    label: "Planos",
    path: "axionServer/config/plans",
    kind: "collection",
    description: "Planos, créditos e preços",
    icon: "plans",
  },
  {
    key: "models",
    label: "Modelos",
    path: "axionServer/config/models",
    kind: "collection",
    description: "Modelos de IA disponíveis e seus pesos",
    icon: "models",
  },
  {
    key: "providers",
    label: "Provedores",
    path: "axionServer/config/providers",
    kind: "collection",
    description: "Endpoints e chaves de API dos provedores",
    icon: "providers",
  },
  {
    key: "mercadoPago",
    label: "Mercado Pago",
    path: "axionServer/private/mercadoPago",
    kind: "single",
    description: "Chaves privadas de pagamento",
    icon: "payment",
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
