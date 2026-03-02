
import type { TaskInput, AgentOutput, ModelSpec } from "../types.js";
import { modelText } from "../model/dispatch.js";

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function asStringContent(x: any): string {
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function normalizeAgentOutput(parsed: any): AgentOutput {
  const out: any = parsed && typeof parsed === "object" ? parsed : {};

  // Force fixed lane identity
  out.agent = "AI3";
  out.type = "REFRAME";

  // Normalize arrays
  out.claims = Array.isArray(out.claims) ? out.claims : [];
  out.steps = Array.isArray(out.steps) ? out.steps : [];
  out.assumptions = Array.isArray(out.assumptions) ? out.assumptions : [];
  out.artifacts = Array.isArray(out.artifacts) ? out.artifacts : [];

  // Ensure claim fields are present + dependsOn is array
  out.claims = out.claims.map((c: any, i: number) => ({
    id: typeof c?.id === "string" ? c.id : `ai3_claim_${i + 1}`,
    text: typeof c?.text === "string" ? c.text : asStringContent(c?.text ?? c),
    risk: c?.risk === "high" || c?.risk === "med" || c?.risk === "low" ? c.risk : "low",
    dependsOn: Array.isArray(c?.dependsOn) ? c.dependsOn.map(String) : [],
  }));

  // Normalize steps
  out.steps = out.steps.map((s: any, i: number) => ({
    id: typeof s?.id === "string" ? s.id : `ai3_s${i + 1}`,
    action: typeof s?.action === "string" ? s.action : asStringContent(s?.action ?? s),
    pre: Array.isArray(s?.pre) ? s.pre.map(String) : [],
    post: Array.isArray(s?.post) ? s.post.map(String) : [],
    evidenceNeeded: Array.isArray(s?.evidenceNeeded) ? s.evidenceNeeded.map(String) : [],
  }));

  // Normalize assumptions
  out.assumptions = out.assumptions.map((a: any, i: number) => ({
    id: typeof a?.id === "string" ? a.id : `ai3_a${i + 1}`,
    text: typeof a?.text === "string" ? a.text : asStringContent(a?.text ?? a),
    isVerified: Boolean(a?.isVerified),
  }));

  // Normalize artifacts, enforce string content
  out.artifacts = out.artifacts.map((a: any) => ({
    kind:
      a?.kind === "diff" || a?.kind === "file" || a?.kind === "command" || a?.kind === "note"
        ? a.kind
        : "note",
    content: asStringContent(a?.content ?? ""),
  }));

  // Guarantee at least one note artifact
  if (!out.artifacts.some((a: any) => a.kind === "note" && String(a.content ?? "").trim())) {
    out.artifacts.push({
      kind: "note",
      content: "Lane AI3 produced no note; please retry.",
    });
  }

  return out as AgentOutput;
}

export async function AI3_reframe(task: TaskInput, spec: ModelSpec): Promise<AgentOutput> {
  const prompt = `
You are AI3, a creative reframe lane in a deterministic multi-agent runtime.

Return ONLY valid JSON with this shape:
{
  "agent":"AI3",
  "type":"REFRAME",
  "claims":[{"id":"c1","text":"...","risk":"low","dependsOn":[]}],
  "steps":[{"id":"s1","action":"...","pre":[],"post":[],"evidenceNeeded":[]}],
  "assumptions":[{"id":"a1","text":"...","isVerified":false}],
  "artifacts":[{"kind":"note","content":"..."}]
}

Rules:
- dependsOn MUST be an array (use [] if none)
- artifacts[].content MUST be a string
- Make the reframe about the user's objective, not UI

OBJECTIVE: ${task.objective}
CONSTRAINTS: ${JSON.stringify(task.constraints)}
NOTES: ${String((task as any)?.inputs?.notes ?? "")}
`.trim();

  const raw = await modelText(spec, prompt);

  const jsonText = extractJson(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`AI3 returned non-JSON. Raw:\n${raw}`);
  }

  return normalizeAgentOutput(parsed);
}
