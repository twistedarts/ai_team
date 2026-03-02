
import type { ConsensusReport } from "./types.js";

export type Decision = "approve" | "reject" | "redirect";
export type HumanDecision = Decision;

export type CommitProposal = {
  summary: string;
  stepsPreview: string[];
};

export type PendingCommit = {
  runId: string;
  createdAt: string;
  report: ConsensusReport;
  proposal: CommitProposal;
};

type Waiter = {
  resolve: (d: { decision: Decision; redirectObjective?: string }) => void;
  createdAt: string;
};

const pendingByRunId = new Map<string, PendingCommit>();
const waiterByRunId = new Map<string, Waiter>();

function nowIso() {
  return new Date().toISOString();
}

/**
 * Commit gate registration MUST be keyed by the actual runId (task.taskId),
 * not by report.taskId (which can drift / be unset depending on consensus builder).
 */
export async function awaitHumanCommit(
  runId: string,
  report: ConsensusReport,
  proposal: CommitProposal
): Promise<{ decision: Decision; redirectObjective?: string }> {
  const key = String(runId);
  if (!key || key === "undefined" || key === "null") {
    throw new Error(`Commit gate requires a valid runId. Got: ${String(runId)}`);
  }

  const createdAt = nowIso();
  pendingByRunId.set(key, { runId: key, createdAt, report, proposal });

  // One waiter per runId
  if (waiterByRunId.has(key)) {
    return new Promise((resolve) => {
      const w = waiterByRunId.get(key)!;
      const prev = w.resolve;
      w.resolve = (d) => {
        prev(d);
        resolve(d);
      };
    });
  }

  return new Promise((resolve) => {
    waiterByRunId.set(key, { resolve, createdAt });
  });
}

export function getPendingCommit(runId: string): PendingCommit | null {
  const key = String(runId);
  return pendingByRunId.get(key) ?? null;
}

export function resolveHumanCommit(
  runId: string,
  decision: Decision,
  redirectObjective?: string
): boolean {
  const key = String(runId);
  const w = waiterByRunId.get(key);
  const p = pendingByRunId.get(key);

  if (!w || !p) return false;

  waiterByRunId.delete(key);
  pendingByRunId.delete(key);

  w.resolve({
    decision,
    redirectObjective: redirectObjective && redirectObjective.trim() ? redirectObjective.trim() : undefined,
  });

  return true;
}
