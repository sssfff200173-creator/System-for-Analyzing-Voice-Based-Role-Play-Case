import { useState, useRef, useEffect } from "react";
import { transcribeAudio, evaluateCandidate, uploadRecording } from "../api";
import type { Evaluation, DialogTurn } from "../api";
import type { CandidateInfo } from "../App";

interface Props {
  candidate: CandidateInfo;
  onFinish: (evaluation: Evaluation, transcript: string) => void;
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

const TOTAL_STEPS = 2;

const CLIENT_NAME = "Клиент";

// Must match backend/config.py CLIENT_PHRASES exactly
const CLIENT_PHRASES = [
  "Алё, здравствуйте! Я вчера покупала у вас телефон, забрала его из пункта выдачи. А когда пришла домой и открыла — поняла, что там огромная царапина на весь экран! Пришла сегодня снова в пункт выдачи, хотела вернуть, а его видите ли не принимают! В ваших правилах вообще ничего не понятно! Что мне теперь делать с этим дурацким телефоном!",
  "Я уже третий раз звоню вам! Вы вообще ничего не можете решить! Для чего вы там сидите!",
];

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

export default function InterviewPage({ candidate, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<PhaseState>("loading_audio");
  const [errorMsg, setErrorMsg] = useState("");

  // Use refs to always have fresh values inside MediaRecorder callbacks
  const stepRef = useRef(0);
  const transcriptRef = useRef<DialogTurn[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const allBlobsRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const onFinishRef = useRef(onFinish);
  const candidateRef = useRef(candidate);
  onFinishRef.current = onFinish;
  candidateRef.current = candidate;

  // Pre-request mic permission on mount so the browser dialog + system sound
  // happen BEFORE the TTS audio starts playing, not right after it ends.
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
  }, []);

  // Load & auto-play TTS for current step
  useEffect(() => {
    setPhase("loading_audio");
    const phraseId = step + 1;
    const audio = new Audio(`/api/audio/${phraseId}`);

    // Trim trailing artifact ("noise") at the end of TTS audio.
    // Phrase 2 has a longer tail noise — trim more aggressively.
    const TAIL_TRIM_SEC = phraseId === 2 ? 1.35 : 0.5;
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
  }, [step]);

  // Core logic — always reads from refs, never from stale closures
  async function processBlob(blob: Blob) {
    // Save blob for combined recording upload
    allBlobsRef.current = [...allBlobsRef.current, blob];
    setPhase("transcribing");
    try {
      const result = await transcribeAudio(blob);

      if (result.hallucination || !result.text.trim()) {
        setPhase("mic_error");
        return;
      }

      const turn: DialogTurn = { role: "Кандидат", text: result.text };
      transcriptRef.current = [...transcriptRef.current, turn];

      const nextStep = stepRef.current + 1;

      if (nextStep < TOTAL_STEPS) {
        // Move to next phrase
        stepRef.current = nextStep;
        setStep(nextStep);
      } else {
        // All phrases answered — evaluate
        setPhase("evaluating");
        await doEvaluate();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ошибка транскрипции");
      setPhase("error");
    }
  }

  async function doEvaluate() {
    try {
      const { id, selected_criteria } = candidateRef.current;

      // Build the full interleaved dialog so YandexGPT has complete context.
      // Without client phrases the model evaluates candidate answers in isolation
      // and misses conversational cues (rudeness, empathy, etc.).
      const candidateAnswers = transcriptRef.current;
      const fullDialog: DialogTurn[] = [];
      for (let i = 0; i < TOTAL_STEPS; i++) {
        if (CLIENT_PHRASES[i]) {
          fullDialog.push({ role: "Клиент", text: CLIENT_PHRASES[i] });
        }
        if (candidateAnswers[i]) {
          fullDialog.push(candidateAnswers[i]);
        }
      }

      const transcript = candidateAnswers
        .map((turn, i) => `Ответ ${i + 1}: ${turn.text}`)
        .join("\n\n");

      const result = await evaluateCandidate(id, fullDialog, selected_criteria);

      // Upload each recording separately (concatenating webm blobs corrupts playback)
      if (allBlobsRef.current.length > 0) {
        uploadRecording(id, allBlobsRef.current).catch(() => {});
      }

      onFinishRef.current(result.evaluation, transcript);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ошибка оценки");
      setPhase("error");
    }
  }

  async function startRecording() {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processBlob(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setPhase("recording");
    } catch {
      setErrorMsg("Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.");
      setPhase("error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setPhase("transcribing");
  }

  const isIdle = phase === "ready_to_record" || phase === "mic_error";
  const isBusy = phase === "loading_audio" || phase === "playing" || phase === "transcribing" || phase === "evaluating";
  const isRecording = phase === "recording";

  // Avatar initials
  const initials = CLIENT_NAME.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 max-w-sm mx-auto">

      {/* Top: progress */}
      <div className="w-full pt-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Звонок</span>
          <span>{step + 1} / {TOTAL_STEPS}</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full">
          <div
            className="h-1.5 bg-accent rounded-full transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Center: client avatar + status */}
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Avatar with animated ring when client is talking */}
        <div className={`relative ${phase === "playing" ? "animate-pulse" : ""}`}>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-gray-900
            ${phase === "playing" ? "bg-accent ring-4 ring-accent/40" : "bg-gray-200"} transition`}>
            {initials}
          </div>
          {/* Recording indicator on avatar */}
          {isRecording && (
            <span className="absolute bottom-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>

        <div className="text-center">
          <p className="font-semibold text-gray-900 text-lg">{CLIENT_NAME}</p>
          <p className="text-sm text-gray-500 mt-1">{STATUS_TEXT[phase]}</p>
        </div>

        {/* Loading dots */}
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

        {/* Mic error message */}
        {phase === "mic_error" && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-2xl px-5 py-4 text-sm text-center leading-relaxed max-w-xs">
            Вас не было слышно. Пожалуйста, проверьте микрофон и попробуйте снова.
          </div>
        )}

        {/* Error */}
        {phase === "error" && errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm text-center max-w-xs">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bottom: mic button */}
      <div className="w-full pb-6 flex flex-col items-center gap-4">
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
