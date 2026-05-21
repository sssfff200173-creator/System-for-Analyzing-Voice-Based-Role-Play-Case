import { useState, useEffect, useCallback } from "react";
import { createSession, getSessions } from "../api";

interface SessionResult {
  session_id: string;
  created_at: string | null;
  status: string;
  candidate: {
    name: string;
    phone: string;
    verdict: string | null;
    comment: string | null;
    created_at: string | null;
  } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function HRDashboard() {
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { session_id } = await createSession();
      const link = `${window.location.origin}/?id=${session_id}`;
      setGeneratedLink(link);
      fetchSessions();
    } catch {
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const completed = sessions.filter((s) => s.candidate?.verdict);
  const recommended = completed.filter((s) => s.candidate?.verdict === "Рекомендуется");
  const rate = completed.length > 0 ? Math.round((recommended.length / completed.length) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-4 pb-12">
      {/* Header */}
      <div className="py-7">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
          HR Кабинет
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Role Cases AI-Assessor</h1>
      </div>

      {/* Stats */}
      {completed.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-gray-900">{completed.length}</p>
            <p className="text-xs text-gray-500 mt-1">Завершено</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-green-600">{recommended.length}</p>
            <p className="text-xs text-gray-500 mt-1">Рекомендованы</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-gray-900">{rate}%</p>
            <p className="text-xs text-gray-500 mt-1">Успешность</p>
          </div>
        </div>
      )}

      {/* Generate link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
        <p className="font-semibold text-gray-800 text-sm mb-3">Новое интервью</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-3 rounded-xl text-sm transition active:scale-95 disabled:opacity-60"
        >
          {generating ? "Генерация…" : "Сгенерировать ссылку для кандидата"}
        </button>
        {generatedLink && (
          <div className="mt-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
              <p className="text-xs text-gray-600 flex-1 truncate font-mono">{generatedLink}</p>
              <button
                onClick={handleCopy}
                className="text-xs font-semibold text-blue-600 flex-shrink-0 hover:text-blue-800 transition"
              >
                {copied ? "✓ Скопировано" : "Копировать"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Demo link hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-6">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Демо-ссылка:</span>{" "}
          <span className="font-mono break-all">
            {window.location.origin}/?id=demo
          </span>
          {" "}— работает всегда для тестирования
        </p>
      </div>

      {/* Interviews list */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Завершённые интервью ({completed.length})
        </p>

        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && completed.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Нет завершённых интервью</p>
            <p className="text-gray-300 text-xs mt-1">
              Сгенерируйте ссылку выше и отправьте кандидату
            </p>
          </div>
        )}

        <div className="space-y-3">
          {completed.map((s) => {
            const c = s.candidate!;
            const isRec = c.verdict === "Рекомендуется";
            return (
              <div
                key={s.session_id}
                className={`bg-white rounded-2xl border-2 p-4 shadow-sm ${
                  isRec ? "border-green-300" : "border-red-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${
                      isRec
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.verdict}
                  </span>
                </div>
                {c.comment && (
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">{c.comment}</p>
                )}
                {c.created_at && (
                  <p className="text-xs text-gray-400 mt-2">{formatDate(c.created_at)}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
