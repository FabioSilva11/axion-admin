# Contrato Firebase do Axion

O Android usa `google-services.json` somente para autenticação e acesso aos
dados permitidos pelas regras. O servidor usa uma conta de serviço Firebase
Admin e é o único responsável por planos, saldo, pagamentos e segredos.

## Estrutura canônica

- `axionSettings/config/models`: catálogo público; cada modelo informa `min_plan`.
- `axionSettings/config/providers`: configuração privada dos provedores.
- `axionSettings/private`: cobrança, Mercado Pago, checkouts e índices privados.
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

1. gerar novas credenciais do provedor e do Mercado Pago;
2. preencher `axionSettings/config/providers/default-provider` com `enabled: true`;
3. informar `input_usd_per_million` e `output_usd_per_million` em cada modelo;
4. ativar somente os modelos revisados;
5. publicar o servidor em HTTPS e preencher `config/api` com `online: true`.

Enquanto esses cinco pontos não forem concluídos, `config/api` permanece
offline e os modelos permanecem inativos para impedir consumo sem controle.

## Fluxo Pix

1. Android envia Firebase ID token e `planId` ao servidor.
2. Servidor obtém preço em `config/plans` e cria uma Order Pix com idempotência.
3. Android recebe apenas URL, QR Code e Pix Copia e Cola.
4. Webhook assinado ou sincronização administrativa faz `GET /v1/orders/{id}`.
5. Somente após `processed/accredited` o servidor ativa a assinatura em uma
   transação atômica e registra o evento no ledger.
