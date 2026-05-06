import { createServerClient } from "@/lib/supabase/server";
import type { Execution, Person, PlannedItem, Project } from "@/lib/types";

export const TIME_ZONE = "America/Sao_Paulo";
const PROJECT_LOOKAHEAD_DAYS = 14;

export type PlannedExecutionStatus = "feito" | "parcial" | "nao_feito";

export type FechamentoAtividade = {
  plannedItem: PlannedItem;
  execution: Execution | null;
  status: PlannedExecutionStatus;
  notes: string | null;
  reported: boolean;
};

export type FechamentoExtra = {
  execution: Execution;
  notes: string;
};

export type FechamentoPessoa = {
  person: Pick<Person, "id" | "name" | "email">;
  atividades: FechamentoAtividade[];
  extras: FechamentoExtra[];
};

export type FechamentoPendencia = {
  personName: string;
  rawText: string;
  status: "parcial" | "nao_feito";
  notes: string | null;
  reported: boolean;
};

export type FechamentoProjeto = Pick<
  Project,
  "id" | "name" | "status" | "target_end_date"
>;

export type FechamentoDia = {
  date: string;
  dateLabel: string;
  generatedAt: string;
  metrics: {
    totalPlanejado: number;
    concluidas: number;
    parciais: number;
    naoFeitas: number;
    extras: number;
  };
  pessoas: FechamentoPessoa[];
  pendenciasAmanha: FechamentoPendencia[];
  projetos: FechamentoProjeto[];
};

type ProjectRow = Pick<Project, "id" | "name" | "status" | "target_end_date">;

export function formatDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00-03:00`);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 15, 0, 0));

  return formatDateKey(date);
}

function latestExecutionByPlannedItem(executions: Execution[]) {
  const byPlannedItem = new Map<string, Execution>();

  for (const execution of executions) {
    if (execution.planned_item_id) {
      byPlannedItem.set(execution.planned_item_id, execution);
    }
  }

  return byPlannedItem;
}

function normalizePlannedStatus(execution: Execution | null): PlannedExecutionStatus {
  if (
    execution?.status === "feito" ||
    execution?.status === "parcial" ||
    execution?.status === "nao_feito"
  ) {
    return execution.status;
  }

  return "nao_feito";
}

async function getProjetosDoPeriodo(dateKey: string): Promise<FechamentoProjeto[]> {
  const supabase = createServerClient();
  const untilDate = addDaysToDateKey(dateKey, PROJECT_LOOKAHEAD_DAYS);
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,status,target_end_date")
    .in("status", ["em_andamento", "atrasado"])
    .not("target_end_date", "is", null)
    .lte("target_end_date", untilDate)
    .order("target_end_date", { ascending: true })
    .returns<ProjectRow[]>();

  if (error) {
    console.warn("Nao foi possivel buscar projects para o fechamento:", error.message);
    return [];
  }

  return data ?? [];
}

export async function gerarFechamento(date: Date): Promise<FechamentoDia> {
  const supabase = createServerClient();
  const dateKey = formatDateKey(date);
  const [peopleResult, projetos] = await Promise.all([
    supabase
      .from("people")
      .select("id,name,email")
      .eq("reports_daily", true)
      .order("name", { ascending: true })
      .returns<Pick<Person, "id" | "name" | "email">[]>(),
    getProjetosDoPeriodo(dateKey),
  ]);

  if (peopleResult.error) {
    throw new Error(`Erro ao buscar pessoas do fechamento: ${peopleResult.error.message}`);
  }

  const pessoas = await Promise.all(
    (peopleResult.data ?? []).map(async (person) => {
      const [plannedItemsResult, executionsResult] = await Promise.all([
        supabase
          .from("planned_items")
          .select("id,date,person_id,raw_text,source,created_at")
          .eq("person_id", person.id)
          .eq("date", dateKey)
          .order("created_at", { ascending: true })
          .returns<PlannedItem[]>(),
        supabase
          .from("executions")
          .select("id,date,person_id,planned_item_id,status,notes,created_at")
          .eq("person_id", person.id)
          .eq("date", dateKey)
          .order("created_at", { ascending: true })
          .returns<Execution[]>(),
      ]);

      if (plannedItemsResult.error) {
        throw new Error(
          `Erro ao buscar planejados de ${person.name}: ${plannedItemsResult.error.message}`
        );
      }

      if (executionsResult.error) {
        throw new Error(
          `Erro ao buscar execucoes de ${person.name}: ${executionsResult.error.message}`
        );
      }

      const executions = executionsResult.data ?? [];
      const executionsByPlannedItem = latestExecutionByPlannedItem(executions);
      const atividades = (plannedItemsResult.data ?? []).map((plannedItem) => {
        const execution = executionsByPlannedItem.get(plannedItem.id) ?? null;

        return {
          plannedItem,
          execution,
          status: normalizePlannedStatus(execution),
          notes: execution?.notes?.trim() || null,
          reported: Boolean(execution),
        };
      });
      const extras = executions
        .filter((execution) => !execution.planned_item_id && execution.notes?.trim())
        .map((execution) => ({
          execution,
          notes: execution.notes!.trim(),
        }));

      return {
        person,
        atividades,
        extras,
      };
    })
  );

  const allActivities = pessoas.flatMap((pessoa) => pessoa.atividades);
  const pendenciasAmanha = pessoas.flatMap((pessoa) =>
    pessoa.atividades
      .filter((atividade) => atividade.status === "parcial" || atividade.status === "nao_feito")
      .map((atividade) => ({
        personName: pessoa.person.name,
        rawText: atividade.plannedItem.raw_text,
        status: atividade.status as "parcial" | "nao_feito",
        notes: atividade.notes,
        reported: atividade.reported,
      }))
  );

  return {
    date: dateKey,
    dateLabel: formatDateLabel(date),
    generatedAt: new Date().toISOString(),
    metrics: {
      totalPlanejado: allActivities.length,
      concluidas: allActivities.filter((atividade) => atividade.status === "feito").length,
      parciais: allActivities.filter((atividade) => atividade.status === "parcial").length,
      naoFeitas: allActivities.filter((atividade) => atividade.status === "nao_feito").length,
      extras: pessoas.reduce((total, pessoa) => total + pessoa.extras.length, 0),
    },
    pessoas,
    pendenciasAmanha,
    projetos,
  };
}
