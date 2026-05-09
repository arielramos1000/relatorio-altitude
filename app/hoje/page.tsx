import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { formatDateKey, formatDateLabel, parseDateKey } from "@/lib/relatorios/fechamento-dia";
import type { Person, PlannedItem } from "@/lib/types";
import { ReporteDoDia } from "./reporte-do-dia";

export const dynamic = "force-dynamic";

type HojePageProps = {
  searchParams: Promise<{ t?: string; d?: string }>;
};

function getTodayBrt() {
  return parseDateKey(formatDateKey(new Date()));
}

export default async function HojePage({ searchParams }: HojePageProps) {
  const { t, d } = await searchParams;

  if (!t) notFound();

  const supabase = createServerClient();

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id,name,slack_user_id,email,access_token,reports_daily,receives_reports,created_at")
    .eq("access_token", t)
    .eq("reports_daily", true)
    .maybeSingle<Person>();

  if (personError || !person) notFound();

  // ?d=YYYY-MM-DD permite simular qualquer data (preview)
  const today = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? parseDateKey(d) : getTodayBrt();
  const dateKey = formatDateKey(today);
  const dateLabel = formatDateLabel(today);

  const { data: plannedItems, error: plannedItemsError } = await supabase
    .from("planned_items")
    .select("id,date,person_id,raw_text,source,created_at")
    .eq("person_id", person.id)
    .eq("date", dateKey)
    .order("created_at", { ascending: true })
    .returns<PlannedItem[]>();

  if (plannedItemsError) {
    throw new Error(`Erro ao buscar atividades: ${plannedItemsError.message}`);
  }

  return (
    <ReporteDoDia
      person={person}
      plannedItems={plannedItems ?? []}
      dateLabel={dateLabel}
      dateKey={dateKey}
      token={t}
    />
  );
}
