// ai_team/src/runtime/agents/xoB.ts
import type { AgentOutput } from "../types.js";
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
        // ✅ strict schema: must include every property key
        required: ["id", "text", "dependsOn", "risk"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          risk: { type: "string", enum: ["low", "med", "high"] }
        }
      }
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
          evidenceNeeded: { type: "array", items: { type: "string" } }
        }
      }
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
          isVerified: { type: "boolean" }
        }
      }
    },

    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "content"],
        properties: {
          kind: { type: "string", enum: ["diff", "file", "command", "note"] },
          content: { type: "string" }
        }
      }
    }
  }
} as const;

function normalize(out: AgentOutput, agent: "XO-B", type: AgentOutput["type"]): AgentOutput {
  out.agent = agent;
  out.type = type;

  if (Array.isArray(out.claims)) {
    out.claims = out.claims.map((c: any) => ({
      id: String(c?.id ?? ""),
      text: String(c?.text ?? ""),
      risk: (c?.risk === "low" || c?.risk === "med" || c?.risk === "high") ? c.risk : "med",
      dependsOn: Array.isArray(c?.dependsOn) ? c.dependsOn.map(String) : []
    }));
  } else {
    out.claims = [];
  }

  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map((s: any) => ({
      id: String(s?.id ?? ""),
      action: String(s?.action ?? ""),
      pre: Array.isArray(s?.pre) ? s.pre.map(String) : [],
      post: Array.isArray(s?.post) ? s.post.map(String) : [],
      evidenceNeeded: Array.isArray(s?.evidenceNeeded) ? s.evidenceNeeded.map(String) : []
    }));
  } else {
    out.steps = [];
  }

  if (!Array.isArray(out.assumptions)) out.assumptions = [];
  if (!Array.isArray(out.artifacts)) out.artifacts = [];

  return out;
}

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

export async function xoB_critique(xoA: AgentOutput): Promise<AgentOutput> {
  const input =
    `ROLE: XO-B\n` +
    `MODE: critique\n` +
    `OUTPUT: JSON only. Must match schema strictly.\n\n` +
    `XO-A OUTPUT:\n${safeStringify(xoA)}\n\n` +
    `REQUIREMENTS:\n` +
    `- Identify missing steps, mismatches to objective, and unsafe assumptions.\n` +
    `- Provide actionable corrections.\n` +
    `- claims[].dependsOn must always be present (empty array allowed).\n`;

  const out = await openaiJson<AgentOutput>({
    model: "gpt-4o-mini",
    input,
    schemaName: "xoB_critique",
    jsonSchema: AGENT_OUTPUT_JSON_SCHEMA,
    temperature: 0.2,
    max_output_tokens: 1600
  });

  return normalize(out, "XO-B", "CRITIQUE");
}

export async function xoB_confirm(validatorPass: boolean): Promise<AgentOutput> {
  return normalize(
    {
      agent: "XO-B",
      type: "CRITIQUE",
      claims: [
        {
          id: "confirm_1",
          text: validatorPass
            ? "Validator PASS. No blocking objections detected at confirm stage."
            : "Validator FAIL. Block commit; revision required.",
          risk: validatorPass ? "low" : "high",
          dependsOn: []
        }
      ],
      steps: [],
      assumptions: [],
      artifacts: [
        {
          kind: "note",
          content: validatorPass ? "Recommendation: proceed to human commit." : "Recommendation: revise and re-validate."
        }
      ]
    } as any,
    "XO-B",
    "CRITIQUE"
  );
}
