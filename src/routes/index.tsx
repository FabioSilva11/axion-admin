import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { LoginScreen } from "@/components/admin/LoginScreen";
import { adminMe } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axion Admin — Painel de administração" },
      {
        name: "description",
        content:
          "Painel administrativo do aplicativo Axion: gerencie usuários, planos, modelos, provedores e chaves do banco de dados.",
      },
      { property: "og:title", content: "Axion Admin — Painel de administração" },
      {
        property: "og:description",
        content: "Gerencie usuários, planos, modelos e chaves do aplicativo Axion em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const me = useServerFn(adminMe);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-me"], queryFn: () => me() });

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      {data?.username ? (
        <AdminShell
          username={data.username}
          onLogout={() => queryClient.invalidateQueries({ queryKey: ["admin-me"] })}
        />
      ) : (
        <LoginScreen
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin-me"] })}
        />
      )}
    </>
  );
}
