
import type { ModelSpec } from "../types.js";

import { openaiText, openaiJson } from "./openai.js";
import { geminiText, geminiJson } from "./gemini.js";
import { anthropicText, anthropicJson } from "./anthropic.js";
import { azureOpenAIText, azureOpenAIJson } from "./azure_openai.js";

export async function modelText(spec: ModelSpec, input: string): Promise<string> {
  switch (spec.provider) {
    case "openai":
      return openaiText({ model: spec.model, input, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "gemini":
      return geminiText({ model: spec.model, input, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "anthropic":
      return anthropicText({ model: spec.model, input, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "azure_openai":
      return azureOpenAIText({ model: spec.model, input, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
  }
}

export async function modelJson<T>(spec: ModelSpec, input: string, schemaName: string, jsonSchema: any): Promise<T> {
  switch (spec.provider) {
    case "openai":
      return openaiJson<T>({ model: spec.model, input, schemaName, jsonSchema, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "gemini":
      return geminiJson<T>({ model: spec.model, input, schemaName, jsonSchema, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "azure_openai":
      return azureOpenAIJson<T>({ model: spec.model, input, schemaName, jsonSchema, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
    case "anthropic":
      return anthropicJson<T>({ model: spec.model, input, schemaName, jsonSchema, temperature: spec.temperature, max_output_tokens: spec.max_output_tokens });
  }
}
