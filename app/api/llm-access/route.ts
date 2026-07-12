import {
  disablePaidLlmAccess,
  enablePaidLlmAccess,
  hasOpenAiApiKey,
  hasPaidLlmAccess,
  hasPaidLlmPassword,
  paidLlmModel,
  verifyPaidLlmPassword,
} from "@/lib/llm-access";
import { hasGeminiApiKey } from "@/lib/gemini";
import { hasGroqApiKey } from "@/lib/groq";
import { freeGroqLlmModel, freeLlmModel } from "@/lib/llm-model";

export async function GET() {
  return Response.json({
    enabled: await hasPaidLlmAccess(),
    configured: hasPaidLlmPassword(),
    hasApiKey: hasOpenAiApiKey(),
    model: paidLlmModel,
    hasFreeApiKey: hasGeminiApiKey(),
    freeModel: freeLlmModel,
    hasGroqApiKey: hasGroqApiKey(),
    groqModel: freeGroqLlmModel,
  });
}

export async function POST(request: Request) {
  if (!hasPaidLlmPassword()) {
    return Response.json(
      { error: "LLM_ACCESS_PASSWORD is not configured." },
      { status: 503 },
    );
  }

  if (!hasOpenAiApiKey()) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!verifyPaidLlmPassword(password)) {
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  await enablePaidLlmAccess();
  return Response.json({
    enabled: true,
    configured: true,
    hasApiKey: true,
    model: paidLlmModel,
    hasFreeApiKey: hasGeminiApiKey(),
    freeModel: freeLlmModel,
    hasGroqApiKey: hasGroqApiKey(),
    groqModel: freeGroqLlmModel,
  });
}

export async function DELETE() {
  await disablePaidLlmAccess();
  return Response.json({
    enabled: false,
    configured: hasPaidLlmPassword(),
    hasApiKey: hasOpenAiApiKey(),
    model: paidLlmModel,
    hasFreeApiKey: hasGeminiApiKey(),
    freeModel: freeLlmModel,
    hasGroqApiKey: hasGroqApiKey(),
    groqModel: freeGroqLlmModel,
  });
}
