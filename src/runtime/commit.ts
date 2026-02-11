// ai_team/src/runtime/commit.ts
import { ConsensusReport } from "./types.js";

export type HumanDecision = "approve" | "reject" | "redirect";

export type HumanDecisionPayload = {
  decision: HumanDecision;
  redirectObjective?: string;
};

export type CommitProposal = {
  summary: string;        // human readable
  stepsPreview: string[]; // first N steps (strings)
};

type Pending = {
  report: ConsensusReport;
  proposal?: CommitProposal;
  createdAt: string;
  resolve: (d: HumanDecisionPayload) => void;
};

const pending = new Map<string, Pending>();

export function awaitHumanCommit(
  report: ConsensusReport,
  proposal?: CommitProposal
): Promise<HumanDecisionPayload> {
  const runId = report.taskId;
  return new Promise<HumanDecisionPayload>((resolve) => {
    pending.set(runId, {
      report,
      proposal,
      createdAt: new Date().toISOString(),
      resolve,
    });
  });
}

export function getPendingCommit(runId: string): Pending | undefined {
  return pending.get(runId);
}

export function resolveHumanCommit(
  runId: string,
  decision: HumanDecision,
  redirectObjective?: string
): boolean {
  const p = pending.get(runId);
  if (!p) return false;

  pending.delete(runId);
  p.resolve({
    decision,
    redirectObjective: decision === "redirect" ? redirectObjective : undefined,
  });
  return true;
}
