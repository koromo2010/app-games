import { hasGeminiApiKey, generateGeminiText } from "@/lib/gemini";
import { hasGroqApiKey, generateGroqText } from "@/lib/groq";
import { hasPaidLlmAccess } from "@/lib/llm-access";
import { freeGroqLlmModel, freeLlmModel, paidLlmModel } from "@/lib/llm-model";

/**
 * Shared LLM gateway for every game in app-games.
 * Provider failover belongs here so individual games never repeat the chain.
 */
export type GameLlmMode = "paid" | "free" | "local";
export type GameLlmProvider = "openai" | "gemini" | "groq";

export type GameLlmGenerationOptions = {
  preferredProvider?: GameLlmProvider;
  excludedProviders?: GameLlmProvider[];
};

export const gameLlmFallbackNotice =
  "無料AI（Gemini・Groq）を利用できなかったため、ローカル候補を使用しています。";

export async function resolveGameLlmMode(): Promise<GameLlmMode> {
  if (await hasPaidLlmAccess()) return "paid";
  if (hasGeminiApiKey() || hasGroqApiKey()) return "free";
  return "local";
}

function providerOrder(mode: Exclude<GameLlmMode, "local">, options: GameLlmGenerationOptions) {
  const available: GameLlmProvider[] = [
    ...(mode === "paid" ? ["openai" as const] : []),
    ...(hasGeminiApiKey() ? ["gemini" as const] : []),
    ...(hasGroqApiKey() ? ["groq" as const] : []),
  ];
  const excluded = new Set(options.excludedProviders ?? []);
  const ordered = options.preferredProvider && available.includes(options.preferredProvider)
    ? [options.preferredProvider, ...available.filter((provider) => provider !== options.preferredProvider)]
    : available;
  return [...new Set(ordered)].filter((provider) => !excluded.has(provider));
}

async function generateOpenAiText(prompt: string) {
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
  return text;
}

async function callProvider(provider: GameLlmProvider, prompt: string) {
  if (provider === "openai") {
    return { text: await generateOpenAiText(prompt), model: paidLlmModel, mode: "paid" as const };
  }
  if (provider === "gemini") {
    return { text: await generateGeminiText(prompt), model: freeLlmModel, mode: "free" as const };
  }
  return { text: await generateGroqText(prompt), model: freeGroqLlmModel, mode: "free" as const };
}

export async function generateGameLlmText(
  prompt: string,
  mode: Exclude<GameLlmMode, "local">,
  options: GameLlmGenerationOptions = {},
) {
  const startedAt = Date.now();
  const attemptedProviders: GameLlmProvider[] = [];
  const errors: unknown[] = [];

  for (const provider of providerOrder(mode, options)) {
    attemptedProviders.push(provider);
    try {
      const generated = await callProvider(provider, prompt);
      return {
        ...generated,
        provider,
        attemptedProviders,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      errors.push(error);
      console.warn(`[game-llm] ${provider} unavailable; trying the next provider`, error);
    }
  }

  throw new AggregateError(errors, "No paid or free LLM API completed the request.");
}
