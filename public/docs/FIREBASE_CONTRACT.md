# Contrato Firebase do Axion

> Para alinhar o aplicativo Android ao servidor, veja o
> [`ANDROID_INTEGRATION.md`](./ANDROID_INTEGRATION.md) (endpoints, novo fluxo
> provedores → modelos → chat e checklist do app).

O Android usa `google-services.json` somente para autenticação e acesso aos
dados permitidos pelas regras. O servidor usa uma conta de serviço Firebase
Admin e é o único responsável por planos, saldo, pagamentos e segredos.

## Estrutura canônica

- `axionSettings/config/models`: catálogo público. **O provedor é a única
  fonte de verdade para disponibilidade**; `min_plan` e `active` são espelhos
  mantidos em sincronia pelo servidor apenas para clientes antigos.
- `axionSettings/config/providers`: configuração privada dos provedores. Cada
  provedor informa `available_plans` (`free`, `paid` ou `all`) que define em
  quais planos TODOS os seus modelos ficam disponíveis, além de `enabled`
  (ativo/inativo). Desativar o provedor desativa automaticamente os modelos.
- `config/plans/*/model_ids`: lista **derivada** pelo servidor a partir dos
  provedores. Não deve ser editada manualmente.
- `axionSettings/private`: cobrança, checkouts e índices privados sem credenciais.
- `config/api`: endpoint público do servidor.
- `config/cli-proxy`: estado público do proxy CLI.
- `config/plans`: ofertas públicas, preço e créditos.
- `users/{uid}`: perfil lido pelo próprio usuário.
- `users/{uid}/managedUsage`: carteira escrita somente pelo servidor.
- `users/{uid}/subscription`: vigência escrita somente pelo servidor.
- `users/{uid}/serverLedger`: razão contábil imutável para o cliente.
  Não existe uma segunda cópia de planos em `axionSettings`. A raiz possui
  exatamente `axionSettings`, `config` e `users`, conforme a estrutura definida
  para o projeto. O plano canônico do usuário é `users/{uid}/plan`.

## Ativação segura

As chaves encontradas no export antigo foram descartadas porque já estavam em
um arquivo exportável. Antes de colocar o servidor online, o administrador deve:

1. gerar novas credenciais do provedor e do Mercado Pago e configurar o
   Mercado Pago somente no `.env.local`/secret manager do servidor;
2. preencher `axionSettings/config/providers/default-provider` com `enabled: true`;
3. informar `input_usd_per_million` e `output_usd_per_million` em cada modelo;
4. ativar somente os modelos revisados;
5. publicar o servidor em HTTPS e preencher `config/api` com `online: true`.

Enquanto esses cinco pontos não forem concluídos, `config/api` permanece
offline e os modelos permanecem inativos para impedir consumo sem controle.

## Disponibilidade de modelos por plano

Regras aplicadas no servidor (endpoint `/v1/ai/providers` e gateway
`/v1/ai/chat/completions`):

- `available_plans: "free"` → modelos disponíveis somente para o plano Free;
- `available_plans: "paid"` → modelos disponíveis somente para o plano Pago;
- `available_plans: "all"` → modelos disponíveis para todos os planos.

Um provedor só aparece quando está ativo (`enabled: true`), liberado para o
plano do usuário e possui pelo menos um modelo ativo. O gateway também valida
que o modelo pertence ao provedor e que o provedor está liberado para o plano.

Migração dos dados antigos (idempotente, executada pelo painel):

- provedor com qualquer modelo pago (`min_plan` `paid`/`pro`) vira `paid`
  (regra de segurança contra vazar modelos pagos para o Free);
- provedor com apenas modelos `free` vira `all` (preserva o comportamento
  anterior, pois `min_plan: free` era acessível a todos);
- modelos sem provedor válido são desativados e nunca exibidos.

Ao cadastrar, importar ou mover um provedor para `available_plans: "paid"`,
todo modelo ainda sem preço recebe automaticamente a tarifa padrão de 1
crédito de entrada e 1 crédito de saída por 1.000 tokens. O administrador pode
substituir esses valores no editor do modelo; modelos pagos nunca são
publicados com todos os campos de custo zerados.

Como o provedor passou a controlar também o status ativo/inativo, modelos
antes importados como rascunho (`active: false`) passam a ficar disponíveis
sempre que o provedor estiver ativo — não existe mais publicação individual.

## Fluxo do aplicativo Android

O app não deve mais listar modelos diretamente. Fluxo correto:

1. identifica o plano atual do usuário (bootstrap/`users/{uid}/plan`);
2. chama `GET /v1/ai/providers` (Bearer ID token) e recebe somente os
   provedores ativos liberados para o plano, cada um com os seus modelos
   ativos;
3. a tela principal mostra os provedores; ao abrir um provedor, mostra os
   modelos dele; o usuário escolhe o modelo e usa no chat;
4. o chat chama `POST /v1/ai/chat/completions` com `model` = id do modelo.

## Fluxo Pix

1. Android envia Firebase ID token e `planId` ao servidor.
2. Servidor obtém preço em `config/plans` e cria uma Order Pix com idempotência.
3. Android recebe apenas URL, QR Code e Pix Copia e Cola.
4. Webhook assinado ou sincronização administrativa faz `GET /v1/orders/{id}`.
5. Somente após `processed/accredited` o servidor ativa a assinatura em uma
   transação atômica e registra o evento no ledger.
