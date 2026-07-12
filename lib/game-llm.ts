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

export function getGameLlmAttemptModes(mode: GameLlmMode): Array<Exclude<GameLlmMode, "local">> {
  if (mode === "local") return [];
  if (mode === "paid" && hasFreeLlmApi()) return ["paid", "free"];
  return [mode];
}

async function generateFreeGameLlmText(prompt: string, startedAt: number) {
  const result = await generateFreeLlmText(prompt);
  return {
    ...result,
    model: result.provider === "gemini" ? freeLlmModel : freeGroqLlmModel,
    mode: "free" as const,
    latencyMs: Date.now() - startedAt,
  };
}

export async function generateGameLlmText(prompt: string, mode: Exclude<GameLlmMode, "local">) {
  const startedAt = Date.now();
  if (mode === "free") {
    return generateFreeGameLlmText(prompt, startedAt);
  }

  try {
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
  } catch (paidError) {
    if (!hasFreeLlmApi()) throw paidError;
    console.warn("[game-llm] OpenAI unavailable; trying the free provider chain", paidError);
    try {
      return await generateFreeGameLlmText(prompt, startedAt);
    } catch (freeError) {
      throw new AggregateError([paidError, freeError], "No paid or free LLM API completed the request.");
    }
  }
}
