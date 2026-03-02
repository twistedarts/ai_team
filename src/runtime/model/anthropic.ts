
import "dotenv/config";

export type AnthropicModelRequest = {
  model: string;
  input: string;
  temperature?: number;
  max_output_tokens?: number; // maps to max_tokens
};

function mustKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY not set");
  return k;
}

export async function anthropicText(req: AnthropicModelRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": mustKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.max_output_tokens ?? 1800,
      temperature: req.temperature ?? 0.2,
      messages: [{ role: "user", content: req.input }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Anthropic error ${res.status}`);

  // content is an array of blocks; join text blocks
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("");

  return String(text ?? "").trim();
}

export async function anthropicJson<T>(req: AnthropicModelRequest & { schemaName: string; jsonSchema: any }): Promise<T> {
  const prompt =
    `Return ONLY valid JSON matching this schema name: ${req.schemaName}.\n` +
    `Do not wrap in markdown fences. Do not include any text before or after the JSON.\n\n` +
    `JSON SCHEMA:\n${JSON.stringify(req.jsonSchema, null, 2)}\n\n` +
    `INPUT:\n${req.input}\n`;

  const raw = await anthropicText({
    model: req.model,
    input: prompt,
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_output_tokens ?? 2000,
  });

  const trimmed = raw.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Anthropic JSON parse failed. Raw:\n${raw}`);
  }
}
