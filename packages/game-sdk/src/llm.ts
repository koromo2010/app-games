export type GameSdkLlmQuality = "standard" | "high";
export type GameSdkLlmMode = "paid" | "personal" | "free" | "local";
export type GameSdkLlmProvider = "openai" | "gemini" | "groq" | "local";

export type GameSdkLlmJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type GameSdkLlmRequest = {
  /** Stable game-specific task key used for policy, feedback, and observability. */
  task: string;
  prompt: string;
  promptVersion: string;
  quality?: GameSdkLlmQuality;
  responseJsonSchema?: GameSdkLlmJsonSchema;
  timeoutMs?: number;
};

export type GameSdkGenerationMeta = {
  provider: GameSdkLlmProvider;
  model: string;
  mode: GameSdkLlmMode;
  billingSource?: "personal" | "game-fields";
  promptVersion: string;
  latencyMs: number;
  retrievedFeedbackIds: readonly string[];
  reviewProvider?: GameSdkLlmProvider;
  reviewModel?: string;
  reusedFromCatalog?: boolean;
};

export type GameSdkLlmResponse = {
  text: string;
  generation: GameSdkGenerationMeta;
};

const maximumGameSdkLlmPromptLength = 20_000;
const maximumGameSdkLlmSchemaLength = 32_000;
const maximumGameSdkLlmTimeoutMs = 45_000;

function normalizeGameSdkLlmJsonSchema(
  value: GameSdkLlmJsonSchema,
): GameSdkLlmJsonSchema {
  const name = value.name.trim();
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name)) {
    throw new Error("GAME_SDK_LLM_INVALID_SCHEMA_NAME");
  }
  if (
    !value.schema
    || typeof value.schema !== "object"
    || Array.isArray(value.schema)
  ) {
    throw new Error("GAME_SDK_LLM_INVALID_SCHEMA");
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(value.schema);
  } catch {
    throw new Error("GAME_SDK_LLM_INVALID_SCHEMA");
  }
  if (!serialized || serialized.length > maximumGameSdkLlmSchemaLength) {
    throw new Error("GAME_SDK_LLM_INVALID_SCHEMA");
  }
  return {
    name,
    schema: value.schema,
    strict: value.strict !== false,
  };
}

/**
 * Platform-injected LLM contract. API keys and provider clients never cross
 * this boundary into a game package.
 */
export type GameSdkLlmGateway = {
  generate(request: GameSdkLlmRequest): Promise<GameSdkLlmResponse>;
};

export function normalizeGameSdkLlmRequest(
  request: GameSdkLlmRequest,
): GameSdkLlmRequest {
  const task = request.task.trim();
  const prompt = request.prompt.trim();
  const promptVersion = request.promptVersion.trim();
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(task)) {
    throw new Error("GAME_SDK_LLM_INVALID_TASK");
  }
  if (!prompt || prompt.length > maximumGameSdkLlmPromptLength) {
    throw new Error("GAME_SDK_LLM_INVALID_PROMPT");
  }
  if (!promptVersion || promptVersion.length > 100) {
    throw new Error("GAME_SDK_LLM_INVALID_PROMPT_VERSION");
  }
  const timeoutMs = request.timeoutMs;
  if (
    timeoutMs !== undefined
    && (
      !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 1_000
      || timeoutMs > maximumGameSdkLlmTimeoutMs
    )
  ) {
    throw new Error("GAME_SDK_LLM_INVALID_TIMEOUT");
  }
  return {
    task,
    prompt,
    promptVersion,
    quality: request.quality === "high" ? "high" : "standard",
    ...(request.responseJsonSchema
      ? {
          responseJsonSchema: normalizeGameSdkLlmJsonSchema(
            request.responseJsonSchema,
          ),
        }
      : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

/** Adds public request validation around the private Platform gateway. */
export function defineGameSdkLlmGateway(
  gateway: GameSdkLlmGateway,
): GameSdkLlmGateway {
  return {
    async generate(request) {
      return gateway.generate(normalizeGameSdkLlmRequest(request));
    },
  };
}
