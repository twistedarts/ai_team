
import "dotenv/config";

export type AzureOpenAIModelRequest = {
  model: string; // In Azure, this is typically the DEPLOYMENT name
  input: string;
  temperature?: number;
  max_output_tokens?: number;
};

export type AzureOpenAIJsonRequest = AzureOpenAIModelRequest & {
  schemaName: string;
  jsonSchema: any;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} not set`);
  return String(v).trim();
}

/**
 * Expect base URL like:
 *   https://<resource>.openai.azure.com/openai/v1
 * or any base that already includes /openai/v1.
 */
function baseUrl(): string {
  return mustEnv("AZURE_OPENAI_BASE_URL").replace(/\/$/, "");
}

function apiKey(): string {
  return mustEnv("AZURE_OPENAI_API_KEY");
}

async function postJson(path: string, payload: any): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Azure OpenAI error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Try to be compatible with Responses-style outputs.
function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;

  const out = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];

  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        chunks.push(c.text);
      }
    }
  }

  if (chunks.length) return chunks.join("").trim();

  // Fallback: some responses variants return choices/message-like shapes.
  const choiceText =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";
  return String(choiceText ?? "").trim();
}

export async function azureOpenAIText(req: AzureOpenAIModelRequest): Promise<string> {
  const payload = {
    model: req.model,
    input: req.input,
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_output_tokens ?? 1800,
  };

  const data = await postJson("/responses", payload);
  return extractOutputText(data).trim();
}

export async function azureOpenAIJson<T>(req: AzureOpenAIJsonRequest): Promise<T> {
  const payload = {
    model: req.model,
    input: req.input,
    text: {
      format: {
        type: "json_schema",
        name: req.schemaName,
        strict: true,
        schema: req.jsonSchema,
      },
    },
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_output_tokens ?? 2000,
  };

  const data = await postJson("/responses", payload);
  const raw = extractOutputText(data);

  const trimmed = raw
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Azure OpenAI JSON parse failed. Raw:\n${raw}`);
  }
}
