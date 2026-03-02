
import "dotenv/config";

export type GeminiModelRequest = {
  model: string;
  input: string;
  temperature?: number;
  max_output_tokens?: number;
};

function mustKey(): string {
  const k = process.env.GOOGLE_API_KEY;
  if (!k) throw new Error("GOOGLE_API_KEY not set");
  return k;
}

export async function geminiText(req: GeminiModelRequest): Promise<string> {
  const apiKey = mustKey();
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: req.input }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.max_output_tokens ?? 1800,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Google model error ${res.status}`;
    throw new Error(msg);
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";

  return String(text).trim();
}

// JSON helper: ask the model to return JSON, then parse it.
// (Keep it simple; strict JSON-schema enforcement is handled by OpenAI/Azure adapters.)
export async function geminiJson<T>(req: GeminiModelRequest & { schemaName: string; jsonSchema: any }): Promise<T> {
  const prompt =
    `Return ONLY valid JSON matching this schema name: ${req.schemaName}.\n` +
    `Do not wrap in markdown fences.\n\n` +
    `JSON SCHEMA:\n${JSON.stringify(req.jsonSchema, null, 2)}\n\n` +
    `INPUT:\n${req.input}\n`;

  const raw = await geminiText({
    model: req.model,
    input: prompt,
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_output_tokens ?? 2000,
  });

  const trimmed = raw.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Google JSON parse failed. Raw:\n${raw}`);
  }
}
