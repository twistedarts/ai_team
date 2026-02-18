// ai_team/src/adapters/openaiClient.ts
import { openaiText } from "../runtime/model/openai.js";
import type { OpenAIModelRequest } from "../runtime/model/openai.js";

export type ModelCall = OpenAIModelRequest;

export type ModelResult = {
  outputText: string;
};

export async function callModel(req: ModelCall): Promise<ModelResult> {
  const outputText = await openaiText(req);
  return { outputText };
}
