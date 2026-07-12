import { generateGeminiText, hasGeminiApiKey } from "@/lib/gemini";
import { generateGroqText, hasGroqApiKey } from "@/lib/groq";

export type FreeLlmProvider = "gemini" | "groq";

export function hasFreeLlmApi() {
  return hasGeminiApiKey() || hasGroqApiKey();
}

export async function generateFreeLlmText(prompt: string) {
  const errors: unknown[] = [];

  if (hasGeminiApiKey()) {
    try {
      return { text: await generateGeminiText(prompt), provider: "gemini" as const };
    } catch (error) {
      errors.push(error);
      console.warn("[free-llm] Gemini unavailable; trying Groq", error);
    }
  }

  if (hasGroqApiKey()) {
    try {
      return { text: await generateGroqText(prompt), provider: "groq" as const };
    } catch (error) {
      errors.push(error);
    }
  }

  throw new AggregateError(errors, "No free LLM API completed the request.");
}
