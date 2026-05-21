import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useTranscribeAudio, useEvaluateAssessment } from "@workspace/api-client-react";
import type { DialogTurn } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

type Step =
  | "loading"
  | "not_found"
  | "already_done"
  | "name_entry"
  | "intro"
  | "playing"
  | "recording"
  | "transcribing"
  | "evaluating"
  | "completed";

const SILENCE_ERROR =
  "Вас не было слышно. Пожалуйста, проверьте микрофон и попробуйте снова. Если возникнут сложности, напишите в техническую поддержку.";

export default function InterviewPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params.uuid;

  const [step, setStep] = useState<Step>("loading");
  const [candidateName, setCandidateName] = useState("");
  const [nameError, setNameError] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [dialogue, setDialogue] = useState<DialogTurn[]>([]);
  const [silenceError, setSilenceError] = useState(false);

  const maxPhases = 2;

  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const transcribeMutation = useTranscribeAudio();
  const evaluateMutation = useEvaluateAssessment();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: sessionData, isError: sessionError } = useQuery({
    queryKey: ["session", uuid],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${uuid}`);
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<{ uuid: string; status: string }>;
    },
    enabled: !!uuid,
    retry: false,
  });

  useEffect(() => {
    if (sessionError) {
      setStep("not_found");
    } else if (sessionData) {
      if (sessionData.status === "completed") {
        setStep("already_done");
      } else {
        setStep("name_entry");
      }
    }
  }, [sessionData, sessionError]);

  const handleNameSubmit = () => {
    if (candidateName.trim().length < 2) {
      setNameError("Введите ФИО (минимум 2 символа)");
      return;
    }
    setNameError("");
    setStep("intro");
  };

  const playAudioForPhase = (index: number) => {
    setStep("playing");
    setSilenceError(false);
    const audio = new Audio(`/api/assessment/audio/${index}`);
    audioRef.current = audio;
    audio.onended = () => setStep("recording");
    audio.play().catch(() => setStep("recording"));
  };

  const handleStartPhase = () => playAudioForPhase(phaseIndex);

  const handleRecordToggle = async () => {
    if (isRecording) {
      try {
        const blob = await stopRecording();
        handleTranscription(blob);
      } catch {
        toast({ title: "Ошибка", description: "Не удалось остановить запись", variant: "destructive" });
      }
    } else {
      try {
        await startRecording();
        setSilenceError(false);
      } catch {
        toast({ title: "Ошибка", description: "Нет доступа к микрофону", variant: "destructive" });
      }
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    setStep("transcribing");
    try {
      const result = await transcribeMutation.mutateAsync({ data: { audio: audioBlob } });

      if (result.isEmpty) {
        setSilenceError(true);
        setStep("recording");
        return;
      }

      const turn: DialogTurn = { role: "candidate", text: result.text };
      const newDialogue = [...dialogue, turn];
      setDialogue(newDialogue);

      if (phaseIndex + 1 < maxPhases) {
        setPhaseIndex(phaseIndex + 1);
        playAudioForPhase(phaseIndex + 1);
      } else {
        handleEvaluation(newDialogue);
      }
    } catch {
      toast({ title: "Ошибка", description: "Ошибка при распознавании речи", variant: "destructive" });
      setStep("recording");
    }
  };

  const handleEvaluation = async (finalDialogue: DialogTurn[]) => {
    setStep("evaluating");
    try {
      await evaluateMutation.mutateAsync({
        data: {
          candidateName: candidateName.trim(),
          dialogue: finalDialogue,
          sessionUuid: uuid,
        } as Parameters<typeof evaluateMutation.mutateAsync>[0]["data"],
      });
      setStep("completed");
    } catch {
      toast({ title: "Ошибка", description: "Ошибка при оценке результатов", variant: "destructive" });
      setStep("intro");
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  if (step === "loading") {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (step === "not_found") {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-3 max-w-sm">
            <h2 className="text-2xl font-bold">Сессия не найдена</h2>
            <p className="text-muted-foreground">Проверьте ссылку или обратитесь к HR-специалисту.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (step === "already_done") {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-3 max-w-sm">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Интервью завершено</h2>
            <p className="text-muted-foreground">Это интервью уже было пройдено.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (step === "completed") {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-4 max-w-sm animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Спасибо, интервью завершено</h2>
            <p className="text-muted-foreground">
              Ваши ответы записаны. Результаты будут переданы HR-специалисту.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-4 md:p-8">
        {step !== "name_entry" && (
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-semibold">{candidateName}</h1>
            <div className="text-sm font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
              {phaseIndex + 1} / {maxPhases}
            </div>
          </div>
        )}

        <Card className="flex-1 flex flex-col justify-center border-border/50 shadow-sm relative overflow-hidden">
          {step !== "name_entry" && (
            <div className="absolute top-0 left-0 w-full h-1 bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${((phaseIndex + (step === "evaluating" ? 1 : 0)) / maxPhases) * 100}%` }}
              />
            </div>
          )}

          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center space-y-8">

            {step === "name_entry" && (
              <div className="space-y-6 w-full max-w-sm animate-in fade-in zoom-in duration-500">
                <h2 className="text-2xl font-bold">Добро пожаловать</h2>
                <p className="text-muted-foreground">Введите ваше ФИО, чтобы начать интервью.</p>
                <div className="space-y-2 text-left">
                  <Label htmlFor="name">ФИО</Label>
                  <Input
                    id="name"
                    placeholder="Иванов Иван Иванович"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                    className="h-12"
                  />
                  {nameError && <p className="text-sm text-destructive">{nameError}</p>}
                </div>
                <Button onClick={handleNameSubmit} size="lg" className="w-full font-semibold">
                  Продолжить
                </Button>
              </div>
            )}

            {step === "intro" && (
              <div className="space-y-6 max-w-xl animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold">Инструкция</h2>
                <p className="text-lg text-muted-foreground">
                  Вы — оператор контактного центра. Сейчас вы услышите реплики клиента. Ваша задача — внимательно выслушать и ответить в микрофон.
                </p>
                <Button onClick={handleStartPhase} size="lg" className="px-8 font-semibold">
                  Понятно, начать
                </Button>
              </div>
            )}

            {step === "playing" && (
              <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse">
                  <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold">Слушайте клиента...</h2>
              </div>
            )}

            {step === "recording" && (
              <div className="space-y-6 w-full animate-in fade-in zoom-in duration-500">
                {silenceError && (
                  <div className="bg-destructive/10 text-destructive p-4 rounded-lg max-w-lg mx-auto text-sm font-medium">
                    {SILENCE_ERROR}
                  </div>
                )}
                <h2 className="text-2xl font-semibold">Ваш ответ</h2>
                <Button
                  onClick={handleRecordToggle}
                  variant={isRecording ? "destructive" : "default"}
                  size="lg"
                  className="h-16 px-8 text-lg font-semibold rounded-full shadow-md transition-all hover:scale-105"
                >
                  {isRecording ? "⏹ Завершить запись" : "🎙 Начать запись"}
                </Button>
                {isRecording && (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-medium text-destructive">Идёт запись...</span>
                  </div>
                )}
              </div>
            )}

            {(step === "transcribing" || step === "evaluating") && (
              <div className="space-y-6 animate-in fade-in zoom-in duration-500 flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <h2 className="text-xl font-medium">
                  {step === "transcribing" ? "Распознавание речи..." : "Анализ диалога..."}
                </h2>
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
