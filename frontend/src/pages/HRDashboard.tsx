import { useState, useEffect, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createSession, getSessions, getResults, deleteCandidate } from "../api";
import CandidateDetail from "./CandidateDetail";

const CRITERION_LABEL: Record<string, string> = {
  filler_words: "Слова-паразиты",
  rudeness: "Грубость",
  politeness: "Вежливость",
  coherence: "Связность речи",
};

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  // BOM so Excel opens UTF-8 / Cyrillic correctly
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<"all" | "rec" | "notrec">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  async function handleDelete(candidateId: number, name: string, e: ReactMouseEvent) {
    e.stopPropagation();
    if (deletingId !== null) return;
    const ok = window.confirm(
      `Удалить кандидата «${name}» вместе с интервью и аудиозаписями? Это действие необратимо.`
    );
    if (!ok) return;
    setDeletingId(candidateId);
    try {
      await deleteCandidate(candidateId);
      await fetchSessions();
    } catch (err) {
      window.alert(`Не удалось удалить: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      // Export honors the currently active filters (search + verdict + dates)
      const completedSessions = visibleCompleted;
      // Pull full evaluation per candidate so the CSV has metric counts
      const detailed = await Promise.all(
        completedSessions.map(async (s) => {
          try {
            const r = await getResults(s.candidate!.id);
            return { session: s, result: r };
          } catch {
            return { session: s, result: null };
          }
        })
      );

      const header = [
        "Имя",
        "Телефон",
        "Дата интервью",
        "Вердикт",
        "Слова-паразиты (кол-во)",
        "Грубость (кол-во)",
        "Вежливость (кол-во)",
        "Связность речи (0–10)",
        "Критерии",
        "Комментарий",
      ];

      const rows: string[][] = [header];
      for (const { session, result } of detailed) {
        const c = session.candidate!;
        const ev = result?.evaluation;
        const m = ev?.markers;
        const selected = (result?.selected_criteria ?? []).map(
          (k) => CRITERION_LABEL[k] ?? k
        );
        const dateStr = c.created_at
          ? new Date(c.created_at).toLocaleString("ru-RU")
          : "";
        rows.push([
          c.name,
          c.phone,
          dateStr,
          c.verdict ?? "",
          m && result?.selected_criteria.includes("filler_words")
            ? String(m.filler_words_count)
            : "",
          m && result?.selected_criteria.includes("rudeness")
            ? String(m.rudeness_count)
            : "",
          m && result?.selected_criteria.includes("politeness")
            ? String(m.politeness_count)
            : "",
          m && result?.selected_criteria.includes("coherence")
            ? String(m.coherence_score)
            : "",
          selected.join(", "),
          ev?.comment ?? c.comment ?? "",
        ]);
      }

      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`role-cases-interviews-${today}.csv`, rows);
    } finally {
      setExporting(false);
    }
  }

  const completed = sessions.filter((s) => s.candidate?.verdict);
  const recommended = completed.filter((s) => s.candidate?.verdict === "Рекомендуется");
  const rate = completed.length > 0 ? Math.round((recommended.length / completed.length) * 100) : 0;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const queryDigits = searchQuery.replace(/\D/g, "");
  // Date bounds: dateFrom inclusive, dateTo end-of-day inclusive
  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;
  const visibleCompleted = completed.filter((s) => {
    const c = s.candidate;
    if (!c) return false;
    if (verdictFilter === "rec" && c.verdict !== "Рекомендуется") return false;
    if (verdictFilter === "notrec" && c.verdict === "Рекомендуется") return false;
    if (normalizedQuery) {
      const nameMatch = c.name.toLowerCase().includes(normalizedQuery);
      const phoneMatch =
        queryDigits.length > 0 && c.phone.replace(/\D/g, "").includes(queryDigits);
      if (!nameMatch && !phoneMatch) return false;
    }
    if ((fromTs !== null || toTs !== null) && c.created_at) {
      const ts = new Date(c.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    } else if (fromTs !== null || toTs !== null) {
      // No date on record but a date filter is active → exclude
      return false;
    }
    return true;
  });
  const hasActiveDateFilter = !!dateFrom || !!dateTo;

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
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Завершённые интервью ({completed.length})
          </p>
          {completed.length > 0 && (
            <button
              onClick={handleExportCsv}
              disabled={exporting}
              title="Скачать кандидатов с учётом текущих фильтров"
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 transition px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white disabled:opacity-60"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                />
              </svg>
              {exporting ? "Готовлю CSV…" : "Экспорт CSV"}
            </button>
          )}
        </div>

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

        {!loading && completed.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени или телефону"
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Очистить"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value as "all" | "rec" | "notrec")}
                className="appearance-none bg-gray-900 text-white font-semibold border border-gray-900 rounded-xl pl-4 pr-9 py-2 text-sm cursor-pointer hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-accent transition"
              >
                <option value="all">Все результаты</option>
                <option value="rec">Рекомендуется</option>
                <option value="notrec">Не рекомендуется</option>
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}

        {!loading && completed.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch sm:items-center">
            <span className="text-xs text-gray-500 sm:mr-1">Период:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
            />
            <span className="text-xs text-gray-400 self-center hidden sm:block">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
            />
            {hasActiveDateFilter && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-xs text-gray-500 hover:text-gray-800 transition px-2 py-1 self-center"
              >
                Сбросить даты
              </button>
            )}
          </div>
        )}

        {!loading && completed.length > 0 && visibleCompleted.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Ничего не найдено</p>
          </div>
        )}

        <div className="space-y-3">
          {visibleCompleted.map((s) => {
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        isRec
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.verdict}
                    </span>
                    <button
                      onClick={(e) => handleDelete(c.id, c.name, e)}
                      disabled={deletingId === c.id}
                      title="Удалить кандидата"
                      className="text-gray-300 hover:text-red-600 transition p-1 rounded-md disabled:opacity-50"
                    >
                      {deletingId === c.id ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
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
