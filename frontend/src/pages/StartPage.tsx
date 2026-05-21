import { useState } from "react";
import { createCandidate } from "../api";
import type { CandidateInfo } from "../App";

interface Props {
  onRegistered: (info: CandidateInfo) => void;
  sessionId: string;
}

export default function StartPage({ onRegistered, sessionId }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Введите имя кандидата"); return; }
    if (!phone.trim()) { setError("Введите номер телефона"); return; }
    if (!consent) { setError("Необходимо дать согласие на обработку персональных данных"); return; }

    setLoading(true);
    try {
      const result = await createCandidate({
        name: name.trim(),
        phone: phone.trim(),
        consent,
        selected_criteria: ["filler_words", "rudeness", "politeness", "coherence"],
        session_id: sessionId,
      });
      onRegistered({
        id: result.id,
        name: result.name,
        selected_criteria: result.selected_criteria,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent mb-4">
            <svg className="w-7 h-7 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Role Cases AI-ассистент</h1>
          <p className="text-gray-500 mt-1 text-sm">Голосовая оценка для контакт-центра</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Имя кандидата <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Номер телефона <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 000-00-00"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
            />
          </div>

          {/* Consent */}
          <div className="pt-1">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded accent-yellow-400 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-600 leading-snug">
                Я согласен(а) на запись голоса и обработку персональных данных
                в соответствии с действующим законодательством РФ.{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
          >
            {loading ? "Сохранение…" : "Далее →"}
          </button>
        </form>
      </div>
    </div>
  );
}
