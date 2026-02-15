// ai_team/src/runtime/orchestrator.ts
import type { TaskInput, Workspace, LaneConfig, LaneId, LaneRole, ModelSpec } from "./types.js";
import { TaskInputSchema } from "./types.js";
import { createWorkspace, addAgentOutput, setReport, setValidator } from "./workspace.js";

import { AI1_plan, AI1_revision } from "./agents/AI1.js";
import { AI2_critique, AI2_confirm } from "./agents/AI2.js";
import { AI3_reframe } from "./agents/AI3.js";
import { AI4_reframe } from "./agents/AI4.js";

import { buildConsensus } from "./consensus.js";
import { Validator } from "./validator/index.js";
import { awaitHumanCommit, type CommitProposal } from "./commit.js";

// incremental persistence so SSE can stream live deliberation
import { saveTrace } from "../server/runStore.js";

function laneOrder(id: LaneId): number {
  switch (id) {
    case "AI1":
      return 1;
    case "AI2":
      return 2;
    case "AI3":
      return 3;
    case "AI4":
      return 4;
  }
}

function normalizeLanes(task: TaskInput): LaneConfig[] {
  const raw = (task.inputs as any)?.runtime?.lanes;
  const lanes: LaneConfig[] = Array.isArray(raw) ? raw : [];

  // Default to the four lanes disabled if nothing provided (but do not auto-select models).
  // The server/UI should normally supply lanes explicitly.
  const byId = new Map<LaneId, LaneConfig>();
  for (const l of lanes) {
    if (!l || !l.id) continue;
    byId.set(l.id, l);
  }

  const ids: LaneId[] = ["AI1", "AI2", "AI3", "AI4"];
  const filled: LaneConfig[] = ids.map((id) => {
    const existing = byId.get(id);
    if (existing) return existing;

    // minimal placeholder (disabled); prevents crashes if UI sends partial lanes
    return {
      id,
      enabled: false,
      role: "REFRAME",
      spec: { provider: "openai", model: "" }, // model empty => must be rejected by server for enabled lanes
    };
  });

  return filled.sort((a, b) => laneOrder(a.id) - laneOrder(b.id));
}

function mustSpec(lane: LaneConfig): ModelSpec {
  const spec = lane.spec;
  if (!spec || !spec.provider || !spec.model || !String(spec.model).trim()) {
    throw new Error(`Lane ${lane.id} is enabled but has no valid provider/model selection.`);
  }
  return spec;
}

function extractProposal(ws: Workspace, maxSteps = 5): CommitProposal {
  const revOrPlan =
    [...ws.outputs].reverse().find((o: any) => o.agent === "AI1" && o.type === "REVISION") ??
    [...ws.outputs].reverse().find((o: any) => o.agent === "AI1" && (o.type === "PLAN" || o.type === "REVISION"));

  const note =
    revOrPlan?.artifacts?.find((a: any) => a.kind === "note")?.content ??
    "No top-level note artifact produced.";

  const steps: string[] = (revOrPlan?.steps ?? [])
    .slice(0, maxSteps)
    .map((s: any, idx: number) => `${idx + 1}. ${String(s.action ?? "").trim()}`.trim())
    .filter(Boolean);

  return {
    summary: String(note).trim(),
    stepsPreview: steps.length ? steps : ["(no steps produced)"],
  };
}

type StageStatus = "running" | "done" | "failed";

export class Orchestrator {
  constructor(private readonly validator: Validator) {}

  async run(taskInput: unknown): Promise<Workspace> {
    const task: TaskInput = TaskInputSchema.parse(taskInput);
    const ws = createWorkspace(task);

    const runId = task.taskId;

    const emit = (status: StageStatus, extra?: Record<string, unknown>) => {
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

      try {
        saveTrace(runId, snapshot);
      } catch {
        // ignore
      }
    };

    emit("running", { stage: "start" });

    const lanes = normalizeLanes(task);

    // Fixed-order execution, but lane role is runtime-selected.
    // If a lane is enabled, it must have provider+model spec.
    for (const lane of lanes) {
      if (!lane.enabled) continue;

      const spec = mustSpec(lane);
      const stagePrefix = `${lane.id}_${lane.role}`; // e.g. AI1_PLAN

      // Deterministic role routing:
      switch (lane.role as LaneRole) {
        case "PLAN": {
          if (lane.id !== "AI1") {
            // keep behavior predictable: only AI1 produces PLAN artifacts
            throw new Error(`Role PLAN is only supported on AI1. Received ${lane.id}.`);
          }
          const out = await AI1_plan(task, spec);
          addAgentOutput(ws, out);
          emit("running", { stage: stagePrefix });
          break;
        }

        case "CRITIQUE": {
          if (lane.id !== "AI2") {
            throw new Error(`Role CRITIQUE is only supported on AI2. Received ${lane.id}.`);
          }
          const latestPlan =
            [...ws.outputs].reverse().find((o: any) => o.agent === "AI1" && (o.type === "PLAN" || o.type === "REVISION")) ??
            null;
          if (!latestPlan) throw new Error("CRITIQUE requires a prior AI1 output.");
          const out = await AI2_critique(latestPlan, spec);
          addAgentOutput(ws, out);
          emit("running", { stage: stagePrefix });
          break;
        }

        case "REFRAME": {
          // Any lane can do REF RAME; we map lanes to their implementation files for now.
          // (Later you can collapse these into a single reframe agent if you want.)
          if (lane.id === "AI3") {
            const out = await AI3_reframe(task, spec);
            addAgentOutput(ws, out);
            emit("running", { stage: stagePrefix });
          } else if (lane.id === "AI4") {
            const out = await AI4_reframe(task, spec);
            addAgentOutput(ws, out);
            emit("running", { stage: stagePrefix });
          } else {
            throw new Error(`REFRAME is supported on AI3/AI4 only. Received ${lane.id}.`);
          }
          break;
        }

        case "REVISION": {
          if (lane.id !== "AI1") {
            throw new Error(`Role REVISION is only supported on AI1. Received ${lane.id}.`);
          }
          const revisionNote = "Integrated critique and reframes into a bounded, deterministic plan.";
          const out = await AI1_revision(task, ws.outputs, revisionNote, spec);
          addAgentOutput(ws, out);
          emit("running", { stage: stagePrefix });
          break;
        }

        case "CONFIRM": {
          if (lane.id !== "AI2") {
            throw new Error(`Role CONFIRM is only supported on AI2. Received ${lane.id}.`);
          }
          // confirm is based on validator pass; we will run validator later. Here: skip until post-validation.
          // (If you prefer, disable CONFIRM in UI and always run it post-validator.)
          break;
        }

        default:
          throw new Error(`Unknown lane role: ${(lane as any).role}`);
      }
    }

    // Validator
    const vr = await this.validator.validate(ws.outputs);
    setValidator(ws, vr);
    emit("running", { stage: "validator" });

    // Optional confirm step (AI2) — run only if AI2 lane exists and is enabled (regardless of role UI picked).
    // This keeps behavior stable and avoids role confusion during migration.
    const ai2 = lanes.find((l) => l.id === "AI2" && l.enabled);
    if (ai2) {
      const spec = mustSpec(ai2);
      const out = await AI2_confirm(vr.status === "PASS", spec);
      addAgentOutput(ws, out);
      emit("running", { stage: "AI2_CONFIRM" });
    }

    // Consensus report
    const report = buildConsensus(ws);
    setReport(ws, report);

    const proposal = extractProposal(ws, 5);
    emit("running", { stage: "ready_for_commit", proposal });

    // Human commit gate
    const decision = await awaitHumanCommit(report, proposal);
    ws.trace["humanDecision"] = decision;

    emit("done", { stage: "done" });

    return ws;
  }
}
