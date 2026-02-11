// ai_team/src/runtime/orchestrator.ts
import { TaskInput, TaskInputSchema, Workspace } from "./types.js";
import { createWorkspace, addAgentOutput, setReport, setValidator } from "./workspace.js";

import { xoA_plan, xoA_revision } from "./agents/xoA.js";
import { xoB_critique, xoB_confirm } from "./agents/xoB.js";
import { wild_reframe } from "./agents/wild.js";
import { gemini_reframe } from "./agents/gemini.js";

import { buildConsensus } from "./consensus.js";
import { Validator } from "./validator/index.js";
import { awaitHumanCommit, type CommitProposal } from "./commit.js";

// ✅ NEW: incremental persistence so SSE can stream live deliberation
import { saveTrace } from "../server/runStore.js";

function extractProposal(ws: Workspace, maxSteps = 5): CommitProposal {
  // Prefer XO-A REVISION output
  const xoARev =
    [...ws.outputs].reverse().find((o: any) => o.agent === "XO-A" && o.type === "REVISION") ??
    [...ws.outputs].reverse().find((o: any) => o.agent === "XO-A" && (o.type === "PLAN" || o.type === "REVISION"));

  const note =
    xoARev?.artifacts?.find((a: any) => a.kind === "note")?.content ??
    "No XO-A note artifact produced.";

  const steps: string[] = (xoARev?.steps ?? [])
    .slice(0, maxSteps)
    .map((s: any, idx: number) => `${idx + 1}. ${String(s.action ?? "").trim()}`.trim())
    .filter(Boolean);

  return {
    summary: String(note).trim(),
    stepsPreview: steps.length ? steps : ["(no steps produced)"],
  };
}

export class Orchestrator {
  constructor(private readonly validator: Validator) {}

  async run(taskInput: unknown): Promise<Workspace> {
    const task: TaskInput = TaskInputSchema.parse(taskInput);
    const ws = createWorkspace(task);

    const runId = task.taskId;

    // ✅ NEW: save an incremental snapshot so SSE can update UI in real time
    const emit = (status: "running" | "done" | "failed", extra?: Record<string, unknown>) => {
      // Keep snapshot shape consistent with what your UI expects.
      const snapshot: any = {
        runId,
        task,
        outputs: ws.outputs,
        trace: ws.trace,
        validator: (ws as any).validator ?? undefined,
        report: (ws as any).report ?? undefined,
        status,
        createdAt: (ws as any).createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(extra ?? {}),
      };

      // Best-effort; never break the run if logging fails.
      try {
        saveTrace(runId, snapshot);
      } catch {
        // ignore
      }
    };

    emit("running", { stage: "start" });

    // 1) XO-A plan
    const xoA = await xoA_plan(task);
    addAgentOutput(ws, xoA);
    emit("running", { stage: "xoA_plan" });

    // 2) XO-B critique
    const xoB = await xoB_critique(xoA);
    addAgentOutput(ws, xoB);
    emit("running", { stage: "xoB_critique" });

    // 3) Wild reframe (OpenAI lane stays intact)
    const w = await wild_reframe(task);
    addAgentOutput(ws, w);
    emit("running", { stage: "wild_reframe" });

    // 4) Gemini reframe (parallel lane)
    const g = await gemini_reframe(task);
    addAgentOutput(ws, g);
    emit("running", { stage: "gemini_reframe" });

    // 5) XO-A revision
    const revisionNote = `Integrated XO-B critique plus WILD + GEMINI reframes into a bounded, deterministic plan.`;
    const xoA2 = await xoA_revision(task, ws.outputs, revisionNote);
    addAgentOutput(ws, xoA2);
    emit("running", { stage: "xoA_revision" });

    // 6) Validator
    const vr = await this.validator.validate(ws.outputs);
    setValidator(ws, vr);
    emit("running", { stage: "validator" });

    // 7) XO-B confirm
    const xoB2 = await xoB_confirm(vr.status === "PASS");
    addAgentOutput(ws, xoB2);
    emit("running", { stage: "xoB_confirm" });

    // 8) Consensus report
    const report = buildConsensus(ws);
    setReport(ws, report);

    // Push snapshot BEFORE commit gate so UI can show the full report + proposal live
    const proposal = extractProposal(ws, 5);
    emit("running", { stage: "ready_for_commit", proposal });

    // 9) Human commit gate
    const decision = await awaitHumanCommit(report, proposal);
    ws.trace["humanDecision"] = decision;

    // Final snapshot (server will still write its own final done trace after this returns)
    emit("done", { stage: "done" });

    return ws;
  }
}
