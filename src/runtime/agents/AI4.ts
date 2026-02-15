// ai_team/src/runtime/agents/AI4.ts
import type { AgentOutput, TaskInput, ModelSpec } from "../types.js";
import { modelText } from "../model/dispatch.js";

export async function AI4_reframe(task: TaskInput, spec: ModelSpec): Promise<AgentOutput> {
  const prompt =
    `ROLE: AI Team lane AI4\n` +
    `MODE: parallel reframe\n` +
    `Return: a concise reframe + 2-5 actionable steps.\n` +
    `No side effects. No tool calls. No network actions.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    `CONSTRAINTS:\n${JSON.stringify(task.constraints, null, 2)}\n`;

  const text = await modelText(spec, prompt);

  // Keep strict AgentOutput shape. We store the lane's raw response as a human-readable artifact.
  return {
    agent: "AI4",
    type: "REFRAME",
    claims: [
      { id: "ai4_0", text: "AI4 reframe captured in artifacts.note", dependsOn: [], risk: "low" },
    ],
    steps: [
      { id: "ai4_s1", action: "Read artifacts.note for AI4’s reframe + steps.", pre: [], post: [], evidenceNeeded: [] },
    ],
    assumptions: [],
    artifacts: [{ kind: "note", content: String(text ?? "") }],
  };
}
