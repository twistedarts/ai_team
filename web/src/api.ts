// ai_team/web/src/api.ts

export type RunStatus = "running" | "done" | "failed" | "unknown";
export type Decision = "approve" | "reject" | "redirect";


export type CommitDecisionResponse =
  | { runId: string; committed: boolean; decision: "approve" | "reject"; reason?: string }
  | { runId: string; committed: boolean; decision: "redirect"; redirectedToRunId?: string; reason?: string };



export type RunIndexItem = {
  runId: string;
  objective?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: RunStatus | string;
};

export type ConsensusReport = {
  taskId: string;
  status: string;
  consensus?: { decision: string; confidence?: number; reasons?: string[] };
  dissent?: { agent: string; issue: string; severity: string }[];
  validation?: { status: string; summary: string };
  nextActions?: { label: string; requiresCommit: boolean }[];
};

export type PendingEnvelope =
  | { runId: string; pending: false; gateStatus: "NO_PENDING"; createdAt?: string }
  | {
      runId: string;
      pending: true;
      gateStatus: "READY_FOR_COMMIT";
      createdAt?: string;
      report: ConsensusReport;
      proposal?: any;
    };

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error ?? `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export const listRuns = () => j<RunIndexItem[]>(`/api/runs`);

export const createRun = (payload: any) =>
  j<any>(`/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export async function getPending(runId: string): Promise<PendingEnvelope> {
  // Backend always returns 200 with pending:false when none.
  return j<PendingEnvelope>(`/api/runs/${encodeURIComponent(runId)}/pending`);
}

export async function loadRunTrace(runId: string): Promise<any | null> {
  try {
    return await j<any>(`/api/runs/${encodeURIComponent(runId)}`);
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function commitDecision(runId: string, decision: Decision, redirectObjective?: string) {
  const body: any = { decision };
  if (decision === "redirect") body.redirectObjective = redirectObjective ?? "";

  return j<any>(`/api/runs/${encodeURIComponent(runId)}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function runEventsUrl(runId: string) {
  return `/api/runs/${encodeURIComponent(runId)}/events`;
}
