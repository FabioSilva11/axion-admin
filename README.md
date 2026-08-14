# Axion Admin

Painel administrativo e API do Axion. Este repositório concentra o catálogo de provedores e
modelos, planos, usuários, carteira de créditos, cobranças Pix e o gateway de IA usado pelo
aplicativo Android.

O aplicativo móvel fica no repositório separado
[FabioSilva11/axion](https://github.com/FabioSilva11/axion).

## Responsabilidades

- Painel administrativo protegido por sessão.
- Catálogo de provedores, modelos, preços e limites por plano.
- Reserva e acerto transacional dos créditos usados pelos modelos.
- Gateway OpenAI-compatible com respostas JSON, SSE e NDJSON.
- Criação e acompanhamento de cobranças Pix pelo Mercado Pago.
- Sincronização de usuários, planos e configurações com Firebase Realtime Database.
- Endpoints de saúde, carteira, uso, planos e provedores liberados para o Android.

## Tecnologias

- TanStack Start, React e TypeScript.
- Firebase Admin e Realtime Database.
- Mercado Pago.
- Vite/Nitro para build do servidor.

## Desenvolvimento local

Requisitos: Node.js e npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local` no lugar de `cp`.

Preencha `.env.local` apenas na máquina ou no serviço de hospedagem. Nunca envie esse arquivo,
contas de serviço ou tokens ao Git.

## Comandos

```bash
npm run test:stream
npm run build
npm run lint
```

`test:stream` valida o parser incremental, a medição de tokens e o evento final de carteira do
gateway. `build` gera a aplicação de produção em `.output/`.

## Variáveis de ambiente

Use `.env.example` como referência. As categorias principais são:

- `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET`.
- `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL` e credencial Firebase Admin.
- `MERCADO_PAGO_ACCESS_TOKEN` e opções de cobrança Pix.
- `PUBLIC_BASE_URL` para publicar o endereço HTTPS consumido pelo aplicativo.

As credenciais de provedores de IA são dados privados do servidor e nunca devem ser incluídas no
APK, em logs públicos ou no repositório.

## Fluxo do gateway de IA

1. Valida usuário, plano, modelo e provedor.
2. Reserva o limite máximo de créditos antes de chamar o provedor.
3. Transmite os chunks do provedor sem armazenar credenciais no Android.
4. Usa a medição exata do provedor quando disponível e uma estimativa conservadora como fallback.
5. Acerta a reserva de forma idempotente e envia a carteira atualizada no último evento.
6. Libera a reserva quando o provedor falha antes de entregar conteúdo faturável.

## Implantação

Configure as variáveis no ambiente de produção, execute `npm ci` e `npm run build`, e inicie o
servidor Nitro gerado em `.output/`. `PUBLIC_BASE_URL` deve apontar para o domínio HTTPS público;
ao iniciar, o servidor publica esse endpoint no Firebase para o Android recebê-lo sem uma nova
versão do APK.

## Segurança

- Não versione `.env.local`, chaves privadas, contas de serviço, APKs, dumps ou logs.
- Mantenha Firebase Admin, Mercado Pago e chaves dos modelos exclusivamente no backend.
- Revise os arquivos staged e faça uma busca por segredos antes de cada publicação.

## Licença

Copyright (c) 2026 FabioSilva11. Todos os direitos reservados.

Este software é proprietário e confidencial. Uso, cópia ou distribuição requer autorização do
proprietário.
