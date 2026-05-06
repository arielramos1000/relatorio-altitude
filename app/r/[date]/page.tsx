import { notFound } from "next/navigation";
import { gerarFechamento, parseDateKey } from "@/lib/relatorios/fechamento-dia";
import { renderFechamentoHTML } from "@/lib/relatorios/render-fechamento-html";
import { createServerClient } from "@/lib/supabase/server";
import type { DailyReport } from "@/lib/types";

export const dynamic = "force-dynamic";

type ReportPageProps = {
  params: Promise<{
    date: string;
  }>;
};

function isValidDateKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { date } = await params;

  if (!isValidDateKey(date)) {
    notFound();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("content_html")
    .eq("date", date)
    .eq("kind", "fechamento_dia")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<DailyReport, "content_html">>();

  if (error) {
    throw new Error(`Erro ao buscar relatorio completo: ${error.message}`);
  }

  let html = data?.content_html;

  if (!html) {
    const fechamento = await gerarFechamento(parseDateKey(date));
    html = renderFechamentoHTML(fechamento);
  }

  return (
    <main
      className="min-h-screen bg-zinc-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
