import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useTranscribeAudio, useEvaluateAssessment } from "@workspace/api-client-react";
import type { DialogTurn } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Step = "intro" | "playing" | "recording" | "transcribing" | "evaluating";

export default function AssessmentPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const candidateName = params.get("name") || "Кандидат";

  const [step, setStep] = useState<Step>("intro");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [dialogue, setDialogue] = useState<DialogTurn[]>([]);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const transcribeMutation = useTranscribeAudio();
  const evaluateMutation = useEvaluateAssessment();
  const { toast } = useToast();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const maxPhases = 2; // 0 and 1

  const playAudioForPhase = (index: number) => {
    setStep("playing");
    setRetryMessage(null);
    const audioUrl = `/api/assessment/audio/${index}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setStep("recording");
    };

    audio.play().catch(err => {
      console.error("Audio playback error:", err);
      toast({ title: "Ошибка", description: "Не удалось воспроизвести аудио", variant: "destructive" });
      setStep("recording"); // fallback to allow recording anyway
    });
  };

  const handleStartPhase = () => {
    playAudioForPhase(phaseIndex);
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      try {
        const audioBlob = await stopRecording();
        handleTranscription(audioBlob);
      } catch (err) {
        console.error("Stop recording error", err);
      }
    } else {
      try {
        await startRecording();
      } catch (err) {
        toast({ title: "Ошибка", description: "Нет доступа к микрофону", variant: "destructive" });
      }
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    setStep("transcribing");
    try {
      const result = await transcribeMutation.mutateAsync({
        data: { audio: audioBlob }
      });

      if (result.isEmpty) {
        setRetryMessage("К сожалению, Вас не слышно, пожалуйста, повторите ответ. Мы будем рады Вас послушать!");
        setStep("recording");
      } else {
        const turn: DialogTurn = { role: "candidate", text: result.text };
        const newDialogue = [...dialogue, turn];
        setDialogue(newDialogue);

        if (phaseIndex + 1 < maxPhases) {
          setPhaseIndex(phaseIndex + 1);
          playAudioForPhase(phaseIndex + 1);
        } else {
          handleEvaluation(newDialogue);
        }
      }
    } catch (err) {
      toast({ title: "Ошибка", description: "Ошибка при распознавании речи", variant: "destructive" });
      setStep("recording");
    }
  };

  const handleEvaluation = async (finalDialogue: DialogTurn[]) => {
    setStep("evaluating");
    try {
      const result = await evaluateMutation.mutateAsync({
        data: {
          candidateName,
          dialogue: finalDialogue
        }
      });
      setLocation(`/result/${result.id}`);
    } catch (err) {
      toast({ title: "Ошибка", description: "Ошибка при оценке результатов", variant: "destructive" });
      setStep("intro"); // or some error state
    }
  };

  // Cleanup audio
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">{candidateName}</h1>
          <div className="text-sm font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
            {phaseIndex + 1} / {maxPhases}
          </div>
        </div>

        <Card className="flex-1 flex flex-col justify-center border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-in-out" 
              style={{ width: `${((phaseIndex + (step === "evaluating" ? 1 : 0)) / maxPhases) * 100}%` }}
            />
          </div>
          
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center space-y-8">
            {step === "intro" && (
              <div className="space-y-6 max-w-xl animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold">Инструкция</h2>
                <p className="text-lg text-muted-foreground">
                  Вы — оператор контактного центра. Сейчас вы услышите реплики клиента. Ваша задача — внимательно выслушать и ответить в микрофон.
                </p>
                <Button onClick={handleStartPhase} size="lg" className="px-8 mt-4 font-semibold">
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
                {retryMessage && (
                  <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6 max-w-lg mx-auto font-medium">
                    {retryMessage}
                  </div>
                )}
                
                <h2 className="text-2xl font-semibold mb-8">Ваш ответ</h2>
                
                <Button 
                  onClick={handleRecordToggle} 
                  variant={isRecording ? "destructive" : "default"}
                  size="lg" 
                  className="h-16 px-8 text-lg font-semibold rounded-full shadow-md transition-all hover:scale-105"
                >
                  {isRecording ? "⏹ Завершить запись" : "🎙 Начать запись"}
                </Button>
                
                {isRecording && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-medium text-destructive">Идет запись...</span>
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
