export interface CandidateData {
  name: string;
  phone: string;
  consent: boolean;
  selected_criteria: string[];
  session_id?: string;
}

export interface CreateCandidateResponse {
  id: number;
  name: string;
  selected_criteria: string[];
  filler_threshold: number;
  selected_cases: string[];
}

export interface TranscribeResponse {
  text: string;
  hallucination: boolean;
}

export interface Markers {
  filler_words_count?: number;
  filler_words_examples?: string[];
  rudeness_count?: number;
  rudeness_examples?: string[];
  politeness_count?: number;
  politeness_examples?: string[];
  coherence_level?: "несвязная" | "есть нюансы" | "связная";
  coherence_issues?: string[];
  coherence_score?: number;
  speech_style?: "деловой" | "нейтральный" | "неформальный";
  style_examples?: string[];
  empathy_level?: "высокий" | "средний" | "низкий";
  empathy_examples?: string[];
  information_correctness?: "корректно" | "частично корректно" | "некорректно";
  correctness_issues?: string[];
}

export type Verdict =
  | "Рекомендуется"
  | "Требуется дополнительная проверка"
  | "Частичное соответствие"
  | "Не рекомендуется";

export interface Evaluation {
  verdict: Verdict;
  markers: Markers;
  scores?: Record<string, number>;
  quotes: string[] | Record<string, string>;
  filler_words_count?: number;
  comment: string;
  selected_criteria: string[];
}

export interface CaseEvaluation extends Evaluation {
  case_key: string;
  case_name: string;
  case_description: string;
  transcript?: string | null;
}

export interface EvaluateResponse {
  candidate_id: number;
  evaluation: Evaluation;
}

export interface EvaluateMultiResponse {
  candidate_id: number;
  evaluations: CaseEvaluation[];
  combined_comment: string;
}

export interface DialogTurn {
  role: string;
  text: string;
}

export interface EvaluateCaseInput {
  case_key: string;
  dialog: DialogTurn[];
}

export interface SessionResponse {
  session_id: string;
}

export interface SessionListItem {
  session_id: string;
  created_at: string | null;
  status: string;
  candidate: {
    id: number;
    name: string;
    phone: string;
    verdict: string | null;
    comment: string | null;
    created_at: string | null;
  } | null;
}

const BASE = "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function createCandidate(data: CandidateData): Promise<CreateCandidateResponse> {
  const res = await fetch(`${BASE}/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<CreateCandidateResponse>(res);
}

export async function transcribeAudio(blob: Blob): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("audio", blob, "recording.wav");
  const res = await fetch(`${BASE}/transcribe`, { method: "POST", body: form });
  return handleResponse<TranscribeResponse>(res);
}

export async function evaluateCandidate(
  candidate_id: number,
  dialog: DialogTurn[],
  selected_criteria: string[],
  filler_threshold: number = 2
): Promise<EvaluateResponse> {
  const res = await fetch(`${BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id, dialog, selected_criteria, filler_threshold }),
  });
  return handleResponse<EvaluateResponse>(res);
}

export async function evaluateMulti(
  candidate_id: number,
  cases: EvaluateCaseInput[],
  selected_criteria: string[],
  filler_threshold: number = 2
): Promise<EvaluateMultiResponse> {
  const res = await fetch(`${BASE}/evaluate-multi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id, cases, selected_criteria, filler_threshold }),
  });
  return handleResponse<EvaluateMultiResponse>(res);
}

export async function createSession(
  selected_criteria: string[],
  filler_threshold: number = 2,
  selected_cases: string[] = ["maria"]
): Promise<SessionResponse> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_criteria, filler_threshold, selected_cases }),
  });
  return handleResponse<SessionResponse>(res);
}

export interface SessionDetail {
  session_id: string;
  status: string;
  selected_criteria: string[];
  filler_threshold: number;
  selected_cases: string[];
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`);
  return handleResponse<SessionDetail>(res);
}

export async function getSessions(): Promise<SessionListItem[]> {
  const res = await fetch(`${BASE}/sessions`);
  return handleResponse<SessionListItem[]>(res);
}

export interface CandidateResult {
  id: number;
  name: string;
  phone: string;
  selected_criteria: string[];
  transcript: string | null;
  evaluation: Evaluation | null;
  evaluations: CaseEvaluation[] | null;
  combined_comment: string | null;
  overall_verdict: string | null;
  filler_words_count: number | null;
  audio_urls: string[];
  interview_started_at: string | null;
  interview_finished_at: string | null;
  interview_duration_sec: number | null;
}

export async function getResults(candidateId: number): Promise<CandidateResult> {
  const res = await fetch(`${BASE}/results/${candidateId}`);
  return handleResponse<CandidateResult>(res);
}

export async function markInterviewStarted(candidateId: number): Promise<void> {
  await fetch(`${BASE}/candidates/${candidateId}/start`, { method: "POST" }).catch(() => {});
}

export async function deleteCandidate(candidateId: number): Promise<void> {
  const res = await fetch(`${BASE}/candidates/${candidateId}`, { method: "DELETE" });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
}

export async function uploadRecording(candidateId: number, blobs: Blob[]): Promise<void> {
  const form = new FormData();
  blobs.forEach((blob, i) => {
    form.append("audio", blob, `recording_${i}.wav`);
  });
  await fetch(`${BASE}/candidates/${candidateId}/recording`, { method: "POST", body: form });
}
