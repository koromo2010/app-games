import {
  disablePaidLlmAccess,
  disablePersonalOpenAiAccess,
  enablePaidLlmAccess,
  enablePersonalOpenAiAccess,
  getPaidLlmAccessSource,
  hasOpenAiApiKey,
  hasPaidLlmPassword,
  hasPersonalOpenAiConfiguration,
  paidLlmModel,
  verifyPaidLlmPassword,
  verifyPersonalOpenAiApiKey,
} from "@/lib/llm-access";
import { hasGeminiApiKey } from "@/lib/gemini";
import { hasGroqApiKey } from "@/lib/groq";
import { freeGroqLlmModel, freeLlmModel } from "@/lib/llm-model";

async function accessStatus() {
  const source = await getPaidLlmAccessSource();
  return {
    enabled: Boolean(source),
    source,
    personalEnabled: source === "personal",
    personalConfigured: hasPersonalOpenAiConfiguration(),
    gameFieldsEnabled: source === "game-fields",
    gameFieldsConfigured: hasPaidLlmPassword() && hasOpenAiApiKey(),
    configured: hasPaidLlmPassword(),
    hasApiKey: hasOpenAiApiKey(),
    model: paidLlmModel,
    hasFreeApiKey: hasGeminiApiKey(),
    freeModel: freeLlmModel,
    hasGroqApiKey: hasGroqApiKey(),
    groqModel: freeGroqLlmModel,
  };
}

export async function GET() {
  return Response.json({
    ...(await accessStatus()),
  });
}

export async function POST(request: Request) {
  let body: { mode?: unknown; password?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.mode === "personal") {
    if (!hasPersonalOpenAiConfiguration()) {
      return Response.json({ error: "LLM_SESSION_SECRET is not configured." }, { status: 503 });
    }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    try {
      if (!await verifyPersonalOpenAiApiKey(apiKey)) {
        return Response.json({ error: "Invalid OpenAI API key." }, { status: 401 });
      }
    } catch {
      return Response.json({ error: "Could not validate OpenAI API key." }, { status: 503 });
    }
    await disablePaidLlmAccess();
    await enablePersonalOpenAiAccess(apiKey);
    return Response.json(await accessStatus());
  }

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

  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyPaidLlmPassword(password)) {
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  await disablePersonalOpenAiAccess();
  await enablePaidLlmAccess();
  return Response.json(await accessStatus());
}

export async function DELETE() {
  await Promise.all([disablePaidLlmAccess(), disablePersonalOpenAiAccess()]);
  return Response.json(await accessStatus());
}
