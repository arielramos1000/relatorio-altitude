import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

export const runtime = "nodejs";

type Status = "feito" | "parcial" | "nao_feito";

type ReporteBody = {
  token: string;
  date: string;
  statuses: Record<string, Status>;
  extraNotes?: string;
};

function isValidDateKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidStatus(status: unknown): status is Status {
  return status === "feito" || status === "parcial" || status === "nao_feito";
}

export async function POST(req: NextRequest) {
  let body: ReporteBody;

  try {
    body = (await req.json()) as ReporteBody;
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const { token, date, statuses, extraNotes } = body;

  if (!token || !date || !isValidDateKey(date) || !statuses || typeof statuses !== "object") {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id,name,slack_user_id,email,access_token,reports_daily,receives_reports,created_at")
    .eq("access_token", token)
    .eq("reports_daily", true)
    .maybeSingle<Person>();

  if (personError || !person) {
    return NextResponse.json({ error: "Token invalido." }, { status: 401 });
  }

  const { error: deleteError } = await supabase
    .from("executions")
    .delete()
    .eq("person_id", person.id)
    .eq("date", date);

  if (deleteError) {
    return NextResponse.json({ error: "Erro ao limpar execucoes anteriores." }, { status: 500 });
  }

  const rows: {
    date: string;
    person_id: string;
    planned_item_id: string | null;
    status: Status | "extra";
    notes: string | null;
  }[] = [];

  for (const [plannedItemId, status] of Object.entries(statuses)) {
    if (!isValidStatus(status)) continue;
    rows.push({ date, person_id: person.id, planned_item_id: plannedItemId, status, notes: null });
  }

  if (extraNotes?.trim()) {
    rows.push({
      date,
      person_id: person.id,
      planned_item_id: null,
      status: "extra",
      notes: extraNotes.trim(),
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("executions").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: "Erro ao salvar reporte." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
