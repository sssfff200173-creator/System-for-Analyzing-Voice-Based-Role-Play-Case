import { useState } from "react";

interface Props {
  candidateId: number;
  defaultCriteria: string[];
  onDone: (criteria: string[]) => void;
}

const OPTIONS = [
  {
    key: "filler_words",
    label: "Слова-паразиты",
    description: "«ну», «типа», «короче», «как бы» и похожие",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
      </svg>
    ),
  },
  {
    key: "rudeness",
    label: "Грубость",
    description: "Оскорбления, агрессия, пренебрежение к клиенту",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    key: "politeness",
    label: "Вежливость",
    description: "Извинения, эмпатия, уважительное обращение",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    key: "coherence",
    label: "Связность речи",
    description: "Релевантность ответа, логика и понятность изложения",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

export default function CriteriaPage({ onDone, defaultCriteria }: Props) {
  const [criteria, setCriteria] = useState<string[]>(defaultCriteria);
  const [error, setError] = useState("");

  function toggle(key: string) {
    setCriteria((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function handleSubmit() {
    if (criteria.length === 0) {
      setError("Выберите хотя бы один критерий оценки");
      return;
    }
    onDone(criteria);
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Header */}
        <div className="mb-7 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-4">
            <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Критерии оценки</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Выберите параметры, которые нужно проверить
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {OPTIONS.map(({ key, label, description, icon }) => {
            const checked = criteria.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition ${
                  checked
                    ? "border-accent bg-yellow-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {/* Custom checkbox */}
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                    checked ? "bg-accent border-accent" : "border-gray-300"
                  }`}
                >
                  {checked && (
                    <svg className="w-4 h-4 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Icon + text */}
                <div className={`flex-shrink-0 ${checked ? "text-gray-800" : "text-gray-400"}`}>
                  {icon}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          className="w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
        >
          Начать оценку →
        </button>
      </div>
    </div>
  );
}
