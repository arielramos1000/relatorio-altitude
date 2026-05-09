import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { postToSlack } from "@/lib/slack/post";
import type { Person } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const hojeUrl = `${baseUrl}/hoje?t=${adolfo.access_token}`;
  const mention = adolfo.slack_user_id ? `<@${adolfo.slack_user_id}>` : adolfo.name;

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⏰ ${mention} — faltam menos de 1h para o fechamento do dia!\nPreencha o reporte antes das 18h: <${hojeUrl}|abrir reporte>.`,
      },
    },
  ];

  await postToSlack(blocks, `⏰ Lembrete: preencha o reporte antes das 18h.`);

  return NextResponse.json({ ok: true });
}
