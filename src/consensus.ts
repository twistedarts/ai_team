import {
  AgentOutput,
  ClaimRisk,
  ConsensusReport,
  ValidationStatus,
  Workspace
} from "./types.js";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function severityScore(risk: ClaimRisk): number {
  switch (risk) {
    case "high":
      return 0.25;
    case "med":
      return 0.1;
    default:
      return 0.0;
  }
}

export function buildConsensus(ws: Workspace): ConsensusReport {
  const taskId = ws.task.taskId;

  const validatorStatus: ValidationStatus = ws.validator?.status ?? "FAIL";

  // XO-B critique defines objections (best effort)
  const xoB = ws.outputs.find((o) => o.agent === "XO-B");
  const dissent: { agent: any; issue: string; severity: ClaimRisk }[] = [];

  if (xoB) {
    for (const c of xoB.claims) {
      // Treat critique claims as issues
      dissent.push({
        agent: "XO-B",
        issue: c.text,
        severity: c.risk
      });
    }
  }

  if (validatorStatus === "FAIL") {
    return {
      taskId,
      status: "NEEDS_REVISION",
      consensus: {
        decision: "REVISE",
        confidence: 0.0,
        reasons: ["Validator failed. Cannot proceed."]
      },
      dissent,
      validation: { status: "FAIL", summary: ws.validator?.checks?.map((c) => 
`${c.name}:${c.status}`).join(", ") ?? "no validator result" },
      nextActions: [
        { label: "Revise plan", requiresCommit: false },
        { label: "Re-run validation", requiresCommit: false }
      ]
    };
  }

  // PASS is necessary but not sufficient: high-sev dissent blocks "proceed"
  const unresolvedHigh = dissent.some((d) => d.severity === "high");

  let confidence = 0.6; // base after PASS
  for (const d of dissent) confidence -= severityScore(d.severity);
  confidence = clamp01(confidence);

  if (unresolvedHigh) {
    return {
      taskId,
      status: "NEEDS_REVISION",
      consensus: {
        decision: "REVISE",
        confidence,
        reasons: ["Validator passed, but high-severity objections remain."]
      },
      dissent,
      validation: { status: "PASS", summary: ws.validator?.checks?.map((c) => 
`${c.name}:${c.status}`).join(", ") ?? "pass" },
      nextActions: [
        { label: "Revise plan", requiresCommit: false },
        { label: "Proceed anyway (not recommended)", requiresCommit: true }
      ]
    };
  }

  return {
    taskId,
    status: "READY_FOR_COMMIT",
    consensus: {
      decision: "PROCEED",
      confidence,
      reasons: ["Validator passed and no high-severity objections remain."]
    },
    dissent,
    validation: { status: "PASS", summary: ws.validator?.checks?.map((c) => 
`${c.name}:${c.status}`).join(", ") ?? "pass" },
    nextActions: [
      { label: "Proceed", requiresCommit: true },
      { label: "Revise anyway", requiresCommit: false }
    ]
  };
}

