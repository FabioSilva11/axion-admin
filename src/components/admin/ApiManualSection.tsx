import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getOverview } from "@/lib/admin.functions";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success("Copiado para a area de transferencia");
        window.setTimeout(() => setCopied(false), 1_500);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
    >
      {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-secondary/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <CopyButton value={value} />
      </div>
      <pre className="mono overflow-x-auto p-3 text-xs leading-relaxed text-muted-foreground">{value}</pre>
    </article>
  );
}

export function ApiManualSection() {
  const fetchOverview = useServerFn(getOverview);
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: () => fetchOverview() });
  const apiUrl = data?.apiEndpoint?.replace(/\/+$/, "") || "https://seu-dominio.example";
  const firebaseConfig = `{\n  "endpoint": "${apiUrl}",\n  "online": true\n}`;
  const checkoutExample = `POST ${apiUrl}/v1/payments/checkout\nAuthorization: Bearer <FIREBASE_ID_TOKEN>\nContent-Type: application/json\n\n{\n  "planId": "paid"\n}`;
  const androidExample = `// 1. Leia config/api do Firebase Realtime Database.\nFirebaseDatabase.getInstance(BuildConfig.FIREBASE_DATABASE_URL)\n    .getReference("config/api")\n    .addValueEventListener(new ValueEventListener() {\n      @Override public void onDataChange(DataSnapshot snapshot) {\n        String endpoint = snapshot.child("endpoint").getValue(String.class);\n        Boolean online = snapshot.child("online").getValue(Boolean.class);\n        // Use endpoint somente se online == true e iniciar com https://\n      }\n      @Override public void onCancelled(DatabaseError error) { }\n    });\n\n// 2. Obtenha o token do usuario autenticado e envie no header Bearer.\nFirebaseAuth.getInstance().getCurrentUser().getIdToken(false);`;

  if (isLoading) {
    return (
      <div className="panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando manual...
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Manual da API</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Integre o app usando a URL publicada no Firebase. Nunca coloque chaves do Mercado Pago no APK.
        </p>
      </header>

      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Endpoint atual</p>
            <p className="mono mt-1 text-xs text-primary">{apiUrl}</p>
          </div>
          <CopyButton value={apiUrl} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O servidor grava este valor em <code>config/api</code> no boot quando PUBLIC_BASE_URL usa HTTPS. O app deve observar esse caminho, nao fixar a URL no codigo.
        </p>
      </div>

      <CodeBlock title="Valor publicado no Firebase: config/api" value={firebaseConfig} />
      <CodeBlock title="Android: descobrir a API pelo Firebase" value={androidExample} />

      <CodeBlock
        title="Listar provedores e modelos do plano do usuario"
        value={`GET ${apiUrl}/v1/ai/providers\nAuthorization: Bearer <FIREBASE_ID_TOKEN>\n\n// Resposta: { "plan": "free", "providers": [\n//   { "id": "openrouter", "name": "OpenRouter",\n//     "availablePlans": "all",\n//     "models": [{ "id": "openrouter-gpt-5", "name": "GPT-5" }] } ] }\n//\n// Fluxo: lista de provedores -> seleciona provedor ->\n// lista de modelos do provedor -> seleciona modelo -> usa no chat.`}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <CodeBlock title="Criar pagamento Pix" value={checkoutExample} />
        <CodeBlock
          title="Consultar pagamento"
          value={`GET ${apiUrl}/v1/payments/checkouts/<checkoutId>\nAuthorization: Bearer <FIREBASE_ID_TOKEN>`}
        />
      </div>

      <div className="panel p-4 text-sm">
        <h3 className="font-semibold">Disponibilidade de modelos</h3>
        <p className="mt-2 text-muted-foreground">
          A disponibilidade é controlada pelo <b>provedor</b> (plano e status ativo), não pelo modelo. O app lista provedores em <code>/v1/ai/providers</code> e, ao abrir um provedor, mostra somente os modelos ativos dele. Usuários do plano Free nunca recebem provedores exclusivos do Plano Pago, nem por chamada direta à API.
        </p>
      </div>

      <div className="panel p-4 text-sm">
        <h3 className="font-semibold">Resposta do Pix</h3>
        <p className="mt-2 text-muted-foreground">
          A resposta contem <code>checkoutId</code>, <code>checkoutUrl</code>, <code>pixCopyPaste</code> e <code>qrCodeBase64</code>. Exiba o QR Code, mas nao marque o plano como pago no app.
        </p>
        <p className="mt-2 text-muted-foreground">
          O servidor consulta o Mercado Pago automaticamente e atualiza <code>users/&#123;uid&#125;</code> no Firebase. O listener desse usuario atualiza o plano no app sem webhook e sem nova compilacao.
        </p>
      </div>
    </section>
  );
}
