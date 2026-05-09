import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const SHEET_NAME = "prog semana";
const HEADER_ROW_INDEX = 1; // linha 2 (0-based)
const DATE_COL = "data";
const ADOLFO_COL = "adolfo";

function parseActivities(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toDateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[SHEET_NAME];

  if (!ws) {
    return NextResponse.json(
      { error: `Aba "${SHEET_NAME}" não encontrada na planilha.` },
      { status: 400 }
    );
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  }) as unknown[][];

  // encontrar linha do cabeçalho
  let headerIdx = -1;
  let dateColIdx = -1;
  let adolfoColIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const adolfoIdx = row.findIndex(
      (c) => typeof c === "string" && c.toLowerCase().trim() === ADOLFO_COL
    );
    if (adolfoIdx >= 0) {
      headerIdx = i;
      adolfoColIdx = adolfoIdx;
      dateColIdx = row.findIndex(
        (c) => typeof c === "string" && c.toLowerCase().trim() === DATE_COL
      );
      break;
    }
  }

  if (headerIdx < 0 || dateColIdx < 0 || adolfoColIdx < 0) {
    return NextResponse.json(
      { error: "Colunas 'data' ou 'adolfo' não encontradas na aba prog semana." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: adolfo, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("reports_daily", true)
    .ilike("name", "adolfo")
    .maybeSingle<Pick<Person, "id">>();

  if (personError || !adolfo) {
    return NextResponse.json({ error: "Pessoa Adolfo não encontrada no banco." }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const insertRows: { date: string; person_id: string; raw_text: string; source: "sheet_sync" }[] = [];
  const futureDates: string[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateKey = toDateKey(row[dateColIdx]);
    if (!dateKey || dateKey < today) continue;

    const rawAdolfo = row[adolfoColIdx];
    if (!rawAdolfo || typeof rawAdolfo !== "string") continue;

    const activities = parseActivities(rawAdolfo);
    if (activities.length === 0) continue;

    futureDates.push(dateKey);
    for (const activity of activities) {
      insertRows.push({
        date: dateKey,
        person_id: adolfo.id,
        raw_text: activity,
        source: "sheet_sync",
      });
    }
  }

  if (futureDates.length > 0) {
    // apaga apenas itens futuros de sheet_sync (preserva manuais e não toca no passado)
    await supabase
      .from("planned_items")
      .delete()
      .eq("person_id", adolfo.id)
      .eq("source", "sheet_sync")
      .gte("date", today);
  }

  if (insertRows.length > 0) {
    const { error: insertError } = await supabase
      .from("planned_items")
      .insert(insertRows);

    if (insertError) {
      return NextResponse.json({ error: `Erro ao inserir: ${insertError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    diasSincronizados: [...new Set(futureDates)].length,
    atividadesInseridas: insertRows.length,
  });
}
