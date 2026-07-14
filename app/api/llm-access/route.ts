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
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

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
  const telemetry = createRequestTelemetry(request, "/api/llm-access", { operation: "llm-access" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.accessAuth);
  if (limited) return limited;
  let body: { mode?: unknown; provider?: unknown; password?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    telemetry.reject("auth.ai-access", 400, { errorCode: "INVALID_JSON" });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.mode === "personal") {
    if (!hasPersonalLlmConfiguration()) {
      telemetry.reject("auth.ai-access", 503, { action: "enable-personal", errorCode: "LLM_SESSION_NOT_CONFIGURED" });
      return Response.json({ error: "LLM_SESSION_SECRET is not configured." }, { status: 503 });
    }
    const provider: PersonalLlmProvider | null =
      body.provider === "openai" || body.provider === "gemini" || body.provider === "groq"
        ? body.provider
        : null;
    if (!provider) {
      telemetry.reject("auth.ai-access", 400, { action: "enable-personal", errorCode: "INVALID_PROVIDER" });
      return Response.json({ error: "Invalid AI provider." }, { status: 400 });
    }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    try {
      if (!await verifyPersonalLlmApiKey(provider, apiKey)) {
        telemetry.reject("auth.ai-access", 401, { action: "enable-personal", provider, errorCode: "INVALID_CREDENTIAL" });
        return Response.json({ error: "Invalid personal API key." }, { status: 401 });
      }
    } catch (error) {
      telemetry.responseError("auth.ai-access", error, 503, { action: "enable-personal", provider });
      return Response.json({ error: "Could not validate personal API key." }, { status: 503 });
    }
    await disablePaidLlmAccess();
    await enablePersonalLlmAccess(provider, apiKey);
    telemetry.success("auth.ai-access", { action: "enable-personal", provider });
    return Response.json(await accessStatus());
  }

  if (!hasPaidLlmPassword()) {
    telemetry.reject("auth.ai-access", 503, { action: "enable-game-fields", errorCode: "LLM_ACCESS_NOT_CONFIGURED" });
    return Response.json(
      { error: "LLM_ACCESS_PASSWORD is not configured." },
      { status: 503 },
    );
  }

  if (!hasOpenAiApiKey()) {
    telemetry.reject("auth.ai-access", 503, { action: "enable-game-fields", provider: "openai", errorCode: "PROVIDER_NOT_CONFIGURED" });
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyPaidLlmPassword(password)) {
    telemetry.reject("auth.ai-access", 401, { action: "enable-game-fields", provider: "openai", errorCode: "INVALID_CREDENTIAL" });
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  await disablePersonalLlmAccess();
  await enablePaidLlmAccess();
  telemetry.success("auth.ai-access", { action: "enable-game-fields", provider: "openai" });
  return Response.json(await accessStatus());
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/llm-access", { operation: "llm-access" });
  await Promise.all([disablePaidLlmAccess(), disablePersonalLlmAccess()]);
  telemetry.success("auth.ai-access", { action: "disable" });
  return Response.json(await accessStatus());
}
