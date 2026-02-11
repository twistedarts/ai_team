// ai_team/src/runtime/agents/gemini.ts
import type { AgentOutput, TaskInput } from "../types.js";
import { geminiText } from "../model/gemini.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function gemini_reframe(task: TaskInput): Promise<AgentOutput> {
  const prompt =
    `ROLE: GEMINI (parallel reframe lane)\n` +
    `Return: a concise reframe + 2-5 actionable steps.\n` +
    `No side effects. No tool calls. No network actions.\n\n` +
    `OBJECTIVE:\n${task.objective}\n\n` +
    `CONSTRAINTS:\n${JSON.stringify(task.constraints, null, 2)}\n`;

  const text = await geminiText({
    model: GEMINI_MODEL,
    input: prompt,
    temperature: 0.75,
    max_output_tokens: 900,
  });

  // Keep strict AgentOutput shape. We store Gemini’s raw response as a human-readable artifact.
  return {
    agent: "GEMINI",
    type: "REFRAME",
    claims: [
      { id: "g0", text: "Gemini reframe captured in artifacts.note", dependsOn: [], risk: "low" },
    ],
    steps: [
      { id: "g_s1", action: "Read artifacts.note for Gemini’s reframe + steps.", pre: [], post: [], evidenceNeeded: [] },
    ],
    assumptions: [],
    artifacts: [{ kind: "note", content: text }],
  };
}
