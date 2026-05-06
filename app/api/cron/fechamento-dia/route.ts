import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import {
  formatDateKey,
  gerarFechamento,
  parseDateKey,
} from "@/lib/relatorios/fechamento-dia";
import { renderFechamentoHTML } from "@/lib/relatorios/render-fechamento-html";
import { renderFechamentoSlack } from "@/lib/relatorios/render-fechamento-slack";
import { createServerClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getHojeBrt() {
  return parseDateKey(formatDateKey(new Date()));
}

async function postSlack(blocks: ReturnType<typeof renderFechamentoSlack>, text: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL nao configurado.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      blocks,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Slack webhook falhou: ${response.status} ${responseText}`);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServerClient();
  const fechamento = await gerarFechamento(getHojeBrt());
  const slackBlocks = renderFechamentoSlack(fechamento);
  const html = renderFechamentoHTML(fechamento);
  const subject = `Fechamento Altitude · ${fechamento.dateLabel}`;

  await postSlack(slackBlocks, subject);

  const { data: recipients, error: recipientsError } = await supabase
    .from("people")
    .select("email")
    .eq("receives_reports", true)
    .order("name", { ascending: true })
    .returns<Pick<Person, "email">[]>();

  if (recipientsError) {
    throw new Error(`Erro ao buscar destinatarios: ${recipientsError.message}`);
  }

  const emails = (recipients ?? []).map((recipient) => recipient.email).filter(Boolean);

  if (emails.length > 0) {
    const { error } = await sendEmail(emails, subject, html);

    if (error) {
      throw new Error(`Resend falhou: ${error.message}`);
    }
  }

  const { error: reportError } = await supabase.from("daily_reports").upsert(
    {
      date: fechamento.date,
      kind: "fechamento_dia",
      content_html: html,
      sent_to_slack: true,
      sent_to_email: true,
      sent_at: new Date().toISOString(),
    },
    {
      onConflict: "date,kind",
    }
  );

  if (reportError) {
    throw new Error(`Erro ao salvar daily_reports: ${reportError.message}`);
  }

  return NextResponse.json({ ok: true });
}
