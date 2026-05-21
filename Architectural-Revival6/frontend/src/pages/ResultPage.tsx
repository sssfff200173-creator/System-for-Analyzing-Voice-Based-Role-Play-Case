import type { Evaluation } from "../api";
import type { CandidateInfo } from "../App";

interface Props {
  candidate: CandidateInfo;
  evaluation: Evaluation;
  transcript: string;
  onRestart: () => void;
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

  const barWidth = `${score * 10}%`;
  const barColor = score >= 8 ? "bg-green-400" : score >= 6 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className={`bg-white rounded-2xl border-2 ${borderColor} p-5 transition`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800 text-sm">Связность речи</p>
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${badgeBg}`}>
          {score}<span className="text-base font-normal">/10</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: barWidth }} />
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
    <div className={`bg-white rounded-2xl border-2 ${borderColor} p-5 transition`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${badgeBg}`}>
          {count}
        </span>
      </div>
      {examples.length > 0 && (
        <ul className="space-y-1">
          {examples.map((ex, i) => (
            <li key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              «{ex}»
            </li>
          ))}
        </ul>
      )}
      {examples.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          {positive ? "Примеры не найдены" : "Не обнаружено"}
        </p>
      )}
    </div>
  );
}

export default function ResultPage({ candidate, evaluation, transcript, onRestart }: Props) {
  const isRecommended = evaluation.verdict === "Рекомендуется";
  const selected = evaluation.selected_criteria ?? candidate.selected_criteria ?? [];

  const showFiller = selected.includes("filler_words");
  const showRudeness = selected.includes("rudeness");
  const showPoliteness = selected.includes("politeness");
  const showCoherence = selected.includes("coherence");

  return (
    <div className="max-w-lg mx-auto p-4 pb-10">
      {/* Header */}
      <div className="py-6 text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
            isRecommended ? "bg-green-100" : "bg-red-100"
          }`}
        >
          {isRecommended ? (
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">{candidate.name}</h1>
        <span
          className={`inline-block px-5 py-2 rounded-full text-base font-bold mt-1 ${
            isRecommended
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {evaluation.verdict}
        </span>
      </div>

      {/* Comment */}
      {evaluation.comment && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Комментарий HR</p>
          <p className="text-gray-800 text-sm leading-relaxed">{evaluation.comment}</p>
        </div>
      )}

      {/* Metrics — show only selected criteria */}
      <div className="space-y-3 mb-4">
        {showFiller && (
          <MetricCard
            title="Слова-паразиты"
            count={evaluation.markers.filler_words_count}
            examples={evaluation.markers.filler_words_examples}
            positive={false}
          />
        )}
        {showRudeness && (
          <MetricCard
            title="Грубость"
            count={evaluation.markers.rudeness_count}
            examples={evaluation.markers.rudeness_examples}
            positive={false}
          />
        )}
        {showPoliteness && (
          <MetricCard
            title="Вежливость"
            count={evaluation.markers.politeness_count}
            examples={evaluation.markers.politeness_examples}
            positive={true}
          />
        )}
        {showCoherence && (
          <CoherenceCard
            score={evaluation.markers.coherence_score}
            issues={evaluation.markers.coherence_issues}
          />
        )}
      </div>

      {/* Quotes */}
      {evaluation.quotes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Цитаты кандидата</p>
          <ul className="space-y-2">
            {evaluation.quotes.map((q, i) => (
              <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3">
                «{q}»
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full transcript */}
      {transcript && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Расшифровка ответов кандидата
          </p>
          <div className="space-y-3">
            {transcript.split("\n\n").map((block, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {block}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Restart */}
      <button
        onClick={onRestart}
        className="w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-4 rounded-2xl text-base transition active:scale-95"
      >
        Новый кандидат
      </button>
    </div>
  );
}
