import { useState, useEffect } from "react";
import { getResults } from "../api";
import type { CandidateResult, Evaluation } from "../api";

interface Props {
  candidateId: number;
  onBack: () => void;
}

interface MetricCardProps {
  title: string;
  count: number;
  examples: string[];
  positive?: boolean;
}

interface CoherenceCardProps {
  score: number;
  issues: string[];
}

function CoherenceCard({ score, issues }: CoherenceCardProps) {
  const isGood = score >= 6;
  const borderColor = isGood ? "border-green-400" : "border-red-400";
  const badgeBg = isGood ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
  const barColor = score >= 8 ? "bg-green-400" : score >= 6 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className={`bg-white rounded-2xl border-2 ${borderColor} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800 text-sm">Связность речи</p>
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${badgeBg}`}>
          {score}<span className="text-base font-normal">/10</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      {issues.length > 0 ? (
        <ul className="space-y-1">
          {issues.map((issue, i) => (
            <li key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              {issue}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">Нарушений не выявлено</p>
      )}
    </div>
  );
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
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${badgeBg}`}>
          {count}
        </span>
      </div>
      {examples.length > 0 ? (
        <ul className="space-y-1">
          {examples.map((ex, i) => (
            <li key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              «{ex}»
            </li>
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

function QuotesBlock({ title, quotes }: { title: string; quotes: string[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      {quotes.length > 0 ? (
        <ul className="space-y-2">
          {quotes.map((q, i) => (
            <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3">
              «{q}»
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">Нет цитат для данного маркера</p>
      )}
    </div>
  );
}

function EvaluationView({ evaluation, audioUrls, transcript }: {
  evaluation: Evaluation;
  audioUrls: string[];
  transcript: string | null;
}) {
  const isRecommended = evaluation.verdict === "Рекомендуется";
  const selected = evaluation.selected_criteria ?? [];

  const showFiller = selected.includes("filler_words");
  const showRudeness = selected.includes("rudeness");
  const showPoliteness = selected.includes("politeness");
  const showCoherence = selected.includes("coherence");

  const m = evaluation.markers;

  return (
    <>
      {/* Status banner */}
      <div
        className={`rounded-2xl p-5 mb-4 flex items-start gap-4 ${
          isRecommended ? "bg-green-50 border-2 border-green-400" : "bg-red-50 border-2 border-red-400"
        }`}
      >
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
            isRecommended ? "bg-green-100" : "bg-red-100"
          }`}
        >
          {isRecommended ? (
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-bold ${isRecommended ? "text-green-800" : "text-red-800"}`}>
            {evaluation.verdict}
          </p>
          {evaluation.comment && (
            <p className={`text-sm mt-1 leading-relaxed ${isRecommended ? "text-green-700" : "text-red-700"}`}>
              {evaluation.comment}
            </p>
          )}
        </div>
      </div>

      {/* KPI metrics */}
      <div className="space-y-3 mb-4">
        {showFiller && (
          <MetricCard
            title="Слова-паразиты"
            count={m.filler_words_count}
            examples={m.filler_words_examples}
            positive={false}
          />
        )}
        {showRudeness && (
          <MetricCard
            title="Грубость / Негатив"
            count={m.rudeness_count}
            examples={m.rudeness_examples}
            positive={false}
          />
        )}
        {showPoliteness && (
          <MetricCard
            title="Вежливость"
            count={m.politeness_count}
            examples={m.politeness_examples}
            positive={true}
          />
        )}
        {showCoherence && (
          <CoherenceCard score={m.coherence_score} issues={m.coherence_issues} />
        )}
      </div>

      {/* General quotes from LLM */}
      {evaluation.quotes.length > 0 && (
        <div className="mb-4">
          <QuotesBlock title="Ключевые цитаты" quotes={evaluation.quotes} />
        </div>
      )}

      {/* Dialog with per-turn audio */}
      {(transcript || audioUrls.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Диалог с клиентом
          </p>
          <div className="space-y-6">
            {(() => {
              // Parse transcript into client / candidate turns
              const lines = (transcript || "")
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              const clients: string[] = [];
              const candidates: string[] = [];
              for (const line of lines) {
                const mClient = line.match(/^Клиент\s*:\s*(.*)$/i);
                const mCand = line.match(/^(?:Кандидат|Ответ\s*\d+)\s*:\s*(.*)$/i);
                if (mClient) clients.push(mClient[1]);
                else if (mCand) candidates.push(mCand[1]);
                else candidates.push(line);
              }
              const total = Math.max(clients.length, candidates.length, audioUrls.length);
              return Array.from({ length: total }).map((_, i) => (
                <div key={i} className="space-y-3">
                  {/* Client phrase */}
                  {clients[i] && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border-l-4 border-gray-300">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Клиент · реплика {i + 1}
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {clients[i]}
                      </p>
                    </div>
                  )}
                  {/* Candidate audio */}
                  {audioUrls[i] && (
                    <div className="pl-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Аудиозапись ответа кандидата
                      </p>
                      <audio controls className="w-full" src={audioUrls[i]} />
                    </div>
                  )}
                  {/* Candidate transcript */}
                  {candidates[i] && (
                    <div className="border-l-4 border-accent pl-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Транскрипция ответа кандидата
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {candidates[i]}
                      </p>
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
      {/* Back button */}
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

      {data && data.evaluation && (
        <EvaluationView
          evaluation={data.evaluation}
          audioUrls={data.audio_urls ?? []}
          transcript={data.transcript}
        />
      )}
    </div>
  );
}
