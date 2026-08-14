# Integração do App Android com o Servidor Axion

Guia para alinhar o aplicativo Android ao servidor após a atualização do
painel administrativo. **Mudança principal:** a disponibilidade de modelos
agora é controlada pelo **provedor** (plano + ativo/inativo), e o app passou a
mostrar primeiro **provedores** e depois os **modelos** de cada provedor.

> Complementa o [`FIREBASE_CONTRACT.md`](./FIREBASE_CONTRACT.md), que descreve a
> estrutura canônica do banco. Este documento é o contrato de API e de fluxo de
> telas do app.

---

## 1. Como o app encontra o servidor

1. Leia `config/api` no Firebase Realtime Database:
   ```json
   {
     "endpoint": "https://api.exemplo.com",
     "online": true
   }
   ```
2. Use `endpoint` somente se `online == true` e o valor começar com `https://`.
3. Não fixe a URL no APK — o servidor atualiza `config/api` a cada boot.

## 2. Autenticação

Todo endpoint exige um **ID token do Firebase** no header:

```
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

- Obtenha o token com `FirebaseAuth.getInstance().getCurrentUser().getIdToken(false)`.
- Token ausente/inválido → `401` `authentication_required` / `invalid_token`.
- **Nunca** coloque chaves do Mercado Pago, do provedor de IA ou da conta de
  serviço no APK. O servidor guarda tudo.

## 3. Endpoints

Base: `{endpoint}` (de `config/api`).

| Método | Caminho | Autenticação | Descrição |
| --- | --- | --- | --- |
| GET | `/health` | não | Saúde do servidor |
| POST | `/v1/account/bootstrap` | sim | Perfil, plano e carteira |
| GET | `/v1/usage` | sim | Carteira atual |
| GET | `/v1/plans` | não | Ofertas públicas de planos |
| GET | `/v1/ai/providers` | sim | **Provedores e modelos liberados para o plano** |
| POST | `/v1/ai/chat/completions` | sim | Chat (gateway gerenciado) |
| POST | `/v1/payments/checkout` | sim | Criar Pix |
| GET | `/v1/payments/checkouts/{checkoutId}` | sim | Consultar Pix |

Erro padrão (todos os endpoints):
```json
{ "error": { "code": "codigo", "message": "mensagem legível" } }
```

## 4. Novo fluxo da tela principal (provedores → modelos)

**O app não deve mais exibir a lista plana de modelos.** Fluxo correto:

```
Lista de provedores → Seleção do provedor → Lista de modelos do provedor
→ Seleção do modelo → Uso no chat
```

### 4.1 Identificar o plano do usuário

`POST /v1/account/bootstrap` devolve:

```json
{
  "account": {
    "uid": "abc123",
    "email": "user@email.com",
    "plan": "free",
    "managedUsage": {
      "creditLimit": 1000,
      "creditsUsed": 0,
      "creditsReserved": 0,
      "creditsRemaining": 1000
    },
    "subscription": { "status": "active" }
  },
  "axion_wallet": { "used": 0, "limit": 1000, "reserved": 0, "available": 1000, "lifetimeUsed": 0 }
}
```

- O plano canônico é `account.plan` (`"free"` ou `"paid"`). Não confie em
  valor salvo localmente: **chame o bootstrap** (ou leia `users/{uid}/plan`)
  sempre que o app abrir.
- `users/{uid}` é gravado pelo servidor; o app pode observar esse caminho com
  um `ValueEventListener` para detectar upgrade/expiração em tempo real.

### 4.2 Buscar provedores disponíveis

`GET /v1/ai/providers` — o servidor já aplica as regras de plano/status:

```json
{
  "plan": "free",
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "availablePlans": "all",
      "models": [
        { "id": "openrouter-gpt-5", "name": "GPT-5" },
        { "id": "openrouter-claude-3", "name": "Claude 3" }
      ]
    }
  ]
}
```

**Regras aplicadas pelo servidor** (o app pode confiar, mas deve tratar listas
vazias com elegância):

- Um provedor só aparece se **está ativo** (`enabled: true`);
- **está liberado para o plano atual** do usuário:
  - `availablePlans: "free"` → somente Free;
  - `availablePlans: "paid"` → somente Pago;
  - `availablePlans: "all"` → todos;
- **possui pelo menos um modelo ativo**;
- os modelos listados são **somente do provedor, ativos e válidos** (modelos
  órfãos ou de provedores desativados nunca aparecem).

### 4.3 Telas

1. **Tela principal (lista de provedores):** mostre `providers[].name` (e
   opcionalmente `availablePlans` como rótulo). Cada item leva a uma segunda
   tela.
2. **Tela/diálogo do provedor:** liste `providers[].models[]` com `models[].name`.
3. **Ao escolher o modelo**, guarde `provider.id` + `model.id` e use no chat
   (seção 5). Pode guardar em `SharedPreferences` para reabrir a última seleção.

### 4.4 Casos de borda

- `providers` vazio → mostre uma tela "Nenhum provedor disponível para o seu
  plano" (não quebre a UI).
- Se o usuário for downgraded/expirar enquanto navega, o próximo
  `GET /v1/ai/providers` já devolve a lista correta. Revalide a lista ao voltar
  para a tela principal (refresh on resume).

## 5. Chat

`POST /v1/ai/chat/completions`

```json
{
  "model": "openrouter-gpt-5",
  "messages": [{ "role": "user", "content": "Olá" }],
  "max_completion_tokens": 1024
}
```

- `model` = o **id do modelo** vindo de `/v1/ai/providers` (não o nome exibido).
- `stream` deve ser `false` (o gateway gerenciado não suporta streaming).
- `max_tokens`/`max_completion_tokens` são opcionais; o servidor aplica o
  limite do plano e do modelo e **reescreve** `model` para o id interno do
  provedor (`upstream_model`) — o app envia sempre o id do catálogo.
- Resposta: formato compatível com OpenAI (`choices`, `usage`) **mais**:
  ```json
  {
    "choices": [ { "message": { "role": "assistant", "content": "..." } } ],
    "usage": { "prompt_tokens": 12, "completion_tokens": 40 },
    "axion_request_id": "uuid-gerado-pelo-servidor",
    "axion_wallet": { "used": 15, "limit": 1000, "reserved": 0, "available": 985, "lifetimeUsed": 15 }
  }
  ```
- Use `axion_wallet` para atualizar o saldo exibido sem chamadas extras.

### 5.1 Erros mais comuns do chat

| HTTP | `code` | O que fazer no app |
| --- | --- | --- |
| 401 | `authentication_required` / `invalid_token` | Reautenticar e repetir |
| 403 | `provider_plan_required` | Plano não permite o provedor: voltar à lista de provedores |
| 403 | `model_not_in_plan` | Modelo não incluído: atualizar lista de provedores |
| 402 | `insufficient_credits` | Saldo zerado: abrir tela de assinatura |
| 429 | `rate_limit_exceeded` / `daily_limit_exceeded` | Aguardar/aviso de limite |
| 409 | `duplicate_request` | Requisição já processada (idempotência via `x-request-id`) |
| 404 | `model_not_found` | Modelo indisponível: recarregar provedores |
| 502 / 504 | `provider_error` / `provider_timeout` / `provider_unavailable` | Provedor com problema: tentar novamente ou outro provedor |

## 6. Carteira de créditos

`GET /v1/usage` → `{ "axion_wallet": { "used", "limit", "reserved", "available", "lifetimeUsed" } }`

- `available` = créditos que podem ser gastos agora.
- O saldo só pode ser alterado pelo servidor; o app **não** deve gravar
  `managedUsage` diretamente (as regras do Firebase bloqueiam).

## 7. Planos e pagamento (Pix)

- `GET /v1/plans` → `{ plans: [{ id, name, description, priceCents, currencyId, monthlyCredits, cycleDays, active }] }`
- Para assinar: `POST /v1/payments/checkout` com `{ "planId": "paid" }` →
  `201` `{ "checkout": { "checkoutId", "checkoutUrl", "pixCopyPaste", "qrCodeBase64", ... } }`.
  Exiba o QR Code (`qrCodeBase64`) e o Pix Copia e Cola (`pixCopyPaste`).
- Acompanhe: `GET /v1/payments/checkouts/{checkoutId}`.
- **Não** marque o plano como pago no app. O servidor ativa a assinatura e
  grava `users/{uid}/plan` — o listener do usuário no Firebase reflete o
  upgrade automaticamente (sem novo APK).

## 8. Leituras diretas no Firebase (compatibilidade)

Além da API, o app pode ler no Realtime Database:

- `config/api` — endpoint do servidor (obrigatório).
- `users/{uid}` — perfil do próprio usuário (regra: `auth.uid === $uid`).
- `config/plans` — ofertas públicas.
- `axionSettings/config/models` — catálogo público (**somente leitura**).

**Atenção:** `models/*/min_plan` e `models/*/active` são agora **espelhos**
mantidos pelo servidor para clientes antigos. **Não use esses campos como
fonte de verdade de disponibilidade no app novo** — use `GET /v1/ai/providers`.
Eles existem apenas para não quebrar versões antigas do app durante a
transição.

## 9. Checklist de mudanças no app Android

- [ ] Observar `config/api` e usar o endpoint publicado (HTTPS, `online == true`).
- [ ] Chamar `POST /v1/account/bootstrap` ao abrir e ler `account.plan`.
- [ ] Substituir a lista plana de modelos por `GET /v1/ai/providers`.
- [ ] Criar tela principal de **provedores** (`providers[].name`).
- [ ] Criar tela/diálogo de **modelos do provedor** (`providers[].models[]`).
- [ ] Enviar `model` = id do modelo no chat (nunca o nome exibido).
- [ ] Tratar `providers` vazio (tela "nenhum provedor disponível").
- [ ] Revalidar a lista de provedores ao voltar para a tela principal (refresh on resume).
- [ ] Atualizar o saldo exibido com `axion_wallet` da resposta do chat e do `GET /v1/usage`.
- [ ] Exibir QR Code/Pix Copia e Cola do checkout e NÃO ativar o plano localmente.
- [ ] Tratar os códigos de erro da tabela da seção 5.1.
- [ ] Remover qualquer escrita em `managedUsage`/`subscription`/`plan` (o servidor é dono).

## 10. Exemplo de fluxo completo

1. Usuário Free abre o app → `bootstrap` → `plan = "free"`.
2. `GET /v1/ai/providers` → retorna só provedores `free`/`all` com modelos ativos.
3. Tela principal lista os provedores (ex.: "OpenRouter").
4. Usuário abre "OpenRouter" → vê os modelos ativos dele.
5. Escolhe `openrouter-gpt-5` → `POST /v1/ai/chat/completions` com `model = "openrouter-gpt-5"`.
6. Se o admin mudar o provedor para "Plano Pago" ou desativá-lo, o próximo
   `GET /v1/ai/providers` do usuário Free deixa de listá-lo — sem atualizar o app.
