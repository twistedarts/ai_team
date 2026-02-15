// ai_team/src/runtime/commit.ts
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
 * Called by Orchestrator when the run reaches the commit gate.
 * Registers a pending commit immediately, then blocks until a human decision arrives.
 */
export async function awaitHumanCommit(
  report: ConsensusReport,
  proposal: CommitProposal
): Promise<{ decision: Decision; redirectObjective?: string }> {
  const runId = String(report.taskId);

  // Register pending gate immediately (so UI can render)
  const createdAt = nowIso();
  pendingByRunId.set(runId, { runId, createdAt, report, proposal });

  // If we already have a waiter, don't create duplicates
  if (waiterByRunId.has(runId)) {
    // This should not happen in a clean run, but keep it safe.
    // Replace pending, keep existing waiter.
    return new Promise((resolve) => {
      const w = waiterByRunId.get(runId)!;
      const originalResolve = w.resolve;
      w.resolve = (d) => {
        originalResolve(d);
        resolve(d);
      };
    });
  }

  return new Promise((resolve) => {
    waiterByRunId.set(runId, { resolve, createdAt });
  });
}

/**
 * Server polls this to decide whether to show the commit gate UI.
 */
export function getPendingCommit(runId: string): PendingCommit | null {
  const key = String(runId);
  return pendingByRunId.get(key) ?? null;
}

/**
 * Called by the API commit endpoint. Returns false if nothing pending.
 */
export function resolveHumanCommit(
  runId: string,
  decision: Decision,
  redirectObjective?: string
): boolean {
  const key = String(runId);
  const w = waiterByRunId.get(key);
  const p = pendingByRunId.get(key);

  if (!w || !p) return false;

  // Clear pending before resolving (prevents double-commit)
  waiterByRunId.delete(key);
  pendingByRunId.delete(key);

  w.resolve({
    decision,
    redirectObjective: redirectObjective && redirectObjective.trim() ? redirectObjective.trim() : undefined,
  });

  return true;
}
