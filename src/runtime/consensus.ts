
import type { Workspace, AgentOutput, ConsensusReport, RuntimeStatus, ValidationStatus } from "./types.js";

function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return arr[i];
  }
  return undefined;
}

function pickNote(out?: AgentOutput): string {
  const note = out?.artifacts?.find((a: any) => a?.kind === "note")?.content;
  return typeof note === "string" ? note.trim() : "";
}

export function buildConsensus(ws: Workspace): ConsensusReport {
  const outputs = ws.outputs ?? [];

  const ai1Rev = findLast(outputs, (o) => o.agent === "AI1" && o.type === "REVISION");
  const ai1Plan = findLast(outputs, (o) => o.agent === "AI1" && o.type === "PLAN");

  const ai2Crit = findLast(outputs, (o) => o.agent === "AI2" && o.type === "CRITIQUE");
  const ai3Ref = findLast(outputs, (o) => o.agent === "AI3" && o.type === "REFRAME");
  const ai4Ref = findLast(outputs, (o) => o.agent === "AI4" && o.type === "REFRAME");

  const primary = ai1Rev ?? ai1Plan;
  const primaryNote = pickNote(primary);

  const ai3Note = pickNote(ai3Ref);
  const ai4Note = pickNote(ai4Ref);

  // Proposed output assembly:
  // - Prefer AI1 note as top-level.
  // - Always include steps (from AI1 revision/plan) so they never drop.
  // - Include other lane notes as optional context (not authoritative).
  const parts: string[] = [];
  parts.push(primaryNote || "No primary note produced.");

  const steps: string[] = (primary?.steps ?? [])
    .map((s: any) => String(s?.action ?? "").trim())
    .filter(Boolean);

  if (steps.length) {
    parts.push(`\n\nSteps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  if (ai3Note) parts.push(`\n\nNotes (AI3):\n${ai3Note}`);
  if (ai4Note) parts.push(`\n\nNotes (AI4):\n${ai4Note}`);

  // Pull validator result from workspace
  const vr: any = (ws as any).validator;
  const vStatus: ValidationStatus = vr?.status === "PASS" ? "PASS" : "FAIL";
  const validationSummary =
    vStatus === "PASS" ? "Validator PASS." : "Validator FAIL.";

  const status: RuntimeStatus = vStatus === "PASS" ? "READY_FOR_COMMIT" : "NEEDS_REVISION";

  // Dissent from AI2 critique claims (best-effort)
  const dissent: ConsensusReport["dissent"] = [];
  if (ai2Crit?.claims?.length) {
    for (const c of ai2Crit.claims) {
      dissent.push({
        agent: "AI2",
        issue: String((c as any)?.text ?? ""),
        severity: (c as any)?.risk ?? "med",
      });
    }
  }

  const decision: ConsensusReport["consensus"]["decision"] = vStatus === "PASS" ? "PROCEED" : "REVISE";

  return {
    taskId: ws.id,
    proposedOutput: parts.join(""),
    status,
    consensus: {
      decision,
      confidence: vStatus === "PASS" ? 0.75 : 0.4,
      reasons: [validationSummary],
    },
    dissent,
    validation: { status: vStatus, summary: validationSummary },
    nextActions: [
      { label: vStatus === "PASS" ? "Commit" : "Revise", requiresCommit: vStatus === "PASS" },
    ],
  };
}

