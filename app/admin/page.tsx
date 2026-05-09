"use client";

import { useState, useRef } from "react";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; diasSincronizados?: number; atividadesInseridas?: number; error?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSync = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/sync-planilha", {
        method: "POST",
        headers: { authorization: `Bearer ${password}` },
        body: form,
      });
      const data = await res.json() as typeof result;
      setResult(data);
    } catch {
      setResult({ error: "Erro de conexão." });
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
        <div className="bg-white border border-zinc-200 p-8 w-full max-w-sm">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Altitude</p>
          <h1 className="text-xl font-bold text-zinc-900 mb-6">Admin</h1>
          <input
            type="password"
            placeholder="CRON_SECRET"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && setAuthed(true)}
            className="w-full border border-zinc-200 p-3 text-sm focus:outline-none focus:border-zinc-400 mb-3"
          />
          <button
            onClick={() => setAuthed(true)}
            disabled={!password}
            className="w-full bg-zinc-900 text-white font-bold py-3 text-sm disabled:opacity-40"
          >
            Entrar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Altitude · Admin</p>
          <h1 className="text-2xl font-bold text-zinc-900 mt-1">Sincronizar planilha</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Importa as atividades do Adolfo da aba <strong>prog semana</strong> para os próximos dias.
          </p>
        </div>

        <div className="bg-white border border-zinc-200 p-6 mb-4">
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-3">
            Rede de projetos — versão oficial.xlsx
          </p>
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-zinc-200 rounded p-8 text-center cursor-pointer hover:border-zinc-400 transition-colors"
          >
            {file ? (
              <p className="text-sm text-zinc-700 font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-zinc-400">Clique ou arraste o arquivo .xlsx aqui</p>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {result && (
          <div className={`p-4 mb-4 text-sm ${result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
            {result.ok
              ? `✓ Sincronizado — ${result.diasSincronizados} dias, ${result.atividadesInseridas} atividades inseridas.`
              : `✕ Erro: ${result.error}`}
          </div>
        )}

        <button
          onClick={handleSync}
          disabled={!file || loading}
          className="w-full bg-zinc-900 text-white font-bold py-3 text-sm disabled:opacity-40 hover:bg-zinc-700 transition-colors"
        >
          {loading ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
    </main>
  );
}
