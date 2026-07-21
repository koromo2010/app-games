import { freeLlmModel } from "@/lib/llm-model";
import { sharedEnvironmentVariable } from "@/lib/shared-environment";

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export function hasGeminiApiKey() {
  return Boolean(sharedEnvironmentVariable("GEMINI_API_KEY"));
}

export async function generateGeminiText(
  prompt: string,
  options: { quality?: "standard" | "high"; timeoutMs?: number; apiKey?: string } = {},
) {
  const apiKey = options.apiKey?.trim() || sharedEnvironmentVariable("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const quality = options.quality ?? "standard";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${freeLlmModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: quality === "high" ? "high" : "minimal" },
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? (quality === "high" ? 20000 : 6000)),
      cache: "no-store",
    },
  );

  const data = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API request failed with ${response.status}.`);
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      .map((part) => part.text)
      .join("")
      .trim() ?? "";

  if (!text) throw new Error("Gemini API returned no text.");
  return text;
}
