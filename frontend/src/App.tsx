import { useState, useMemo } from "react";
import HRDashboard from "./pages/HRDashboard";
import StartPage from "./pages/StartPage";
import PreparationPage from "./pages/PreparationPage";
import InterviewPage from "./pages/InterviewPage";
import CandidateThanks from "./pages/CandidateThanks";
import type { Evaluation } from "./api";

type CandidateScreen = "start" | "preparation" | "interview" | "thanks";

export interface CandidateInfo {
  id: number;
  name: string;
  selected_criteria: string[];
}

export default function App() {
  const sessionId = useMemo(
    () => new URLSearchParams(window.location.search).get("id"),
    []
  );

  const [screen, setScreen] = useState<CandidateScreen>("start");
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);

  // No session ID → show HR dashboard
  if (!sessionId) {
    return <HRDashboard />;
  }

  function handleRegistered(info: CandidateInfo) {
    setCandidate(info);
    setScreen("preparation");
  }

  function handleFinish(_evaluation: Evaluation, _transcript: string) {
    setScreen("thanks");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {screen === "start" && (
        <StartPage onRegistered={handleRegistered} sessionId={sessionId} />
      )}
      {screen === "preparation" && (
        <PreparationPage onReady={() => setScreen("interview")} />
      )}
      {screen === "interview" && candidate && (
        <InterviewPage candidate={candidate} onFinish={handleFinish} />
      )}
      {screen === "thanks" && (
        <CandidateThanks name={candidate?.name ?? ""} />
      )}
    </div>
  );
}
