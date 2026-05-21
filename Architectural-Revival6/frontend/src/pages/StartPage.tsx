import { useState } from "react";
import { createCandidate } from "../api";
import type { CandidateInfo } from "../App";

interface Props {
  onRegistered: (info: CandidateInfo) => void;
  sessionId: string;
}

interface ConsentModalProps {
  title: string;
  onClose: () => void;
  onAccept: () => void;
  children: React.ReactNode;
}

function ConsentModal({ title, onClose, onAccept, children }: ConsentModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col"
        style={{ height: "90vh", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 text-sm text-gray-700 leading-relaxed">
          {children}

          <button
            type="button"
            onClick={onAccept}
            className="mt-8 w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-3 rounded-xl text-sm transition"
          >
            Принимаю
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full text-gray-400 hover:text-gray-600 text-xs py-2 transition"
          >
            Закрыть без принятия
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentText() {
  return (
    <div className="space-y-4">
      <p>
        Оставляя данные на сайте проекта "Role Cases AI-Assessor", вы добровольно и в своих
        интересах даете согласие на обработку ваших персональных данных Оператору —
        Бондарчук София Алексеевна, г. Москва, Российская Федерация, e-mail:{" "}
        <a
          href="mailto:role_cases_assessor.sup@mail.ru"
          className="text-blue-600 underline hover:text-blue-800"
        >
          role_cases_assessor.sup@mail.ru
        </a>
        , со следующими условиями:
      </p>

      <div>
        <p className="font-semibold mb-1">
          1. В рамках работы сайта могут обрабатываться следующие данные:
        </p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>имя и фамилия;</li>
          <li>адрес электронной почты;</li>
          <li>номер телефона;</li>
          <li>текстовые сообщения и ответы;</li>
          <li>аудиозаписи, голосовые сообщения и ответы, предоставленные пользователем.</li>
        </ul>
        <p className="mt-2">
          Обрабатываемые персональные данные не относятся к специальным категориям или
          биометрическим в соответствии со ст. 10–11 152-ФЗ и обрабатываются
          автоматизированным способом. Основанием для обработки ваших персональных данных в
          этом процессе является согласие на обработку персональных данных. После достижения
          целей обработки данные удаляются или уничтожаются.
        </p>
      </div>

      <div>
        <p className="font-semibold mb-1">
          2. Персональные данные обрабатываются для следующих целей:
        </p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>обеспечение работы дипломного проекта;</li>
          <li>обработка обратной связи по результатам прохождения ролевых голосовых кейсов;</li>
          <li>
            проведение интервью и анализа голосовых кейсов пользователя (без использования
            аудиозаписей для установления личности пользователя);
          </li>
          <li>тестирование и улучшение функциональности сервиса;</li>
          <li>
            проведение исследований и демонстрация результатов работы проекта в учебных целях.
          </li>
        </ul>
      </div>

      <div>
        <p className="font-semibold mb-1">
          3. Для достижения перечисленных выше целей с данными могут выполняться следующие
          действия:
        </p>
        <p>
          Сбор, запись, систематизация, хранение, уточнение (обновление, изменение),
          извлечение, использование, передача (предоставление доступа) компаниям-партнерам
          (потенциальным работодателям, инициировавшим тестирование), а также трансграничная
          передача с использованием зарубежных ИТ-инфраструктур и облачных сервисов для
          автоматизированного анализа данных, блокирование, удаление и уничтожение.
        </p>
      </div>

      <div>
        <p className="font-semibold mb-1">4. Сроки обработки и уничтожения:</p>
        <p>
          Ваши персональные данные будут уничтожены в течение 30 дней с момента достижения
          целей обработки, утраты необходимости в их достижении или с момента получения от
          вас отзыва согласия на обработку персональных данных (в соответствии с ч. 5 ст. 21
          152-ФЗ).
        </p>
      </div>

      <div>
        <p className="font-semibold mb-1">5. Отзыв согласия:</p>
        <p>
          Я понимаю, что могу в любой момент отозвать своё согласие на обработку
          персональных данных путем направления письменного или электронного заявления по
          адресу{" "}
          <a
            href="mailto:role_cases_assessor.sup@mail.ru"
            className="text-blue-600 underline hover:text-blue-800"
          >
            role_cases_assessor.sup@mail.ru
          </a>
          .
        </p>
      </div>

      <p>
        6. Согласие действует с момента предоставления данных и до момента его отзыва или
        прекращения обработки персональных данных.
      </p>
    </div>
  );
}

const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

function countDigits(value: string): number {
  return (value.match(/\d/g) || []).length;
}

function sanitizePhoneInput(value: string): string {
  const cleaned = value.replace(/[^\d+\-\s()]/g, "");
  let digits = 0;
  let result = "";
  for (const ch of cleaned) {
    if (/\d/.test(ch)) {
      if (digits >= PHONE_MAX_DIGITS) continue;
      digits++;
    }
    result += ch;
  }
  return result;
}

export default function StartPage({ onRegistered, sessionId }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const phoneDigits = countDigits(phone);
  const phoneValid = phoneDigits >= PHONE_MIN_DIGITS && phoneDigits <= PHONE_MAX_DIGITS;
  const phoneError =
    phone.trim() !== "" && !phoneValid
      ? `Введите не менее ${PHONE_MIN_DIGITS} цифр (сейчас ${phoneDigits})`
      : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Введите имя кандидата"); return; }
    if (!phone.trim()) { setError("Введите номер телефона"); return; }
    if (!phoneValid) {
      setError(`Номер телефона должен содержать не менее ${PHONE_MIN_DIGITS} цифр`);
      return;
    }
    if (!consent) { setError("Необходимо дать согласие на обработку персональных данных"); return; }
    if (!privacyConsent) { setError("Необходимо принять политику конфиденциальности"); return; }

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
        filler_threshold: result.filler_threshold ?? 2,
        selected_cases: result.selected_cases ?? ["maria"],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showConsentModal && (
        <ConsentModal
          title="Согласие на обработку персональных данных"
          onClose={() => setShowConsentModal(false)}
          onAccept={() => {
            setConsent(true);
            setShowConsentModal(false);
          }}
        >
          <ConsentText />
        </ConsentModal>
      )}

      {showPrivacyModal && (
        <ConsentModal
          title="Политика конфиденциальности"
          onClose={() => setShowPrivacyModal(false)}
          onAccept={() => {
            setPrivacyConsent(true);
            setShowPrivacyModal(false);
          }}
        >
          <p>Текст политики конфиденциальности.</p>
        </ConsentModal>
      )}

      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Номер телефона <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                placeholder="+7 (999) 000-00-00"
                className={`w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition ${
                  phoneError ? "border-red-400" : "border-gray-300"
                }`}
              />
              {phoneError && (
                <p className="text-xs text-red-600 mt-1">{phoneError}</p>
              )}
            </div>

            <div className="pt-1 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded accent-yellow-400 cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-gray-600 leading-snug">
                  Я даю согласие на обработку моих персональных данных на условиях{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowConsentModal(true);
                    }}
                    className="text-blue-600 underline hover:text-blue-800 transition"
                  >
                    Согласия на обработку персональных данных
                  </button>
                  .{" "}
                  <span className="text-red-500">*</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded accent-yellow-400 cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-gray-600 leading-snug">
                  Я согласен(а) с{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPrivacyModal(true);
                    }}
                    className="text-blue-600 underline hover:text-blue-800 transition"
                  >
                    политикой конфиденциальности
                  </button>
                  .{" "}
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
              disabled={
                loading ||
                !name.trim() ||
                !phoneValid ||
                !consent ||
                !privacyConsent
              }
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
            >
              {loading ? "Сохранение…" : "Далее →"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
