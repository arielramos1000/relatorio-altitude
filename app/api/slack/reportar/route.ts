import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack/verify";
import { buildReportBlocks } from "@/lib/slack/report-blocks";
import type { Person, PlannedItem } from "@/lib/types";

export const runtime = "nodejs";

const TIME_ZONE = "America/Sao_Paulo";

function getTodayParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
  };
}


export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValidRequest = verifySlackSignature({
    rawBody,
    signature: req.headers.get("x-slack-signature"),
    timestamp: req.headers.get("x-slack-request-timestamp"),
  });

  if (!isValidRequest) {
    return new NextResponse("Invalid Slack signature", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const userId = form.get("user_id");

  if (!userId) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Payload do Slack sem user_id.",
      },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id,name,slack_user_id,email,access_token,reports_daily,receives_reports,created_at")
    .eq("slack_user_id", userId)
    .eq("reports_daily", true)
    .maybeSingle<Person>();

  if (personError) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Nao consegui validar seu usuario agora. Tente de novo em instantes.",
      },
      { status: 500 }
    );
  }

  if (!person) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Apenas Adolfo pode usar /altitude-reportar.",
    });
  }

  const today = getTodayParts();
  const { data: plannedItems, error: plannedItemsError } = await supabase
    .from("planned_items")
    .select("id,date,person_id,raw_text,source,created_at")
    .eq("person_id", person.id)
    .eq("date", today.date)
    .order("created_at", { ascending: true })
    .returns<PlannedItem[]>();

  if (plannedItemsError) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Nao consegui buscar as atividades planejadas de hoje.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    response_type: "ephemeral",
    text: `Reporte do dia · ${today.label}`,
    blocks: buildReportBlocks(plannedItems ?? [], today.label),
  });
}
