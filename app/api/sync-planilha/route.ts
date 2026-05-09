import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

// Aba REDE PROJETO: C=inicio, D=fim, E=atividade, I=responsavel (contém "ADOLFO")
const SHEET_NAME = "REDE PROJETO";
// Índices das colunas (0-based, coluna A=0)
const COL_INICIO = 2;  // C
const COL_FIM    = 3;  // D
const COL_ATIV   = 4;  // E
const COL_RESP   = 8;  // I

function toDateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return null;
}

function isAdolfo(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.toUpperCase().includes("ADOLFO");
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
      { error: `Aba "${SHEET_NAME}" não encontrada. Abas disponíveis: ${wb.SheetNames.join(", ")}` },
      { status: 400 }
    );
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  }) as unknown[][];

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
  const futureDates = new Set<string>();

  for (const row of rows) {
    const startKey = toDateKey(row[COL_INICIO]);
    const rawAtiv = row[COL_ATIV];
    const resp = row[COL_RESP];

    // precisa ter data de início, atividade e ser do Adolfo
    if (!startKey || !rawAtiv || typeof rawAtiv !== "string") continue;
    if (!isAdolfo(resp)) continue;
    if (startKey < today) continue;

    const atividade = rawAtiv.trim();
    if (!atividade) continue;

    // monta texto com data fim se existir
    const endKey = toDateKey(row[COL_FIM]);
    const rawText = endKey && endKey !== startKey
      ? `${atividade} (até ${endKey.slice(8, 10)}/${endKey.slice(5, 7)})`
      : atividade;

    futureDates.add(startKey);
    insertRows.push({
      date: startKey,
      person_id: adolfo.id,
      raw_text: rawText,
      source: "sheet_sync",
    });
  }

  // apaga apenas itens futuros de sheet_sync
  await supabase
    .from("planned_items")
    .delete()
    .eq("person_id", adolfo.id)
    .eq("source", "sheet_sync")
    .gte("date", today);

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
    diasSincronizados: futureDates.size,
    atividadesInseridas: insertRows.length,
  });
}
