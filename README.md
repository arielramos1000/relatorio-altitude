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

## Deploy

Ordem recomendada para producao:

1. Fazer push para `https://github.com/arielramos1000/relatorio-altitude.git`.
2. Na Vercel, importar o repo `relatorio-altitude` como projeto Next.js.
3. Antes do primeiro deploy, cadastrar as variaveis de ambiente do `.env.local`, exceto `APP_BASE_URL` e `EMAIL_FROM`.
4. Depois do deploy inicial, adicionar o dominio `relatorio.altitudeagro.com.br` no projeto Vercel.
5. No DNS de `altitudeagro.com.br`, adicionar apenas o CNAME do subdominio que a Vercel mostrar. Nao alterar registros raiz `@` ou `www`, porque eles pertencem ao site principal.
6. Aguardar propagacao e confirmar `Valid Configuration` na Vercel.
7. Atualizar `APP_BASE_URL=https://relatorio.altitudeagro.com.br` nas Environment Variables da Vercel.
8. No Resend, verificar o dominio `altitudeagro.com.br`, adicionando todos os registros DNS pedidos. Se ja existir SPF, mesclar os includes em um unico registro SPF.
9. Depois da verificacao do Resend, configurar `EMAIL_FROM="Altitude <relatorio@altitudeagro.com.br>"` na Vercel.
10. No Slack app, trocar as URLs para:
    - `https://relatorio.altitudeagro.com.br/api/slack/reportar`
    - `https://relatorio.altitudeagro.com.br/api/slack/interactivity`
11. Rodar a migration [`supabase/migrations/0001_slack_state.sql`](./supabase/migrations/0001_slack_state.sql) no SQL Editor do Supabase de producao.

Os crons ficam em Vercel Dashboard → projeto → Crons. Para teste manual, use o botao "Run" do dashboard ou o `curl` documentado acima com `CRON_SECRET`.
