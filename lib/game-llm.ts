import { hasGeminiApiKey, generateGeminiText } from "@/lib/gemini";
import { hasGroqApiKey, generateGroqText } from "@/lib/groq";
import { getPaidLlmAccessSource, getPersonalLlmAccess } from "@/lib/llm-access";
import { freeGroqLlmModel, freeLlmModel, paidLlmModel } from "@/lib/llm-model";

/**
 * Shared LLM gateway for every game in app-games.
 * Provider failover belongs here so individual games never repeat the chain.
 */
export type GameLlmMode = "paid" | "personal" | "free" | "local";
export type GameLlmProvider = "openai" | "gemini" | "groq";

export type GameLlmGenerationOptions = {
  preferredProvider?: GameLlmProvider;
  excludedProviders?: GameLlmProvider[];
  quality?: "standard" | "high";
};

export const gameLlmFallbackNotice =
  "無料AI（Gemini・Groq）を利用できなかったため、ローカル候補を使用しています。";

export async function resolveGameLlmMode(): Promise<GameLlmMode> {
  const source = await getPaidLlmAccessSource();
  if (source === "personal") return "personal";
  if (source === "game-fields") return "paid";
  if (hasGeminiApiKey() || hasGroqApiKey()) return "free";
  return "local";
}

async function providerOrder(mode: Exclude<GameLlmMode, "local">, options: GameLlmGenerationOptions) {
  const personal = mode === "personal" ? await getPersonalLlmAccess() : null;
  const available: GameLlmProvider[] = [
    ...(mode === "paid" ? ["openai" as const] : []),
    ...(personal ? [personal.provider] : []),
    ...(hasGeminiApiKey() && personal?.provider !== "gemini" ? ["gemini" as const] : []),
    ...(hasGroqApiKey() && personal?.provider !== "groq" ? ["groq" as const] : []),
  ];
  const excluded = new Set(options.excludedProviders ?? []);
  const ordered = options.preferredProvider && available.includes(options.preferredProvider)
    ? [options.preferredProvider, ...available.filter((provider) => provider !== options.preferredProvider)]
    : available;
  return [...new Set(ordered)].filter((provider) => !excluded.has(provider));
}

async function generateOpenAiText(prompt: string, quality: "standard" | "high", apiKey: string) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: quality === "high" ? 30000 : 6000,
  });
  const response = await client.responses.create({
    model: paidLlmModel,
    reasoning: { effort: quality === "high" ? "high" : "none" },
    input: prompt,
  });
  const text = response.output_text.trim();
  if (!text) throw new Error("OpenAI API returned no text.");
  return text;
}

async function callProvider(
  provider: GameLlmProvider,
  prompt: string,
  quality: "standard" | "high",
  requestedMode: Exclude<GameLlmMode, "local">,
) {
  const personal = requestedMode === "personal" ? await getPersonalLlmAccess() : null;
  const personalApiKey = personal?.provider === provider ? personal.apiKey : undefined;
  if (provider === "openai") {
    const apiKey = personalApiKey || (requestedMode === "paid" ? process.env.OPENAI_API_KEY?.trim() : "");
    if (!apiKey) throw new Error("OpenAI API access is not available.");
    return {
      text: await generateOpenAiText(prompt, quality, apiKey),
      model: paidLlmModel,
      mode: personalApiKey ? "personal" as const : "paid" as const,
      billingSource: personalApiKey ? "personal" as const : "game-fields" as const,
    };
  }
  if (provider === "gemini") {
    return {
      text: await generateGeminiText(prompt, { quality, apiKey: personalApiKey }),
      model: freeLlmModel,
      mode: personalApiKey ? "personal" as const : "free" as const,
      billingSource: personalApiKey ? "personal" as const : undefined,
    };
  }
  return {
    text: await generateGroqText(prompt, quality, personalApiKey),
    model: freeGroqLlmModel,
    mode: personalApiKey ? "personal" as const : "free" as const,
    billingSource: personalApiKey ? "personal" as const : undefined,
  };
}

export async function generateGameLlmText(
  prompt: string,
  mode: Exclude<GameLlmMode, "local">,
  options: GameLlmGenerationOptions = {},
) {
  const startedAt = Date.now();
  const quality = options.quality ?? "standard";
  const attemptedProviders: GameLlmProvider[] = [];
  const errors: unknown[] = [];

  for (const provider of await providerOrder(mode, options)) {
    attemptedProviders.push(provider);
    try {
      const generated = await callProvider(provider, prompt, quality, mode);
      return {
        ...generated,
        provider,
        attemptedProviders,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      errors.push(error);
      const status = typeof error === "object" && error && "status" in error ? String(error.status) : "unknown";
      console.warn(`[game-llm] ${provider} unavailable (status: ${status}); trying the next provider`);
    }
  }

  throw new AggregateError(errors, "No paid or free LLM API completed the request.");
}
