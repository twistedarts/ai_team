// ai_team/src/runtime/orchestrator.ts
import {
  TaskInput,
  TaskInputSchema,
  Workspace,
  type ModelSpec,
  type AgentName,
} from "./types.js";

import { createWorkspace, addAgentOutput, setReport, setValidator } from "./workspace.js";

import { AI1_plan, AI1_revision } from "./agents/AI1.js";
import { AI2_critique, AI2_confirm } from "./agents/AI2.js";
import { AI3_reframe } from "./agents/AI3.js";

// AI4 export name has drifted in your repo; do NOT named-import it.
// We’ll resolve the callable at runtime.
import * as AI4 from "./agents/AI4.js";

import { buildConsensus } from "./consensus.js";
import { Validator } from "./validator/index.js";

// commit signature may differ depending on your last edits; call via any to avoid arity break.
import { awaitHumanCommit, type CommitProposal } from "./commit.js";

// incremental persistence for SSE/live UI
import { saveTrace } from "../server/runStore.js";

type Lane = {
  enabled?: boolean;
  id?: string; // "AI1".."AI4"
  role?: string; // "PLAN"|"CRITIQUE"|...
  provider?: string; // "openai"|"gemini"|...
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
};

function nowIso() {
  return new Date().toISOString();
}

function asLaneId(x: unknown): string {
  return String(x ?? "").trim().toUpperCase();
}

function lanesFromTask(task: TaskInput): Lane[] {
  const rt: any = (task as any)?.inputs?.runtime;
  const lanes: any[] = Array.isArray(rt?.lanes) ? rt.lanes : [];
  return lanes as Lane[];
}

function pickLane(task: TaskInput, agent: AgentName): Lane | null {
  const lanes = lanesFromTask(task);
  const id = asLaneId(agent);
  const lane = lanes.find((l) => asLaneId(l?.id) === id);
  if (!lane) return null;
  if (lane.enabled === false) return null;
  return lane;
}

function defaultSpecFor(agent: AgentName): ModelSpec {
  // sensible defaults (only used if UI didn't provide lanes)
  if (agent === "AI4") {
    return { provider: "gemini", model: "gemini-2.5-flash", temperature: 0.75, max_output_tokens: 900 } as any;
  }
  return { provider: "openai", model: "gpt-4o-mini", temperature: 0.2, max_output_tokens: 1800 } as any;
}

function laneToSpec(agent: AgentName, lane: Lane | null): ModelSpec {
  if (!lane) return defaultSpecFor(agent);

  const provider = String(lane.provider ?? "").trim() || (agent === "AI4" ? "gemini" : "openai");
  const model =
    String(lane.model ?? "").trim() ||
    (agent === "AI4" ? "gemini-2.5-flash" : "gpt-4o-mini");

  const spec: any = {
    provider,
    model,
  };

  if (typeof lane.temperature === "number") spec.temperature = lane.temperature;
  if (typeof lane.max_output_tokens === "number") spec.max_output_tokens = lane.max_output_tokens;

  return spec as ModelSpec;
}

function extractProposal(ws: Workspace, maxSteps = 5): CommitProposal {
  const ai1Rev =
    [...ws.outputs].reverse().find((o: any) => o.agent === "AI1" && o.type === "REVISION") ??
    [...ws.outputs].reverse().find((o: any) => o.agent === "AI1" && (o.type === "PLAN" || o.type === "REVISION"));

  const note =
    ai1Rev?.artifacts?.find((a: any) => a.kind === "note")?.content ??
    "No AI1 note artifact produced.";

  const steps: string[] = (ai1Rev?.steps ?? [])
    .slice(0, maxSteps)
    .map((s: any, idx: number) => `${idx + 1}. ${String(s.action ?? "").trim()}`.trim())
    .filter(Boolean);

  return {
    summary: String(note).trim(),
    stepsPreview: steps.length ? steps : ["(no steps produced)"],
  };
}

function resolveAI4Callable(): (task: TaskInput, spec: ModelSpec) => Promise<any> {
  // Accept any of these export names; your repo drifted.
  const cands = [
    (AI4 as any).AI4_reframe,
    (AI4 as any).gemini_reframe,
    (AI4 as any).reframe,
    (AI4 as any).AI4,
  ].filter(Boolean);

  const fn = cands[0];
  if (typeof fn !== "function") {
    throw new Error(
      "AI4 agent module exports no callable reframe function. Expected one of: AI4_reframe | gemini_reframe | reframe."
    );
  }
  return fn;
}

export class Orchestrator {
  constructor(private readonly validator: Validator) {}

  async run(taskInput: unknown): Promise<Workspace> {
    const task: TaskInput = TaskInputSchema.parse(taskInput);
    const ws = createWorkspace(task);

    const runId = task.taskId;

    const emit = (status: "running" | "done" | "failed", extra?: Record<string, unknown>) => {
      const snapshot: any = {
        runId,
        task,
        outputs: ws.outputs,
        trace: ws.trace,
        validator: (ws as any).validator ?? undefined,
        report: (ws as any).report ?? undefined,
        status,
        createdAt: (ws as any).createdAt ?? nowIso(),
        updatedAt: nowIso(),
        ...(extra ?? {}),
      };
      try {
        saveTrace(runId, snapshot);
      } catch {
        // ignore logging failures
      }
    };

    emit("running", { stage: "start" });

    // Specs per lane (runtime-selected)
    const specAI1 = laneToSpec("AI1", pickLane(task, "AI1"));
    const specAI2 = laneToSpec("AI2", pickLane(task, "AI2"));
    const specAI3 = laneToSpec("AI3", pickLane(task, "AI3"));
    const specAI4 = laneToSpec("AI4", pickLane(task, "AI4"));

    // 1) AI1 plan
    const o1 = await AI1_plan(task, specAI1);
    addAgentOutput(ws, o1);
    emit("running", { stage: "AI1_plan" });

    // 2) AI2 critique
    const o2 = await AI2_critique(o1, specAI2);
    addAgentOutput(ws, o2);
    emit("running", { stage: "AI2_critique" });

    // 3) AI3 reframe
    const o3 = await AI3_reframe(task, specAI3);
    addAgentOutput(ws, o3);
    emit("running", { stage: "AI3_reframe" });

    // 4) AI4 reframe (provider may be gemini today; spec supports others later)
    const ai4fn = resolveAI4Callable();
    const o4 = await ai4fn(task, specAI4);
    addAgentOutput(ws, o4);
    emit("running", { stage: "AI4_reframe" });

    // 5) AI1 revision
    const revisionNote = `Integrated critique + reframes into a bounded, deterministic plan.`;
    const o5 = await AI1_revision(task, ws.outputs, revisionNote, specAI1);
    addAgentOutput(ws, o5);
    emit("running", { stage: "AI1_revision" });

    // 6) Validator
    const vr = await this.validator.validate(ws.outputs);
    setValidator(ws, vr);
    emit("running", { stage: "validator" });

    // 7) AI2 confirm
    const o6 = await AI2_confirm(vr.status === "PASS", specAI2);
    addAgentOutput(ws, o6);
    emit("running", { stage: "AI2_confirm" });

    // 8) Consensus report
    const report = buildConsensus(ws);
    setReport(ws, report);

    const proposal = extractProposal(ws, 5);
    emit("running", { stage: "ready_for_commit", proposal });

    // 9) Human commit gate (support either signature)
    const decision = await (awaitHumanCommit as any)(runId, report, proposal);
    ws.trace["humanDecision"] = decision;

    emit("done", { stage: "done" });
    return ws;
  }
}
