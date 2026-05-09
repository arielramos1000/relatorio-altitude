import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { gerarBoletimManha } from "@/lib/relatorios/boletim-manha";
import { renderBoletimSlack } from "@/lib/relatorios/render-slack";
import { renderBoletimHTML } from "@/lib/relatorios/render-html";
import { postToSlack } from "@/lib/slack/post";
import { sendEmail } from "@/lib/email/send";
import { formatDateKey, parseDateKey } from "@/lib/relatorios/fechamento-dia";
import type { Person } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getHojeBrt() {
  return parseDateKey(formatDateKey(new Date()));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServerClient();
  const dParam = req.nextUrl.searchParams.get("d");
  const hoje = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam)
    ? parseDateKey(dParam)
    : getHojeBrt();
  const boletim = await gerarBoletimManha(hoje);
  const slackBlocks = renderBoletimSlack(boletim);
  const html = renderBoletimHTML(boletim);
  const subject = `Boletim Altitude · ${boletim.dateLabel}`;

  await postToSlack(slackBlocks, subject);

  const { data: recipients, error: recipientsError } = await supabase
    .from("people")
    .select("email")
    .eq("receives_reports", true)
    .order("name", { ascending: true })
    .returns<Pick<Person, "email">[]>();

  if (recipientsError) {
    throw new Error(`Erro ao buscar destinatarios: ${recipientsError.message}`);
  }

  const emails = (recipients ?? []).map((r) => r.email).filter(Boolean);

  if (emails.length > 0) {
    const { error } = await sendEmail(emails, subject, html);
    if (error) throw new Error(`Resend falhou: ${error.message}`);
  }

  const { error: reportError } = await supabase.from("daily_reports").upsert(
    {
      date: boletim.date,
      kind: "boletim_manha",
      content_html: html,
      sent_to_slack: true,
      sent_to_email: true,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "date,kind" }
  );

  if (reportError) {
    throw new Error(`Erro ao salvar daily_reports: ${reportError.message}`);
  }

  return NextResponse.json({ ok: true });
}
