// ai_team/src/runtime/model/gemini.ts
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

export type GeminiModelRequest = {
  model: string;
  input: string;
  temperature?: number;
  max_output_tokens?: number;
};

function mustKey(): string {
  const k = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GOOGLE_API_KEY (or GEMINI_API_KEY) not set");
  return k;
}

export async function geminiText(req: GeminiModelRequest): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: mustKey() });

  const maxTok = req.max_output_tokens ?? 1800; // ✅ raise default (was 900)

  const resp = await ai.models.generateContent({
    model: req.model,
    contents: req.input,
    config: {
      temperature: req.temperature ?? 0.6,
      // tolerate sdk variants
      maxOutputTokens: maxTok,
      max_output_tokens: maxTok
    } as any
  });

  const text = (resp as any)?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no text");
  return text.trim();
}
