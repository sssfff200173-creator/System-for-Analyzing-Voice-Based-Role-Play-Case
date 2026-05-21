import { useState, useEffect, useCallback } from "react";
import { createSession, getSessions } from "../api";
import CandidateDetail from "./CandidateDetail";

interface SessionResult {
  session_id: string;
  created_at: string | null;
  status: string;
  candidate: {
    id: number;
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

const ALL_CRITERIA_OPTIONS = [
  { key: "filler_words", label: "Слова-паразиты" },
  { key: "rudeness", label: "Грубость" },
  { key: "politeness", label: "Вежливость" },
  { key: "coherence", label: "Связность речи" },
];

export default function HRDashboard() {
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>(
    ALL_CRITERIA_OPTIONS.map((o) => o.key)
  );

  function toggleCriterion(key: string) {
    setSelectedCriteria((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

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
    if (selectedCriteria.length === 0) return;
    setGenerating(true);
    try {
      const { session_id } = await createSession(selectedCriteria);
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

  if (selectedCandidateId !== null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CandidateDetail
          candidateId={selectedCandidateId}
          onBack={() => setSelectedCandidateId(null)}
        />
      </div>
    );
  }

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
            <p className="text-xs text-gray-500 mt-1">Завершено интервью</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-green-600">{recommended.length}</p>
            <p className="text-xs text-gray-500 mt-1">Рекомендованных кандидата</p>
          </div>
          <div
            className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm"
            title="Доля рекомендованных кандидатов от завершённых интервью"
          >
            <p className="text-3xl font-bold text-gray-900">{rate}%</p>
            <p className="text-xs text-gray-500 mt-1">Доля рекомендованных кандидатов</p>
          </div>
        </div>
      )}

      {/* Generate link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
        <p className="font-semibold text-gray-800 text-sm mb-3">Новое интервью</p>

        {/* Criteria selection */}
        <p className="text-xs text-gray-500 mb-2">Критерии оценки для кандидата:</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {ALL_CRITERIA_OPTIONS.map(({ key, label }) => {
            const checked = selectedCriteria.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCriterion(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition ${
                  checked
                    ? "border-accent bg-yellow-50 text-gray-900"
                    : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                    checked ? "bg-accent border-accent" : "border-gray-300"
                  }`}
                >
                  {checked && (
                    <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {label}
              </button>
            );
          })}
        </div>
        {selectedCriteria.length === 0 && (
          <p className="text-xs text-red-500 mb-3">Выберите хотя бы один критерий</p>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating || selectedCriteria.length === 0}
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
                onClick={() => setSelectedCandidateId(c.id)}
                className={`bg-white rounded-2xl border-2 p-4 shadow-sm cursor-pointer hover:shadow-md transition ${
                  isRec ? "border-green-300 hover:border-green-400" : "border-red-300 hover:border-red-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate hover:underline">{c.name}</p>
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

      {/* Demo link — bottom, subtle */}
      <div className="mt-8 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Демо:{" "}
          <span className="font-mono">
            {window.location.origin}/?id=demo
          </span>
        </p>
      </div>
    </div>
  );
}
