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

const STATUS_BUTTONS: { status: Status; label: string; active: string; inactive: string }[] = [
  { status: "feito", label: "Feito", active: "bg-emerald-600 text-white", inactive: "bg-zinc-100 text-zinc-400" },
  { status: "parcial", label: "Parcial", active: "bg-amber-500 text-white", inactive: "bg-zinc-100 text-zinc-400" },
  { status: "nao_feito", label: "Não feito", active: "bg-rose-600 text-white", inactive: "bg-zinc-100 text-zinc-400" },
];

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
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Erro ao salvar reporte.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <main className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
        <div className="bg-white border border-zinc-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Reporte salvo!</h1>
          <p className="text-zinc-500 text-sm">Obrigado, {person.name}. Até amanhã.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Altitude</p>
          <h1 className="text-2xl font-bold text-zinc-900 mt-1">Reporte do dia</h1>
          <p className="text-zinc-500 text-sm mt-1">{dateLabel} · {person.name}</p>
        </div>

        {plannedItems.length === 0 ? (
          <div className="bg-white border border-zinc-200 p-6 text-zinc-500 text-sm">
            Nenhuma atividade planejada para hoje.
          </div>
        ) : (
          <div className="space-y-3">
            {plannedItems.map((item) => {
              const current = statuses[item.id];
              return (
                <div key={item.id} className="bg-white border border-zinc-200 p-4">
                  <p className="text-zinc-800 text-sm mb-3">• {item.raw_text}</p>
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_BUTTONS.map(({ status, label, active, inactive }) => (
                      <button
                        key={status}
                        onClick={() => handleStatus(item.id, status)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                          current === status ? active : current ? inactive : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {current === status ? "✓ " : ""}{label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 bg-white border border-zinc-200 p-4">
          <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-2">
            Algo mais que rolou hoje (opcional)
          </label>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={3}
            className="w-full border border-zinc-200 p-2 text-sm text-zinc-800 resize-none focus:outline-none focus:border-zinc-400"
            placeholder="Atividades extras, observações..."
          />
        </div>

        {error && <p className="mt-3 text-rose-600 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full bg-zinc-900 text-white font-bold py-3 text-sm disabled:opacity-50 hover:bg-zinc-700 transition-colors"
        >
          {saving ? "Salvando..." : "Enviar reporte"}
        </button>
      </div>
    </main>
  );
}
