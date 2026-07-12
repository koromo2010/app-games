import { generateFreeLlmText, hasFreeLlmApi } from "@/lib/free-llm";
import { hasPaidLlmAccess } from "@/lib/llm-access";
import { freeGroqLlmModel, freeLlmModel, paidLlmModel } from "@/lib/llm-model";

/**
 * Shared LLM gateway for every game in app-games.
 * New games should use this module instead of calling provider APIs directly.
 */
export type GameLlmMode = "paid" | "free" | "local";
export type GameLlmProvider = "openai" | "gemini" | "groq";

export const gameLlmFallbackNotice =
  "無料AI（Gemini・Groq）を利用できなかったため、ローカル候補を使用しています。";

export async function resolveGameLlmMode(): Promise<GameLlmMode> {
  if (await hasPaidLlmAccess()) return "paid";
  if (hasFreeLlmApi()) return "free";
  return "local";
}

export async function generateGameLlmText(prompt: string, mode: Exclude<GameLlmMode, "local">) {
  const startedAt = Date.now();
  if (mode === "free") {
    const result = await generateFreeLlmText(prompt);
    return {
      ...result,
      model: result.provider === "gemini" ? freeLlmModel : freeGroqLlmModel,
      mode,
      latencyMs: Date.now() - startedAt,
    };
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 6000,
  });
  const response = await client.responses.create({
    model: paidLlmModel,
    reasoning: { effort: "none" },
    input: prompt,
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("OpenAI API returned no text.");
  return {
    text,
    provider: "openai" as const,
    model: paidLlmModel,
    mode,
    latencyMs: Date.now() - startedAt,
  };
}
