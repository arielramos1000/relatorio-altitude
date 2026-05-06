"use client";

import { useState } from "react";
import type { Person, PlannedItem } from "@/lib/types";

type Status = "feito" | "parcial" | "nao_feito";

type Props = {
  person: Person;
  plannedItems: PlannedItem[];
  dateLabel: string;
  dateKey: string;
  token: string;
};

const STATUS_CONFIG: {
  status: Status;
  label: string;
  activeStyle: string;
  dot: string;
}[] = [
  {
    status: "feito",
    label: "Feito",
    activeStyle: "border-[#1a4a2e] bg-[#1a4a2e] text-white",
    dot: "bg-[#1a4a2e]",
  },
  {
    status: "parcial",
    label: "Parcial",
    activeStyle: "border-amber-600 bg-amber-600 text-white",
    dot: "bg-amber-500",
  },
  {
    status: "nao_feito",
    label: "Não feito",
    activeStyle: "border-rose-700 bg-rose-700 text-white",
    dot: "bg-rose-600",
  },
];

function Header() {
  return (
    <header className="w-full border-b border-gray-100 bg-white">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <span className="text-[#1a4a2e] font-bold text-lg tracking-tight">
          Altitude<span className="text-[#1a4a2e]">.</span>
        </span>
        <span className="text-xs text-gray-400 uppercase tracking-widest">Reporte diário</span>
      </div>
    </header>
  );
}

export function ReporteDoDia({ person, plannedItems, dateLabel, dateKey, token }: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [extraNotes, setExtraNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatus = (itemId: string, status: Status) => {
    setStatuses((prev) => ({ ...prev, [itemId]: status }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reporte", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, date: dateKey, statuses, extraNotes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Erro ao salvar reporte.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  };

  const doneCount = Object.values(statuses).filter((s) => s === "feito").length;
  const totalCount = plannedItems.length;

  if (saved) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-[#1a4a2e] flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#1a4a2e] mb-3">Reporte enviado.</h1>
            <p className="text-gray-500 text-base">Obrigado, {person.name}. Até amanhã.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        {/* Título */}
        <div className="mb-10">
          <p className="text-sm text-gray-400 mb-1">{dateLabel} · {person.name}</p>
          <h1 className="text-4xl font-bold text-[#1a4a2e] leading-tight">
            O que foi feito<br />hoje?
          </h1>
          {totalCount > 0 && (
            <p className="mt-3 text-sm text-gray-400">
              {doneCount} de {totalCount} atividades marcadas
            </p>
          )}
        </div>

        {/* Atividades */}
        {plannedItems.length === 0 ? (
          <div className="border border-gray-100 rounded-lg p-8 text-center">
            <p className="text-gray-400">Nenhuma atividade planejada para hoje.</p>
            <p className="text-gray-300 text-sm mt-1">Use o campo abaixo para registrar o que foi feito.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plannedItems.map((item, index) => {
              const current = statuses[item.id];
              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-5 transition-all duration-200 ${
                    current === "feito"
                      ? "border-[#1a4a2e] bg-[#f0f7f2]"
                      : current === "parcial"
                      ? "border-amber-300 bg-amber-50"
                      : current === "nao_feito"
                      ? "border-rose-200 bg-rose-50"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-xs text-gray-300 font-mono mt-0.5 select-none">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className={`text-sm leading-relaxed font-medium flex-1 ${
                      current === "feito" ? "text-[#1a4a2e]" :
                      current === "parcial" ? "text-amber-800" :
                      current === "nao_feito" ? "text-rose-800" :
                      "text-gray-800"
                    }`}>
                      {item.raw_text}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap pl-7">
                    {STATUS_CONFIG.map(({ status, label, activeStyle }) => (
                      <button
                        key={status}
                        onClick={() => handleStatus(item.id, status)}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-all duration-150 ${
                          current === status
                            ? activeStyle
                            : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 bg-white"
                        }`}
                      >
                        {current === status && "✓ "}{label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Extra */}
        <div className="mt-8">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Algo mais que rolou hoje
          </label>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-100 rounded-lg p-4 text-sm text-gray-800 resize-none focus:outline-none focus:border-[#1a4a2e] transition-colors placeholder-gray-300"
            placeholder="Atividades extras, observações, imprevistos..."
          />
        </div>

        {error && (
          <p className="mt-3 text-rose-600 text-sm">{error}</p>
        )}

        {/* Botão */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-6 w-full bg-[#1a4a2e] text-white font-semibold py-4 rounded-lg text-sm tracking-wide disabled:opacity-40 hover:bg-[#153d25] transition-colors"
        >
          {saving ? "Enviando..." : "Enviar reporte →"}
        </button>

        <p className="mt-4 text-center text-xs text-gray-300">
          Altitude · Sistema de acompanhamento de implantação
        </p>
      </main>
    </div>
  );
}
