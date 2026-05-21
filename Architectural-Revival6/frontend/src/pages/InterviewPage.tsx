import { useState, useRef, useEffect } from "react";
import { transcribeAudio, evaluateCandidate, evaluateMulti, uploadRecording } from "../api";
import type { Evaluation, DialogTurn } from "../api";
import type { CandidateInfo } from "../App";

interface Props {
  candidate: CandidateInfo;
  onFinish: (evaluation: Evaluation | null, transcript: string) => void;
}

type PhaseState =
  | "loading_audio"
  | "playing"
  | "ready_to_record"
  | "recording"
  | "transcribing"
  | "mic_error"
  | "evaluating"
  | "error";

const TARGET_SAMPLE_RATE = 16000;

const CASE_META: Record<string, { name: string; description: string; phraseCount: number }> = {
  maria: { name: "Мария", description: "аффективный, эмоциональный клиент", phraseCount: 2 },
  filipp: { name: "Филипп", description: "рационально-недовольный клиент", phraseCount: 3 },
};

const CASE_PHRASES: Record<string, string[]> = {
  maria: [
    "Алё, здравствуйте! Я вчера покупала у вас телефон, забрала его из пункта выдачи. А когда пришла домой и открыла — поняла, что там огромная царапина на весь экран! Пришла сегодня снова в пункт выдачи, хотела вернуть, а его видите ли не принимают! В ваших правилах вообще ничего не понятно! Что мне теперь делать с этим дурацким телефоном!",
    "Я уже третий раз звоню вам! Вы вообще ничего не можете решить! Для чего вы там сидите!",
  ],
  filipp: [
    "Здравствуйте. Профиль 20-73-72-89. Моё оплаченное объявление заблокировали с абстрактной пометкой «есть похожее». Я написал в чат двадцать минут назад, ответа до сих пор нет. Требую назвать конкретный пункт правил, который я нарушил, или разблокировать моё объявление.",
    "Вы предлагаете мне сидеть и ждать в чате, пока мои оплаченные сутки сгорают? Нет, спасибо. Раз вы блокируете платную услугу, вы обязаны объяснять причину детально. Если не решите вопрос сейчас, я зафиксирую убытки и буду вынужден обратиться в Роспотребнадзор и подать на вашу компанию в суд.",
    "Мне нужны не извинения, а решение. Если вы не компетентны в вопросе — фиксируйте официальную претензию и диктуйте номер обращения. За каждый час простоя я буду требовать финансовую компенсацию.",
  ],
};

const STATUS_TEXT: Record<PhaseState, string> = {
  loading_audio: "Подготовка звонка…",
  playing: "Клиент говорит…",
  ready_to_record: "Ваша очередь отвечать",
  recording: "Идёт запись…",
  transcribing: "Распознаём речь…",
  mic_error: "Вас не было слышно",
  evaluating: "Анализируем результаты…",
  error: "Ошибка",
};

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const dataBytes = int16.byteLength;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, 44).set(int16);
  return new Blob([buffer], { type: "audio/wav" });
}

interface WavRecorder {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  samples: Float32Array[];
}

export default function InterviewPage({ candidate, onFinish }: Props) {
  const selectedCases = candidate.selected_cases?.length ? candidate.selected_cases : ["maria"];

  const [caseIndex, setCaseIndex] = useState(0);
  const [stepInCase, setStepInCase] = useState(0);
  const [phase, setPhase] = useState<PhaseState>("loading_audio");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);
  const timerStartRef = useRef<number>(0);

  const currentCaseKey = selectedCases[caseIndex] ?? "maria";
  const currentCaseMeta = CASE_META[currentCaseKey] ?? CASE_META["maria"];
  const totalPhrasesInCase = currentCaseMeta.phraseCount;

  const totalSteps = selectedCases.reduce(
    (acc, k) => acc + (CASE_META[k]?.phraseCount ?? 2),
    0
  );
  const completedSteps =
    selectedCases.slice(0, caseIndex).reduce(
      (acc, k) => acc + (CASE_META[k]?.phraseCount ?? 2),
      0
    ) + stepInCase;

  function startTimer() {
    if (timerIntervalRef.current !== null) return;
    timerStartRef.current = Date.now();
    setElapsedSec(0);
    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - timerStartRef.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current !== null) window.clearInterval(timerIntervalRef.current);
    };
  }, []);

  function formatDuration(totalSec: number): string {
    const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const ss = (totalSec % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  const caseIndexRef = useRef(0);
  const stepInCaseRef = useRef(0);
  const caseTranscriptsRef = useRef<DialogTurn[][]>(selectedCases.map(() => []));
  const allWavBlobsRef = useRef<Blob[]>([]);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const onFinishRef = useRef(onFinish);
  const candidateRef = useRef(candidate);
  onFinishRef.current = onFinish;
  candidateRef.current = candidate;

  useEffect(() => {
    setPhase("loading_audio");
    const phraseId = stepInCase + 1;
    const audio = new Audio(`/api/audio/${currentCaseKey}/${phraseId}`);

    const TAIL_TRIM_SEC = phraseId === totalPhrasesInCase ? 0 : 0.5;
    let stopped = false;
    const stopEarly = () => {
      if (stopped) return;
      stopped = true;
      audio.pause();
      setPhase("ready_to_record");
    };

    audio.oncanplaythrough = () => {
      setPhase("playing");
      audio.play().catch(() => setPhase("ready_to_record"));
    };
    audio.ontimeupdate = () => {
      if (
        !stopped &&
        audio.duration &&
        isFinite(audio.duration) &&
        audio.currentTime >= audio.duration - TAIL_TRIM_SEC
      ) {
        stopEarly();
      }
    };
    audio.onerror = () => setPhase("ready_to_record");
    audio.onended = () => stopEarly();

    return () => {
      audio.oncanplaythrough = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
    };
  }, [caseIndex, stepInCase]);

  async function processBlob(blob: Blob) {
    allWavBlobsRef.current = [...allWavBlobsRef.current, blob];
    setPhase("transcribing");
    try {
      const result = await transcribeAudio(blob);

      if (result.hallucination || !result.text.trim()) {
        setPhase("mic_error");
        return;
      }

      const turn: DialogTurn = { role: "Кандидат", text: result.text };
      const ci = caseIndexRef.current;
      const si = stepInCaseRef.current;
      caseTranscriptsRef.current[ci] = [...caseTranscriptsRef.current[ci], turn];

      const nextStepInCase = si + 1;
      if (nextStepInCase < (CASE_META[selectedCases[ci]]?.phraseCount ?? 2)) {
        stepInCaseRef.current = nextStepInCase;
        setStepInCase(nextStepInCase);
      } else {
        const nextCaseIndex = ci + 1;
        if (nextCaseIndex < selectedCases.length) {
          caseIndexRef.current = nextCaseIndex;
          stepInCaseRef.current = 0;
          setCaseIndex(nextCaseIndex);
          setStepInCase(0);
        } else {
          setPhase("evaluating");
          await doEvaluate();
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ошибка транскрипции");
      setPhase("error");
    }
  }

  async function doEvaluate() {
    try {
      const { id, selected_criteria, filler_threshold } = candidateRef.current;
      const filler = filler_threshold ?? 2;

      if (allWavBlobsRef.current.length > 0) {
        uploadRecording(id, allWavBlobsRef.current).catch(() => {});
      }

      if (selectedCases.length === 1) {
        const caseKey = selectedCases[0];
        const answers = caseTranscriptsRef.current[0];
        const phrases = CASE_PHRASES[caseKey] ?? [];
        const fullDialog: DialogTurn[] = [];
        for (let i = 0; i < (CASE_META[caseKey]?.phraseCount ?? 2); i++) {
          if (phrases[i]) fullDialog.push({ role: "Клиент", text: phrases[i] });
          if (answers[i]) fullDialog.push(answers[i]);
        }
        const transcript = answers.map((t, i) => `Ответ ${i + 1}: ${t.text}`).join("\n\n");
        const result = await evaluateCandidate(id, fullDialog, selected_criteria, filler);
        onFinishRef.current(result.evaluation, transcript);
      } else {
        const cases = selectedCases.map((caseKey, ci) => {
          const answers = caseTranscriptsRef.current[ci];
          const phrases = CASE_PHRASES[caseKey] ?? [];
          const fullDialog: DialogTurn[] = [];
          for (let i = 0; i < (CASE_META[caseKey]?.phraseCount ?? 2); i++) {
            if (phrases[i]) fullDialog.push({ role: "Клиент", text: phrases[i] });
            if (answers[i]) fullDialog.push(answers[i]);
          }
          return { case_key: caseKey, dialog: fullDialog };
        });
        await evaluateMulti(id, cases, selected_criteria, filler);
        onFinishRef.current(null, "");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ошибка оценки");
      setPhase("error");
    }
  }

  async function startRecording() {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });
      const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const samples: Float32Array[] = [];
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        samples.push(new Float32Array(data));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      wavRecorderRef.current = { audioContext, processor, stream, source, samples };
      setPhase("recording");
      startTimer();
    } catch {
      setErrorMsg("Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.");
      setPhase("error");
    }
  }

  function stopRecording() {
    const rec = wavRecorderRef.current;
    if (!rec) return;
    stopTimer();
    const { audioContext, processor, stream, source, samples } = rec;
    source.disconnect();
    processor.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    wavRecorderRef.current = null;
    setPhase("transcribing");
    const totalLen = samples.reduce((acc, s) => acc + s.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of samples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const nativeSampleRate = audioContext.sampleRate;
    const resampled = downsample(merged, nativeSampleRate, TARGET_SAMPLE_RATE);
    const wavBlob = encodeWav(resampled, TARGET_SAMPLE_RATE);
    audioContext.close();
    processBlob(wavBlob);
  }

  const isIdle = phase === "ready_to_record" || phase === "mic_error";
  const isBusy =
    phase === "loading_audio" ||
    phase === "playing" ||
    phase === "transcribing" ||
    phase === "evaluating";
  const isRecording = phase === "recording";

  const initials = currentCaseMeta.name.slice(0, 2).toUpperCase();
  const isTwoCase = selectedCases.length > 1;

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 max-w-sm mx-auto">

      {/* Top: progress */}
      <div className="w-full pt-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>
            {isTwoCase
              ? `Кейс ${caseIndex + 1} из ${selectedCases.length} · реплика ${stepInCase + 1} из ${totalPhrasesInCase}`
              : "Звонок"}
          </span>
          <span>{completedSteps + 1} / {totalSteps}</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full">
          <div
            className="h-1.5 bg-accent rounded-full transition-all duration-500"
            style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Center: client avatar + status */}
      <div className="flex flex-col items-center gap-6 py-8">
        <div className={`relative ${phase === "playing" ? "animate-pulse" : ""}`}>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-gray-900
            ${phase === "playing" ? "bg-accent ring-4 ring-accent/40" : "bg-gray-200"} transition`}>
            {initials}
          </div>
          {isRecording && (
            <span className="absolute bottom-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>

        <div className="text-center">
          <p className="font-semibold text-gray-900 text-lg">{currentCaseMeta.name}</p>
          {isTwoCase && (
            <p className="text-xs text-gray-400 mt-0.5">{currentCaseMeta.description}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">{STATUS_TEXT[phase]}</p>
        </div>

        {isBusy && (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 bg-accent rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}

        {phase === "mic_error" && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-2xl px-5 py-4 text-sm text-center leading-relaxed max-w-xs">
            Вас не было слышно. Пожалуйста, проверьте микрофон и попробуйте снова.
          </div>
        )}

        {phase === "error" && errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm text-center max-w-xs">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bottom: mic button */}
      <div className="w-full pb-6 flex flex-col items-center gap-4">
        {isRecording && (
          <div
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-1.5 rounded-full shadow-md"
            aria-live="polite"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {formatDuration(elapsedSec)}
            </span>
          </div>
        )}

        {(isIdle || phase === "error") && (
          <button
            onClick={startRecording}
            className="w-20 h-20 bg-accent hover:bg-accent-hover rounded-full flex items-center justify-center shadow-lg transition active:scale-90"
            aria-label="Начать запись"
          >
            <svg className="w-9 h-9 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition active:scale-90"
            aria-label="Завершить запись"
          >
            <span className="w-7 h-7 bg-white rounded-md" />
          </button>
        )}

        <p className="text-xs text-gray-400 text-center">
          {isIdle && "Нажмите, чтобы начать ответ"}
          {isRecording && "Нажмите, чтобы завершить запись"}
          {isBusy && phase !== "evaluating" && "Пожалуйста, подождите…"}
          {phase === "evaluating" && "Это займёт несколько секунд…"}
        </p>

        <p className="text-xs text-gray-300">{candidate.name}</p>
      </div>
    </div>
  );
}
