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
}

export interface TranscribeResponse {
  text: string;
  hallucination: boolean;
}

export interface Markers {
  filler_words_count: number;
  filler_words_examples: string[];
  rudeness_count: number;
  rudeness_examples: string[];
  politeness_count: number;
  politeness_examples: string[];
  coherence_score: number;
  coherence_issues: string[];
}

export interface Evaluation {
  verdict: "Рекомендуется" | "Не рекомендуется";
  markers: Markers;
  quotes: string[];
  comment: string;
  selected_criteria: string[];
}

export interface EvaluateResponse {
  candidate_id: number;
  evaluation: Evaluation;
}

export interface DialogTurn {
  role: string;
  text: string;
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
  form.append("audio", blob, "recording.webm");
  const res = await fetch(`${BASE}/transcribe`, { method: "POST", body: form });
  return handleResponse<TranscribeResponse>(res);
}

export async function evaluateCandidate(
  candidate_id: number,
  dialog: DialogTurn[],
  selected_criteria: string[]
): Promise<EvaluateResponse> {
  const res = await fetch(`${BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id, dialog, selected_criteria }),
  });
  return handleResponse<EvaluateResponse>(res);
}

export async function createSession(selected_criteria: string[]): Promise<SessionResponse> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_criteria }),
  });
  return handleResponse<SessionResponse>(res);
}

export interface SessionDetail {
  session_id: string;
  status: string;
  selected_criteria: string[];
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
  audio_urls: string[];
}

export async function getResults(candidateId: number): Promise<CandidateResult> {
  const res = await fetch(`${BASE}/results/${candidateId}`);
  return handleResponse<CandidateResult>(res);
}

export async function uploadRecording(candidateId: number, blobs: Blob[]): Promise<void> {
  const form = new FormData();
  blobs.forEach((blob, i) => {
    form.append("audio", blob, `recording_${i}.webm`);
  });
  await fetch(`${BASE}/candidates/${candidateId}/recording`, { method: "POST", body: form });
}
