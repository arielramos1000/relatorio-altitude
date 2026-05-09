import { createServerClient } from "@/lib/supabase/server";
import type { Person, PlannedItem } from "@/lib/types";
import { formatDateKey, formatDateLabel, parseDateKey } from "./fechamento-dia";

export type BoletimPendencia = {
  personName: string;
  rawText: string;
  status: "parcial" | "nao_feito";
  notes: string | null;
};

export type BoletimAtividade = {
  personName: string;
  rawText: string;
};

export type BoletimManha = {
  date: string;
  dateLabel: string;
  generatedAt: string;
  atividades: BoletimAtividade[];
  pendenciasOntem: BoletimPendencia[];
  reporterToken: string | null;
};

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 15, 0, 0));
  return formatDateKey(date);
}

export async function gerarBoletimManha(date: Date): Promise<BoletimManha> {
  const supabase = createServerClient();
  const dateKey = formatDateKey(date);
  const yesterdayKey = addDaysToDateKey(dateKey, -1);

  const { data: people, error: peopleError } = await supabase
    .from("people")
    .select("id,name,access_token")
    .eq("reports_daily", true)
    .order("name", { ascending: true })
    .returns<Pick<Person, "id" | "name" | "access_token">[]>();

  if (peopleError) throw new Error(`Erro ao buscar pessoas: ${peopleError.message}`);

  const personIds = (people ?? []).map((p) => p.id);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const reporterToken = people?.[0]?.access_token ?? null;

  if (personIds.length === 0) {
    return {
      date: dateKey,
      dateLabel: formatDateLabel(date),
      generatedAt: new Date().toISOString(),
      atividades: [],
      pendenciasOntem: [],
      reporterToken: null,
    };
  }

  const [plannedResult, yesterdayResult] = await Promise.all([
    supabase
      .from("planned_items")
      .select("id,date,person_id,raw_text,source,created_at")
      .in("person_id", personIds)
      .eq("date", dateKey)
      .order("created_at", { ascending: true })
      .returns<PlannedItem[]>(),
    supabase
      .from("planned_items")
      .select("id,date,person_id,raw_text,source,created_at")
      .in("person_id", personIds)
      .eq("date", yesterdayKey)
      .order("created_at", { ascending: true })
      .returns<PlannedItem[]>(),
  ]);

  if (plannedResult.error) throw new Error(`Erro ao buscar planejados: ${plannedResult.error.message}`);
  if (yesterdayResult.error) throw new Error(`Erro ao buscar ontem: ${yesterdayResult.error.message}`);

  const yesterdayItems = yesterdayResult.data ?? [];
  const pendenciasOntem: BoletimPendencia[] = [];

  if (yesterdayItems.length > 0) {
    const yesterdayItemIds = yesterdayItems.map((i) => i.id);
    const { data: executions } = await supabase
      .from("executions")
      .select("planned_item_id,status,notes")
      .in("planned_item_id", yesterdayItemIds)
      .eq("date", yesterdayKey);

    const executedMap = new Map(
      (executions ?? []).map((e) => [e.planned_item_id, e])
    );

    for (const item of yesterdayItems) {
      const exec = executedMap.get(item.id);
      const person = personById.get(item.person_id);
      if (!person) continue;

      if (!exec || exec.status === "nao_feito") {
        pendenciasOntem.push({
          personName: person.name,
          rawText: item.raw_text,
          status: "nao_feito",
          notes: exec?.notes ?? null,
        });
      } else if (exec.status === "parcial") {
        pendenciasOntem.push({
          personName: person.name,
          rawText: item.raw_text,
          status: "parcial",
          notes: exec.notes ?? null,
        });
      }
    }
  }

  const atividades = (plannedResult.data ?? []).map((item) => ({
    personName: personById.get(item.person_id)?.name ?? "Desconhecido",
    rawText: item.raw_text,
  }));

  return {
    date: dateKey,
    dateLabel: formatDateLabel(date),
    generatedAt: new Date().toISOString(),
    atividades,
    pendenciasOntem,
    reporterToken,
  };
}
