// ai_team/src/runtime/agents/AI1.ts
import type { AgentOutput, TaskInput, ModelSpec } from "../types.js";
import { modelJson } from "../model/dispatch.js";

const AGENT_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agent", "type", "claims", "steps", "assumptions", "artifacts"],
  properties: {
    agent: { type: "string", enum: ["AI1", "AI2", "AI3", "AI4"] },
    type: { type: "string", enum: ["PLAN", "CRITIQUE", "REFRAME", "REVISION"] },

    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "dependsOn", "risk"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          risk: { type: "string", enum: ["low", "med", "high"] },
        },
      },
    },

    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "pre", "post", "evidenceNeeded"],
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          pre: { type: "array", items: { type: "string" } },
          post: { type: "array", items: { type: "string" } },
          evidenceNeeded: { type: "array", items: { type: "string" } },
        },
      },
    },

    assumptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "isVerified"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          isVerified: { type: "boolean" },
        },
      },
    },

    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "content"],
        properties: {
          kind: { type: "string", enum: ["diff", "file", "command", "note"] },
          content: { type: "string" },
        },
      },
    },
  },
} as const;

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function normalize(out: AgentOutput, agent: "AI1", type: AgentOutput["type"]): AgentOutput {
  out.agent = agent;
  out.type = type;

  if (Array.isArray(out.claims)) {
    out.claims = out.claims.map((c: any) => ({
      id: String(c?.id ?? ""),
      text: String(c?.text ?? ""),
      risk: c?.risk === "low" || c?.risk === "med" || c?.risk === "high" ? c.risk : "med",
      dependsOn: Array.isArray(c?.dependsOn) ? c.dependsOn.map(String) : [],
    }));
  } else out.claims = [];

  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map((s: any) => ({
      id: String(s?.id ?? ""),
      action: String(s?.action ?? ""),
      pre: Array.isArray(s?.pre) ? s.pre.map(String) : [],
      post: Array.isArray(s?.post) ? s.post.map(String) : [],
      evidenceNeeded: Array.isArray(s?.evidenceNeeded) ? s.evidenceNeeded.map(String) : [],
    }));
  } else out.steps = [];

  if (!Array.isArray(out.assumptions)) out.assumptions = [];
  if (!Array.isArray(out.artifacts)) out.artifacts = [];

  // Ensure at least one note artifact exists
  const hasNote = out.artifacts.some((a: any) => a?.kind === "note" && String(a?.content ?? "").trim());
  if (!hasNote) {
    out.artifacts.push({ kind: "note", content: "(no note provided)" } as any);
  }

  return out;
}

export async function AI1_plan(task: TaskInput, spec: ModelSpec): Promise<AgentOutput> {
  const notes = (task.inputs as any)?.notes ?? "";
  const priorContext = notes
    ? `PRIOR CONTEXT (from previous run):\n${notes}\n\n` +
      `IMPORTANT: The above is the output from a prior committee run. Build upon it, do not discard it.\n\n`
    : "";

  const input =
    `ROLE: AI Team lane AI1\n` +
    `MODE: deterministic planner\n` +
    `OUTPUT: JSON only. Must match schema strictly.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    priorContext +
    `CONSTRAINTS:\n${safeStringify(task.constraints)}\n\n` +
    `REQUIREMENTS:\n` +
    `- Provide a concrete plan that satisfies the objective.\n` +
    `- Include at least one artifact {kind:"note"} with a human-readable summary.\n` +
    `- claims[].dependsOn must always be present (empty array allowed).\n` +
    `- steps[].action must be complete sentences (do not truncate).\n` +
    (notes ? `- Incorporate and refine the prior context. Do not start from scratch.\n` : "");

  const out = await modelJson<AgentOutput>(spec, input, "AI1_plan", AGENT_OUTPUT_JSON_SCHEMA);
  return normalize(out, "AI1", "PLAN");
}

export async function AI1_revision(
  task: TaskInput,
  prior: AgentOutput[],
  note: string,
  spec: ModelSpec
): Promise<AgentOutput> {
  const input =
    `ROLE: AI Team lane AI1\n` +
    `MODE: deterministic revision\n` +
    `OUTPUT: JSON only. Must match schema strictly.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    `REVISION NOTE:\n${note}\n\n` +
    `PRIOR OUTPUTS (JSON):\n${safeStringify(prior)}\n\n` +
    `REQUIREMENTS:\n` +
    `- Integrate critique + reframes.\n` +
    `- If another lane produced a strong candidate answer in its note, treat it as a candidate best answer.\n` +
    `  - Promote that content into your own {kind:"note"} unless it is incorrect.\n` +
    `  - If you modify it, keep the meaning but improve clarity.\n` +
    `- artifacts MUST include a {kind:"note"} containing the final human-readable output.\n` +
    `  - The note MUST include an "Answer:" section (human readable, paragraphs OK).\n` +
    `  - The note MAY include a brief "How we got here:" summary.\n` +
    `- steps must be complete and non-truncated; include the full set of steps.\n` +
    `- claims[].dependsOn must always be present (empty array allowed).\n`;

  const out = await modelJson<AgentOutput>(spec, input, "AI1_revision", AGENT_OUTPUT_JSON_SCHEMA);
  return normalize(out, "AI1", "REVISION");
}
