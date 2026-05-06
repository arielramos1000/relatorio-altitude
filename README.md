# Altitude — Sistema de Relatório Diário

Sistema de acompanhamento diário de execução para o projeto agrícola Altitude, em fase de implantação.

## O que faz

- **07h BRT** — Boletim automático no Slack `#fazenda` + email com plano do dia e pendências de ontem
- **Durante o dia** — Adolfo reporta via `/altitude-reportar` no Slack ou via link com token
- **18h BRT** — Fechamento automático no Slack + email com previsto vs realizado e pendências para amanhã

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Estilização | Tailwind CSS |
| Banco | Supabase (Postgres) |
| Email | Resend |
| Slack | Incoming Webhook + Slash Command + Interactivity |
| Cron | Vercel Cron (07h e 18h BRT) |
| Hospedagem | Vercel (Hobby, free tier) |
| Domínio | `relatorio.altitudeagro.com.br` |

## Variáveis de ambiente

Crie um `.env.local` na raiz com:

```env
NEXT_PUBLIC_SUPABASE_URL=https://eiiwtxsgpwexxoaspswi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_SIGNING_SECRET=...
CRON_SECRET=...
APP_BASE_URL=http://localhost:3000
EMAIL_FROM=Altitude <ariel@altitudeagro.com.br>
```

Todas as variáveis acima (exceto `APP_BASE_URL` local) devem ser configuradas também nas **Environment Variables** do projeto na Vercel.

## Deploy

### Pré-requisitos

- Conta Vercel conectada ao repositório GitHub
- Projeto Supabase criado com schema aplicado (`supabase/schema.sql`)
- Domínio `altitudeagro.com.br` com acesso ao painel DNS (Registro.br)
- Conta Resend com domínio verificado
- App Slack "Altitude" configurado

### Passo a passo

**1. Supabase**

```sql
-- Rodar supabase/schema.sql no SQL Editor do projeto
-- Rodar supabase/migrations/0001_slack_state.sql
```

Gerar token do Adolfo (sem caracteres especiais):
```powershell
-join ((1..40) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```
```sql
UPDATE people SET access_token = 'TOKEN_GERADO' WHERE name = 'Adolfo';
```

**2. GitHub + Vercel**

```powershell
git push origin main
```

Na Vercel: importar repo → adicionar todas as env vars → fazer deploy.

**3. Domínio**

- Vercel → Settings → Domains → adicionar `relatorio.altitudeagro.com.br`
- Registro.br → DNS → adicionar `CNAME relatorio → valor-gerado.vercel-dns-017.com.`
- Vercel → atualizar `APP_BASE_URL=https://relatorio.altitudeagro.com.br` → Redeploy

**4. Resend**

- Resend → Domains → Add `altitudeagro.com.br`
- Adicionar registros DNS (DKIM TXT, SPF TXT em `send`, DMARC TXT)
- O SPF vai no subdomínio `send`, não no `@` — sem conflito com SPF existente
- Atualizar `EMAIL_FROM=Altitude <ariel@altitudeagro.com.br>` na Vercel → Redeploy

**5. Slack**

- api.slack.com/apps → Altitude
- Slash Command Request URL: `https://relatorio.altitudeagro.com.br/api/slack/reportar`
- Interactivity Request URL: `https://relatorio.altitudeagro.com.br/api/slack/interactivity`

**6. Validação**

```
# Página de reporte
https://relatorio.altitudeagro.com.br/hoje?t=TOKEN_DO_ADOLFO

# Cron boletim (teste manual)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://relatorio.altitudeagro.com.br/api/cron/boletim-manha

# Cron fechamento (teste manual)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://relatorio.altitudeagro.com.br/api/cron/fechamento-dia
```

No Slack: `/altitude-reportar` no canal `#fazenda`.

## Crons

| Schedule (UTC) | Horário BRT | Rota |
|---|---|---|
| `0 10 * * *` | 07h | `/api/cron/boletim-manha` |
| `0 21 * * *` | 18h | `/api/cron/fechamento-dia` |

## Rotas

| Rota | Descrição |
|---|---|
| `/hoje?t=TOKEN` | Formulário de reporte diário (link com token) |
| `/r/[date]` | Relatório web público do fechamento |
| `/api/reporte` | POST — salva execuções via formulário web |
| `/api/slack/reportar` | POST — recebe slash command `/altitude-reportar` |
| `/api/slack/interactivity` | POST — recebe interações dos botões Slack |
| `/api/cron/boletim-manha` | GET — gera e envia boletim das 07h |
| `/api/cron/fechamento-dia` | GET — gera e envia fechamento das 18h |

## Usuários

| Nome | Papel |
|---|---|
| Adolfo | Reporta (`reports_daily=true`) |
| Sergio | Recebe relatórios (`receives_reports=true`) |
| Ariel | Recebe relatórios (`receives_reports=true`) |
