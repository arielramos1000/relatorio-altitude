# Altitude

Sistema de relatorio diario para a fazenda em fase de implantacao.

## Setup

1. Criar um projeto no Supabase.
2. Copiar as credenciais para o arquivo `.env.local`.
3. Rodar [`supabase/schema.sql`](./supabase/schema.sql) no SQL Editor do Supabase.
4. Executar `npm run dev`.

## Slack

Para habilitar o comando `/altitude-reportar`:

1. Criar um Slack app em <https://api.slack.com/apps>.
2. Em **Basic Information**, copiar o **Signing Secret** para `SLACK_SIGNING_SECRET` no `.env.local`.
3. Em **OAuth & Permissions**, configurar os escopos necessarios para slash commands e interatividade do app, depois instalar o app no workspace.
4. Em **Slash Commands**, criar `/altitude-reportar`.
5. Em **Interactivity & Shortcuts**, ativar interatividade.
6. Convidar ou manter o app disponivel no canal alvo `#fazenda`.

Dev local com ngrok:

```bash
npm run dev
npx ngrok http 3000
```

No Slack app config, atualizar:

- Slash command Request URL: `https://SEU.ngrok.io/api/slack/reportar`
- Interactivity & Shortcuts Request URL: `https://SEU.ngrok.io/api/slack/interactivity`

Em producao, as Request URLs devem apontar para:

- `https://relatorio.altitudeagro.com.br/api/slack/reportar`
- `https://relatorio.altitudeagro.com.br/api/slack/interactivity`

## Fechamento do dia

O fechamento automatico roda as 18h BRT pela Vercel Cron (`0 21 * * *` em UTC), envia o resumo para o Slack via `SLACK_WEBHOOK_URL`, envia email via Resend usando `EMAIL_FROM` e salva o HTML em `daily_reports`.

Para testar localmente:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" http://localhost:3000/api/cron/fechamento-dia
```

O relatorio completo fica em `/r/YYYY-MM-DD`, por exemplo `http://localhost:3000/r/2026-05-06`.
