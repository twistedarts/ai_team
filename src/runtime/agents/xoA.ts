// ai_team/src/runtime/agents/xoA.ts
import type { AgentOutput, TaskInput } from "../types.js";
import { openaiJson } from "../model/openai.js";

const AGENT_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agent", "type", "claims", "steps", "assumptions", "artifacts"],
  properties: {
    agent: { type: "string", enum: ["XO-A", "XO-B", "WILD"] },
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

function normalize(out: AgentOutput, agent: "XO-A", type: AgentOutput["type"]): AgentOutput {
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

export async function xoA_plan(task: TaskInput): Promise<AgentOutput> {
  const input =
    `ROLE: XO-A\n` +
    `MODE: deterministic planner\n` +
    `OUTPUT: JSON only. Must match schema strictly.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    `CONSTRAINTS:\n${safeStringify(task.constraints)}\n\n` +
    `INPUTS:\n${safeStringify(task.inputs)}\n\n` +
    `REQUIREMENTS:\n` +
    `- Provide a concrete plan that satisfies the objective.\n` +
    `- Include at least one artifact {kind:"note"} with a human-readable summary.\n` +
    `- claims[].dependsOn must always be present (empty array allowed).\n` +
    `- steps[].action must be complete sentences (do not truncate).\n`;

  const out = await openaiJson<AgentOutput>({
    model: "gpt-4o-mini",
    input,
    schemaName: "xoA_plan",
    jsonSchema: AGENT_OUTPUT_JSON_SCHEMA,
    temperature: 0.2,
    max_output_tokens: 1800,
  });

  return normalize(out, "XO-A", "PLAN");
}

export async function xoA_revision(task: TaskInput, prior: AgentOutput[], note: string): Promise<AgentOutput> {
  const input =
    `ROLE: XO-A\n` +
    `MODE: deterministic revision\n` +
    `OUTPUT: JSON only. Must match schema strictly.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    `REVISION NOTE:\n${note}\n\n` +
    `PRIOR OUTPUTS (JSON):\n${safeStringify(prior)}\n\n` +
    `REQUIREMENTS:\n` +
    `- Integrate critique + reframe.\n` +
    `- If a GEMINI agent output exists, treat its note as a candidate "best answer".\n` +
    `  - Promote that content into your own {kind:"note"} unless it is incorrect.\n` +
    `  - If you modify it, keep the meaning but improve clarity.\n` +
    `- artifacts MUST include a {kind:"note"} containing the final human-readable output.\n` +
    `  - The note MUST include an "Answer:" section (human readable, paragraphs OK).\n` +
    `  - The note MAY include a brief "How we got here:" summary.\n` +
    `- steps must be complete and non-truncated; include the full set of steps.\n` +
    `- claims[].dependsOn must always be present (empty array allowed).\n`;

  const out = await openaiJson<AgentOutput>({
    model: "gpt-4o-mini",
    input,
    schemaName: "xoA_revision",
    jsonSchema: AGENT_OUTPUT_JSON_SCHEMA,
    temperature: 0.2,
    max_output_tokens: 2400,
  });

  return normalize(out, "XO-A", "REVISION");
}
