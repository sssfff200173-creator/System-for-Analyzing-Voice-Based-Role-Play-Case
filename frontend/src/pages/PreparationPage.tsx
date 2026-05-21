import { useEffect, useState } from "react";

interface Props {
  onReady: () => void;
}

type MicState = "idle" | "requesting" | "granted" | "denied";

export default function PreparationPage({ onReady }: Props) {
  const [micState, setMicState] = useState<MicState>("idle");

  // Request microphone permission immediately when this screen opens, so that
  // the browser's permission prompt is resolved BEFORE the interview begins.
  useEffect(() => {
    let cancelled = false;
    setMicState("requesting");
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // We only needed to trigger the permission prompt — release the device.
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelled) setMicState("granted");
      })
      .catch(() => {
        if (!cancelled) setMicState("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-[652px] p-10">
        <div className="space-y-4 text-gray-800 text-base leading-relaxed mb-6">
          <p>
            Сейчас Вам предстоит выполнить задание — поговорить с виртуальным
            клиентом. В рамках этого диалога Вы будете представлять вымышленную
            компанию, вся необходимая информация будет в «Памятке для
            выполнения задания». Требуется внимательно ознакомиться с правилами
            из памятки, так как в процессе диалога вернуться к ним не
            получится.
          </p>
          <p>
            После того, как Вы нажмёте «Готов начать», начнётся выполнение
            задания. Вернуться назад на этот экран будет нельзя. Пожалуйста,
            убедитесь, что в помещении хорошая слышимость и Вас никто не
            отвлекает. Предварительно не забудьте проверить, что микрофон на
            вашем устройстве включён.
          </p>
          <p>Диалог будет коротким и не трудным. Удачи!</p>
        </div>

        {/* Mic permission status */}
        {micState === "requesting" && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-sm mb-5">
            Запрашиваем доступ к микрофону…
          </div>
        )}
        {micState === "granted" && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm mb-5 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Микрофон готов
          </div>
        )}
        {micState === "denied" && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl px-4 py-3 text-sm mb-5">
            Доступ к микрофону не предоставлен. Пожалуйста, разрешите доступ в
            настройках браузера и обновите страницу — без микрофона задание
            выполнить не получится.
          </div>
        )}

        <button
          onClick={onReady}
          disabled={micState === "denied"}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
        >
          Готов начать
        </button>

        <p className="mt-6 text-xs text-gray-400 leading-relaxed text-center">
          При возникновении технических проблем, пожалуйста, напишите (со
          снимками экрана) на почту:{" "}
          <a href="mailto:role_cases_assessor.sup@mail.ru" className="underline hover:text-gray-600">
            role_cases_assessor.sup@mail.ru
          </a>
        </p>
      </div>
    </div>
  );
}
