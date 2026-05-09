import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { postToSlack } from "@/lib/slack/post";
import { buildReportBlocks } from "@/lib/slack/report-blocks";
import { formatDateKey, formatDateLabel, parseDateKey } from "@/lib/relatorios/fechamento-dia";
import type { Person, PlannedItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Sao_Paulo";

function getTodayBrt() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServerClient();

  const { data: adolfo, error } = await supabase
    .from("people")
    .select("id,name,slack_user_id,access_token")
    .eq("reports_daily", true)
    .maybeSingle<Pick<Person, "id" | "name" | "slack_user_id" | "access_token">>();

  if (error || !adolfo) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 500 });
  }

  const dParam = req.nextUrl.searchParams.get("d");
  const dateKey = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) ? dParam : getTodayBrt();
  const dateLabel = formatDateLabel(parseDateKey(dateKey));

  const { data: plannedItems, error: itemsError } = await supabase
    .from("planned_items")
    .select("id,date,person_id,raw_text,source,created_at")
    .eq("person_id", adolfo.id)
    .eq("date", dateKey)
    .order("created_at", { ascending: true })
    .returns<PlannedItem[]>();

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const dateFragment = dParam ? `&d=${dParam}` : "";
  const hojeUrl = `${baseUrl}/hoje?t=${adolfo.access_token}${dateFragment}`;
  const mention = adolfo.slack_user_id ? `<@${adolfo.slack_user_id}>` : adolfo.name;

  const introBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `⏰ ${mention} — faltam menos de 1h para o fechamento do dia! Preencha abaixo ou <${hojeUrl}|abra no navegador>.`,
    },
  };

  const reportBlocks = buildReportBlocks(plannedItems ?? [], dateLabel);

  await postToSlack(
    [introBlock, { type: "divider" }, ...reportBlocks],
    `⏰ Lembrete: preencha o reporte antes das 18h.`
  );

  return NextResponse.json({ ok: true });
}
