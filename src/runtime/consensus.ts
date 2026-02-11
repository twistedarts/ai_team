// ai_team/src/runtime/consensus.ts
import {
  AgentOutput,
  ClaimRisk,
  ConsensusReport,
  ValidationStatus,
  Workspace,
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

function pickNote(o: AgentOutput): string {
  const note = o.artifacts.find((a) => a.kind === "note")?.content ?? "";
  return String(note).trim();
}

function fmtSteps(steps: AgentOutput["steps"]): string {
  const s = Array.isArray(steps) ? steps : [];
  if (!s.length) return "";
  return (
    "\n\nSteps:\n" +
    s
      .map((x, i) => {
        const action = String((x as any)?.action ?? "").trim();
        return action ? `${i + 1}. ${action}` : `${i + 1}. (empty step)`;
      })
      .join("\n")
  );
}

function findLast(outputs: AgentOutput[], pred: (o: AgentOutput) => boolean): AgentOutput | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i];
    if (pred(o)) return o;
  }
  return null;
}

function pickProposedOutput(outputs: AgentOutput[]): string {
  const xoRev = findLast(outputs, (o) => o.agent === "XO-A" && o.type === "REVISION");
  const xoPlan = findLast(outputs, (o) => o.agent === "XO-A" && o.type === "PLAN");
  const gemini = findLast(outputs, (o) => o.agent === "GEMINI" && (o.type === "REFRAME" || o.type === "PLAN" || o.type === "REVISION"));
  const wild = findLast(outputs, (o) => o.agent === "WILD");

  const bestXO = xoRev ?? xoPlan;
  const xoNote = bestXO ? pickNote(bestXO) : "";
  const xoSteps = bestXO ? fmtSteps(bestXO.steps) : "";

  const geminiNote = gemini ? pickNote(gemini) : "";
  const wildNote = wild ? pickNote(wild) : "";

  // Build a single human-readable proposed output:
  // - Prefer XO-A note as the top-level.
  // - If Gemini has a strong "answer" but XO-A note doesn't reflect it, include it under Answer.
  // - Always include steps (from XO-A revision/plan) so they never “drop”.
  const parts: string[] = [];

  if (xoNote) parts.push(xoNote);

  // Include Gemini if present and not already mirrored
  if (geminiNote) {
    const xoLower = xoNote.toLowerCase();
    const gLower = geminiNote.toLowerCase();
    const seemsMissing =
      !xoLower ||
      (gLower.length >= 120 && !xoLower.includes(gLower.slice(0, 40).toLowerCase()));

    if (seemsMissing) {
      parts.push(`\n\nAnswer (Gemini):\n${geminiNote}`);
    }
  }

  if (xoSteps) parts.push(xoSteps);

  // Optional: keep Wild as a short footnote only
  if (wildNote) {
    parts.push(`\n\nNotes (Wild):\n${wildNote}`);
  }

  return parts.join("").trim();
}

export function buildConsensus(ws: Workspace): ConsensusReport {
  const taskId = ws.task.taskId;

  const proposedOutput = pickProposedOutput(ws.outputs);

  const validatorStatus: ValidationStatus = ws.validator?.status ?? "FAIL";

  const xoB = ws.outputs.find((o) => o.agent === "XO-B");
  const dissent: { agent: any; issue: string; severity: ClaimRisk }[] = [];

  if (xoB) {
    for (const c of xoB.claims) {
      dissent.push({
        agent: "XO-B",
        issue: c.text,
        severity: c.risk,
      });
    }
  }

  const summary =
    ws.validator?.checks?.map((c) => `${c.name}:${c.status}`).join(", ") ??
    "no validator result";

  if (validatorStatus === "FAIL") {
    return {
      taskId,
      proposedOutput,
      status: "NEEDS_REVISION",
      consensus: {
        decision: "REVISE",
        confidence: 0.0,
        reasons: ["Validator failed. Cannot proceed."],
      },
      dissent,
      validation: { status: "FAIL", summary },
      nextActions: [
        { label: "Revise plan", requiresCommit: false },
        { label: "Re-run validation", requiresCommit: false },
      ],
    };
  }

  const unresolvedHigh = dissent.some((d) => d.severity === "high");

  let confidence = 0.6;
  for (const d of dissent) confidence -= severityScore(d.severity);
  confidence = clamp01(confidence);

  if (unresolvedHigh) {
    return {
      taskId,
      proposedOutput,
      status: "NEEDS_REVISION",
      consensus: {
        decision: "REVISE",
        confidence,
        reasons: ["Validator passed, but high-severity objections remain."],
      },
      dissent,
      validation: { status: "PASS", summary },
      nextActions: [
        { label: "Revise plan", requiresCommit: false },
        { label: "Proceed anyway (not recommended)", requiresCommit: true },
      ],
    };
  }

  return {
    taskId,
    proposedOutput,
    status: "READY_FOR_COMMIT",
    consensus: {
      decision: "PROCEED",
      confidence,
      reasons: ["Validator passed and no high-severity objections remain."],
    },
    dissent,
    validation: { status: "PASS", summary },
    nextActions: [
      { label: "Proceed", requiresCommit: true },
      { label: "Revise anyway", requiresCommit: false },
    ],
  };
}
