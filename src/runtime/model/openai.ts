
import "dotenv/config";

export type OpenAIModelRequest = {
  model: string;
  input: string;
  temperature?: number;
  max_output_tokens?: number;
};

export type OpenAIJsonRequest = OpenAIModelRequest & {
  schemaName: string;
  jsonSchema: any;
};

function mustKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not set");
  return k;
}

function extractOutputText(data: any): string {
  const out: string[] = [];
  for (const item of data?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") out.push(c.text);
      else if (typeof c?.text?.value === "string") out.push(c.text.value);
    }
  }
  if (out.length) return out.join("");
  if (typeof data?.output_text === "string") return data.output_text;
  return "";
}

async function postResponses(payload: any): Promise<any> {
  const apiKey = mustKey();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // Optional org routing
  const org = process.env.OPENAI_ORG_ID;
  if (org && org.trim().length > 0) headers["OpenAI-Organization"] = org;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `OpenAI error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function openaiText(req: OpenAIModelRequest): Promise<string> {
  const payload = {
    model: req.model,
    input: req.input,
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_output_tokens ?? 1800,
  };

  const data = await postResponses(payload);
  return extractOutputText(data).trim();
}

// Optional 
export async function openaiJson<T>(req: OpenAIJsonRequest): Promise<T> {
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

  const data = await postResponses(payload);
  const txt = extractOutputText(data).trim();
  return JSON.parse(txt) as T;
}
