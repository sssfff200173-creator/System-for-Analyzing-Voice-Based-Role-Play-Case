import { useState, useMemo } from "react";
import HRDashboard from "./pages/HRDashboard";
import StartPage from "./pages/StartPage";
import PreparationPage from "./pages/PreparationPage";
import BriefingPage from "./pages/BriefingPage";
import InterviewPage from "./pages/InterviewPage";
import CandidateThanks from "./pages/CandidateThanks";
import CandidateDetail from "./pages/CandidateDetail";
import { markInterviewStarted } from "./api";
import type { Evaluation } from "./api";

type CandidateScreen = "start" | "preparation" | "briefing" | "interview" | "thanks";

export interface CandidateInfo {
  id: number;
  name: string;
  selected_criteria: string[];
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const sessionId = params.get("id");
  const sharedCandidateId = params.get("candidate");

  const [screen, setScreen] = useState<CandidateScreen>("start");
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);

  // Shared candidate result link → show only the result page
  if (sharedCandidateId && /^\d+$/.test(sharedCandidateId)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CandidateDetail
          candidateId={Number(sharedCandidateId)}
          onBack={() => {
            window.location.href = "/";
          }}
        />
      </div>
    );
  }

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
        <PreparationPage onReady={() => setScreen("briefing")} />
      )}
      {screen === "briefing" && candidate && (
        <BriefingPage
          onReady={() => {
            markInterviewStarted(candidate.id);
            setScreen("interview");
          }}
        />
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
