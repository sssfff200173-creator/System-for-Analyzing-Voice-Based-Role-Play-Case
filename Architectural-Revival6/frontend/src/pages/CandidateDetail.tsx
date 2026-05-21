import { useState, useEffect, useRef } from "react";
import { getResults } from "../api";
import type { CandidateResult, CaseEvaluation, Evaluation, Markers } from "../api";

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const fixedRef = useRef(false);
  const [errored, setErrored] = useState(false);

  function handleLoadedMetadata() {
    const el = ref.current;
    if (!el || fixedRef.current) return;
    if (!isFinite(el.duration) || el.duration === 0) {
      fixedRef.current = true;
      const onSeeked = () => {
        el.removeEventListener("seeked", onSeeked);
        try { el.currentTime = 0; } catch { }
      };
      el.addEventListener("seeked", onSeeked);
      try { el.currentTime = 1e6; } catch { }
    } else {
      fixedRef.current = true;
    }
  }

  if (errored) {
    return (
      <div className="w-full text-xs text-gray-500 italic bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        Аудиозапись недоступна
      </div>
    );
  }

  return (
    <audio
      ref={ref}
      controls
      preload="metadata"
      className="w-full"
      src={src}
      onLoadedMetadata={handleLoadedMetadata}
      onError={() => setErrored(true)}
    />
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  candidateId: number;
  onBack: () => void;
}

function ShareButton({ candidateId }: { candidateId: number }) {
  const [copied, setCopied] = useState(false);
  async function handleShare() {
    const url = `${window.location.origin}/?candidate=${candidateId}`;
    try { await navigator.clipboard.writeText(url); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleShare}
      title="Скопировать ссылку на результат"
      className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-300 bg-blue-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.828 10.172a4 4 0 015.656 0l1.415 1.415a4 4 0 010 5.656l-2.829 2.828a4 4 0 01-5.656 0l-1.415-1.414M10.172 13.828a4 4 0 01-5.656 0l-1.415-1.415a4 4 0 010-5.656l2.829-2.828a4 4 0 015.656 0l1.415 1.414" />
      </svg>
      {copied ? "Ссылка скопирована" : "Поделиться"}
    </button>
  );
}

interface MetricCardProps {
  title: string;
  count: number;
  examples: string[];
  positive?: boolean;
}

function MetricCard({ title, count, examples, positive = false }: MetricCardProps) {
  const isZero = count === 0;
  const borderColor = positive
    ? isZero ? "border-gray-200" : "border-green-400"
    : isZero ? "border-gray-200" : "border-red-400";
  const badgeBg = positive
    ? isZero ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"
    : isZero ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700";

  return (
    <div className={`bg-white rounded-2xl border-2 ${borderColor} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${badgeBg}`}>{count}</span>
      </div>
      {examples.length > 0 ? (
        <ul className="space-y-1">
          {examples.map((ex, i) => (
            <li key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">«{ex}»</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">
          {positive ? "Примеры не найдены" : "Не обнаружено"}
        </p>
      )}
    </div>
  );
}

type LevelColor = "green" | "yellow" | "red";

function levelColor(level: string, goodValues: string[], badValues: string[]): LevelColor {
  if (goodValues.includes(level)) return "green";
  if (badValues.includes(level)) return "red";
  return "yellow";
}

const LEVEL_STYLES: Record<LevelColor, { border: string; badge: string }> = {
  green: { border: "border-green-400", badge: "bg-green-100 text-green-700" },
  yellow: { border: "border-yellow-400", badge: "bg-yellow-100 text-yellow-700" },
  red: { border: "border-red-400", badge: "bg-red-100 text-red-700" },
};

interface LevelCardProps {
  title: string;
  level: string;
  examples?: string[];
  issues?: string[];
  goodValues: string[];
  badValues: string[];
  noIssuesText?: string;
}

function LevelCard({ title, level, examples = [], issues = [], goodValues, badValues, noIssuesText }: LevelCardProps) {
  const color = levelColor(level, goodValues, badValues);
  const { border, badge } = LEVEL_STYLES[color];
  const items = [...examples, ...issues];

  return (
    <div className={`bg-white rounded-2xl border-2 ${border} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        <span className={`text-sm font-bold px-3 py-1.5 rounded-xl ${badge}`}>{level}</span>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">«{item}»</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">{noIssuesText ?? "Нарушений не выявлено"}</p>
      )}
    </div>
  );
}

function QuotesBlock({ title, quotes }: { title: string; quotes: string[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      {quotes.length > 0 ? (
        <ul className="space-y-2">
          {quotes.map((q, i) => (
            <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3">«{q}»</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">Нет цитат для данного маркера</p>
      )}
    </div>
  );
}

function verdictConfig(verdict: string) {
  if (verdict === "Рекомендуется") {
    return {
      wrap: "bg-green-50 border-2 border-green-400",
      icon: "bg-green-100",
      svg: (
        <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
      title: "text-green-800",
      body: "text-green-700",
    };
  }
  if (verdict === "Частичное соответствие") {
    return {
      wrap: "bg-yellow-50 border-2 border-yellow-400",
      icon: "bg-yellow-100",
      svg: (
        <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
      title: "text-yellow-800",
      body: "text-yellow-700",
    };
  }
  return {
    wrap: "bg-red-50 border-2 border-red-400",
    icon: "bg-red-100",
    svg: (
      <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    title: "text-red-800",
    body: "text-red-700",
  };
}

function EvaluationView({ evaluation, audioUrls, transcript }: {
  evaluation: Evaluation;
  audioUrls: string[];
  transcript: string | null;
}) {
  const selected = evaluation.selected_criteria ?? [];
  const m: Markers = evaluation.markers;
  const vc = verdictConfig(evaluation.verdict);

  const showFiller = selected.includes("filler_words");
  const showRudeness = selected.includes("rudeness");
  const showPoliteness = selected.includes("politeness");
  const showCoherence = selected.includes("coherence");
  const showStyle = selected.includes("business_style");
  const showEmpathy = selected.includes("empathy");
  const showInfoCorrectness = selected.includes("information_correctness");

  return (
    <>
      {/* Verdict banner */}
      <div className={`rounded-2xl p-5 mb-4 flex items-start gap-4 ${vc.wrap}`}>
        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${vc.icon}`}>
          {vc.svg}
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-bold ${vc.title}`}>{evaluation.verdict}</p>
          {evaluation.comment && (
            <p className={`text-sm mt-1 leading-relaxed ${vc.body}`}>{evaluation.comment}</p>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div className="space-y-3 mb-4">
        {showFiller && (
          <MetricCard
            title="Слова-паразиты"
            count={m.filler_words_count ?? 0}
            examples={m.filler_words_examples ?? []}
            positive={false}
          />
        )}
        {showRudeness && (
          <MetricCard
            title="Грубость / Негатив"
            count={m.rudeness_count ?? 0}
            examples={m.rudeness_examples ?? []}
            positive={false}
          />
        )}
        {showPoliteness && (
          <MetricCard
            title="Вежливость"
            count={m.politeness_count ?? 0}
            examples={m.politeness_examples ?? []}
            positive={true}
          />
        )}
        {showCoherence && (
          <LevelCard
            title="Связность речи"
            level={m.coherence_level ?? (m.coherence_score != null
              ? (m.coherence_score >= 8 ? "связная" : m.coherence_score >= 5 ? "есть нюансы" : "несвязная")
              : "есть нюансы")}
            issues={m.coherence_issues ?? []}
            goodValues={["связная"]}
            badValues={["несвязная"]}
          />
        )}
        {showStyle && m.speech_style && (
          <LevelCard
            title="Деловой стиль общения"
            level={m.speech_style}
            examples={m.style_examples ?? []}
            goodValues={["деловой"]}
            badValues={["неформальный"]}
            noIssuesText="Примеры не найдены"
          />
        )}
        {showEmpathy && m.empathy_level && (
          <LevelCard
            title="Эмпатия и индивидуальный подход"
            level={m.empathy_level}
            examples={m.empathy_examples ?? []}
            goodValues={["высокий"]}
            badValues={["низкий"]}
            noIssuesText="Примеры не найдены"
          />
        )}
        {showInfoCorrectness && m.information_correctness && (
          <LevelCard
            title="Корректность информации"
            level={m.information_correctness}
            issues={m.correctness_issues ?? []}
            goodValues={["корректно"]}
            badValues={["некорректно"]}
          />
        )}
      </div>

      {evaluation.quotes.length > 0 && (
        <div className="mb-4">
          <QuotesBlock title="Ключевые цитаты" quotes={evaluation.quotes} />
        </div>
      )}

      {(transcript || audioUrls.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Диалог с клиентом
          </p>
          <div className="space-y-6">
            {(() => {
              const lines = (transcript || "")
                .split("\n").map((l) => l.trim()).filter(Boolean);
              const clients: string[] = [];
              const candidates: string[] = [];
              for (const line of lines) {
                const mClient = line.match(/^\[?\s*Клиент\s*\]?\s*:\s*(.*)$/i);
                const mCand = line.match(/^\[?\s*(?:Кандидат|Ответ\s*\d+)\s*\]?\s*:\s*(.*)$/i);
                if (mClient) clients.push(mClient[1]);
                else if (mCand) candidates.push(mCand[1]);
                else candidates.push(line);
              }
              const total = Math.max(clients.length, candidates.length, audioUrls.length);
              return Array.from({ length: total }).map((_, i) => (
                <div key={i} className="space-y-3">
                  {clients[i] && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border-l-4 border-gray-300">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Клиент · реплика {i + 1}</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{clients[i]}</p>
                    </div>
                  )}
                  {audioUrls[i] && (
                    <div className="pl-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Аудиозапись ответа кандидата</p>
                      <AudioPlayer src={audioUrls[i]} />
                    </div>
                  )}
                  {candidates[i] && (
                    <div className="border-l-4 border-accent pl-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Транскрипция ответа кандидата</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{candidates[i]}</p>
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </>
  );
}

function MultiCaseEvaluationView({
  evaluations,
  combinedComment,
  audioUrls,
  transcript,
}: {
  evaluations: CaseEvaluation[];
  combinedComment: string | null;
  audioUrls: string[];
  transcript: string | null;
}) {
  return (
    <>
      {combinedComment && (
        <div className="bg-gray-900 text-white rounded-2xl p-5 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Итоговый вывод по двум кейсам
          </p>
          <p className="text-sm leading-relaxed">{combinedComment}</p>
        </div>
      )}
      {evaluations.map((ev, i) => {
        const vc = verdictConfig(ev.verdict);
        const casePhraseCount = ev.case_key === "filipp" ? 3 : 2;
        const startIdx = i === 0 ? 0 : evaluations.slice(0, i).reduce((acc, e) => acc + (e.case_key === "filipp" ? 3 : 2), 0);
        const caseAudioUrls = audioUrls.slice(startIdx, startIdx + casePhraseCount);
        return (
          <div key={ev.case_key} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-gray-900 bg-accent">
                {ev.case_name.slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{ev.case_name}</p>
                <p className="text-xs text-gray-400">{ev.case_description}</p>
              </div>
            </div>
            <EvaluationView
              evaluation={ev}
              audioUrls={caseAudioUrls}
              transcript={null}
            />
            {i < evaluations.length - 1 && (
              <div className="border-t border-gray-200 my-6" />
            )}
          </div>
        );
      })}
      {transcript && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-2 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Полная транскрипция
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{transcript}</p>
        </div>
      )}
    </>
  );
}

export default function CandidateDetail({ candidateId, onBack }: Props) {
  const [data, setData] = useState<CandidateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResults(candidateId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [candidateId]);

  return (
    <div className="max-w-2xl mx-auto p-4 pb-12">
      <div className="py-5 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </button>
        {data && (
          <>
            <span className="text-gray-300">|</span>
            <p className="text-sm font-semibold text-gray-900">{data.name}</p>
            <ShareButton candidateId={data.id} />
          </>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm">
          Ошибка загрузки: {error}
        </div>
      )}

      {data && !data.evaluation && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-yellow-800 text-sm">
          Результаты ещё не готовы. Кандидат не завершил интервью.
        </div>
      )}

      {data && data.evaluations && data.evaluations.length > 0 && (
        <MultiCaseEvaluationView
          evaluations={data.evaluations}
          combinedComment={data.combined_comment}
          audioUrls={data.audio_urls ?? []}
          transcript={data.transcript}
        />
      )}

      {data && data.evaluation && !data.evaluations && (
        <EvaluationView
          evaluation={data.evaluation}
          audioUrls={data.audio_urls ?? []}
          transcript={data.transcript}
        />
      )}

      {data && (data.interview_started_at || data.interview_finished_at) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Время прохождения
          </p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-1">Начало</p>
              <p className="font-semibold text-gray-800">{formatDateTime(data.interview_started_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Окончание</p>
              <p className="font-semibold text-gray-800">{formatDateTime(data.interview_finished_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Длительность</p>
              <p className="font-semibold text-gray-800">{formatDuration(data.interview_duration_sec)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
