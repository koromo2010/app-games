import {
  disablePaidLlmAccess,
  disablePersonalLlmAccess,
  enablePaidLlmAccess,
  enablePersonalLlmAccess,
  getPaidLlmAccessSource,
  getPersonalLlmAccess,
  hasOpenAiApiKey,
  hasPaidLlmPassword,
  hasPersonalLlmConfiguration,
  paidLlmModel,
  verifyPaidLlmPassword,
  verifyPersonalLlmApiKey,
  type PersonalLlmProvider,
} from "@/lib/llm-access";
import { hasGeminiApiKey } from "@/lib/gemini";
import { hasGroqApiKey } from "@/lib/groq";
import { freeGroqLlmModel, freeLlmModel } from "@/lib/llm-model";

async function accessStatus() {
  const source = await getPaidLlmAccessSource();
  const personal = source === "personal" ? await getPersonalLlmAccess() : null;
  const personalModel = personal?.provider === "gemini"
    ? freeLlmModel
    : personal?.provider === "groq"
      ? freeGroqLlmModel
      : paidLlmModel;
  return {
    enabled: Boolean(source),
    source,
    personalEnabled: source === "personal",
    personalConfigured: hasPersonalLlmConfiguration(),
    personalProvider: personal?.provider ?? null,
    gameFieldsEnabled: source === "game-fields",
    gameFieldsConfigured: hasPaidLlmPassword() && hasOpenAiApiKey(),
    configured: hasPaidLlmPassword(),
    hasApiKey: hasOpenAiApiKey(),
    model: personal ? personalModel : paidLlmModel,
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
  let body: { mode?: unknown; provider?: unknown; password?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.mode === "personal") {
    if (!hasPersonalLlmConfiguration()) {
      return Response.json({ error: "LLM_SESSION_SECRET is not configured." }, { status: 503 });
    }
    const provider: PersonalLlmProvider | null =
      body.provider === "openai" || body.provider === "gemini" || body.provider === "groq"
        ? body.provider
        : null;
    if (!provider) return Response.json({ error: "Invalid AI provider." }, { status: 400 });
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    try {
      if (!await verifyPersonalLlmApiKey(provider, apiKey)) {
        return Response.json({ error: "Invalid personal API key." }, { status: 401 });
      }
    } catch {
      return Response.json({ error: "Could not validate personal API key." }, { status: 503 });
    }
    await disablePaidLlmAccess();
    await enablePersonalLlmAccess(provider, apiKey);
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

  await disablePersonalLlmAccess();
  await enablePaidLlmAccess();
  return Response.json(await accessStatus());
}

export async function DELETE() {
  await Promise.all([disablePaidLlmAccess(), disablePersonalLlmAccess()]);
  return Response.json(await accessStatus());
}
