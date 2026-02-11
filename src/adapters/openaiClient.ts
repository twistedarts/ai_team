// ai_team/src/adapters/openaiClient.ts
import { openaiText } from "../runtime/model/openai.js";
import type { OpenAIModelRequest } from "../runtime/model/openai.js";

export type XOCall = OpenAIModelRequest;

export type XOResult = {
  outputText: string;
};

export async function callXO(req: XOCall): Promise<XOResult> {
  const outputText = await openaiText(req);
  return { outputText };
}
