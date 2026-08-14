import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Loader2 } from "lucide-react";

import { adminLogin } from "@/lib/admin.functions";

export function LoginScreen({ onSuccess }: { onSuccess: (username: string) => void }) {
  const login = useServerFn(adminLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login({ data: { username, password } });
      if (result.ok) onSuccess(result.username);
      else setError(result.error);
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-sm p-8">
        <div className="accent-surface mb-6 inline-flex size-11 items-center justify-center rounded-xl">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Axion Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acesso restrito ao administrador do aplicativo.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Usuário
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              maxLength={120}
              required
              className="w-full rounded-lg border border-input bg-secondary/60 px-3 py-2 text-sm outline-none transition focus:border-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={200}
              required
              className="w-full rounded-lg border border-input bg-secondary/60 px-3 py-2 text-sm outline-none transition focus:border-ring"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="accent-surface glow-ring inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Entrar no painel
          </button>
        </form>
      </div>
    </main>
  );
}
