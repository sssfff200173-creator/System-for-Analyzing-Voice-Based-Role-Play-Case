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
const TARGET_SAMPLE_RATE = 16000;

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

// ── WAV helpers ────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

interface WavRecorder {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  samples: Float32Array[];
}

export default function InterviewPage({ candidate, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<PhaseState>("loading_audio");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);
  const timerStartRef = useRef<number>(0);

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
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  function formatDuration(totalSec: number): string {
    const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const ss = (totalSec % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  const stepRef = useRef(0);
  const transcriptRef = useRef<DialogTurn[]>([]);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const allWavBlobsRef = useRef<Blob[]>([]);
  const onFinishRef = useRef(onFinish);
  const candidateRef = useRef(candidate);
  onFinishRef.current = onFinish;
  candidateRef.current = candidate;

  // Load & auto-play TTS for current step
  useEffect(() => {
    setPhase("loading_audio");
    const phraseId = step + 1;
    const audio = new Audio(`/api/audio/${phraseId}`);

    const TAIL_TRIM_SEC = phraseId === 2 ? 0 : 0.5;
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
      transcriptRef.current = [...transcriptRef.current, turn];

      const nextStep = stepRef.current + 1;
      if (nextStep < TOTAL_STEPS) {
        stepRef.current = nextStep;
        setStep(nextStep);
      } else {
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

      if (allWavBlobsRef.current.length > 0) {
        uploadRecording(id, allWavBlobsRef.current).catch(() => {});
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });

      // Use sampleRate: TARGET_SAMPLE_RATE hint; browser may honour or override it.
      const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const samples: Float32Array[] = [];

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        samples.push(new Float32Array(data));
      };

      source.connect(processor);
      // Must connect to destination for onaudioprocess to fire
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

    // Merge all Float32 chunks
    const totalLen = samples.reduce((acc, s) => acc + s.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of samples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Downsample to 16000 Hz if needed, then encode as WAV
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
          <p className="font-semibold text-gray-900 text-lg">{CLIENT_NAME}</p>
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
            aria-label={`Длительность записи ${formatDuration(elapsedSec)}`}
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
