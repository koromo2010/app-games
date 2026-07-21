import { freeGroqLlmModel } from "@/lib/llm-model";
import type { GameLlmJsonSchema } from "@/lib/game-llm";
import { sharedEnvironmentVariable } from "@/lib/shared-environment";

export function hasGroqApiKey() {
  return Boolean(sharedEnvironmentVariable("GROQ_API_KEY"));
}

export async function generateGroqText(
  prompt: string,
  quality: "standard" | "high" = "standard",
  apiKeyOverride?: string,
  timeoutMs?: number,
  responseJsonSchema?: GameLlmJsonSchema,
) {
  const apiKey = apiKeyOverride?.trim() || sharedEnvironmentVariable("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
    maxRetries: 0,
    timeout: timeoutMs ?? (quality === "high" ? 30000 : 6000),
  });
  const response = await client.responses.create({
    model: freeGroqLlmModel,
    ...(quality === "high" ? { reasoning: { effort: "high" as const } } : {}),
    ...(quality === "high" ? { max_output_tokens: 8192 } : {}),
    ...(responseJsonSchema ? {
      text: {
        format: {
          type: "json_schema" as const,
          name: responseJsonSchema.name,
          schema: responseJsonSchema.schema,
          strict: responseJsonSchema.strict ?? true,
        },
      },
    } : {}),
    input: prompt,
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("Groq API returned no text.");
  return text;
}
