import type {
  GameSdkManifest,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type {
  GameSdkCommandContext,
  GameSdkCreateContext,
  GameSdkPresentationContext,
  GameSdkRuntimeTiming,
  GameSdkServerModule,
} from "@game-fields/game-sdk/runtime";
import type { GameSdkPlatformResources } from "@game-fields/game-sdk/resources";
import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
  type GameSdkPortableCommandBatchRequest,
  type GameSdkPortableCommandBatchResponse,
  type GameSdkPortableEffectRequest,
  type GameSdkPortableEffectResult,
  type GameSdkPortableServerRequest,
  type GameSdkPortableServerResponse,
} from "@game-fields/game-sdk/portable-server";
import type { GameSdkEffectJournal } from "./game-sdk-effect-journal.ts";
import type { GameSdkFeedbackCapture } from "./game-sdk-feedback-store.ts";

const MAX_RESOURCE_EFFECTS = 8;
const MAX_RUNNER_RESPONSE_BYTES = 1024 * 1024;
const TRANSIENT_RUNNER_STATUSES = new Set([408, 502, 503, 504]);
const RUNNER_FETCH_ATTEMPTS = 2;

export type GameSdkRemoteBundleDefinition = {
  manifest: GameSdkManifest;
  runtimeId: string;
  revision: string;
  serverBundleSha256: string;
  serverRuntimeUrl: string;
  serverRuntimeToken: string;
  effectJournal?: GameSdkEffectJournal;
  feedbackCapture?: GameSdkFeedbackCapture;
};

function safeResourceError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{1,99}$/.test(code)
    ? code
    : "GAME_SDK_RESOURCE_FAILED";
}

async function executeEffect(
  effect: GameSdkPortableEffectRequest,
  resources: Readonly<GameSdkPlatformResources>,
): Promise<GameSdkPortableEffectResult> {
  try {
    if (effect.resource === "contentSource") {
      const source = resources.contentSource;
      if (!source) throw new Error("GAME_SDK_CONTENT_SOURCE_UNAVAILABLE");
      if (effect.operation === "drawWords") {
        return { ok: true, value: await source.drawWords(effect.request as never) };
      }
      if (effect.operation === "drawWordPairs") {
        return { ok: true, value: await source.drawWordPairs(effect.request as never) };
      }
      if (effect.operation === "findDefinitions") {
        return { ok: true, value: await source.findDefinitions(effect.request as never) };
      }
    }
    if (effect.resource === "llm" && effect.operation === "generate") {
      if (!resources.llm) throw new Error("GAME_SDK_LLM_UNAVAILABLE");
      return { ok: true, value: await resources.llm.generate(effect.request as never) };
    }
    throw new Error("GAME_SDK_RESOURCE_EFFECT_UNSUPPORTED");
  } catch (error) {
    return { ok: false, error: safeResourceError(error) };
  }
}

function parseRunnerResponse(value: unknown): GameSdkPortableServerResponse {
  if (!value || typeof value !== "object" || typeof (value as { ok?: unknown }).ok !== "boolean") {
    throw new Error("GAME_SDK_REMOTE_RESPONSE_INVALID");
  }
  return value as GameSdkPortableServerResponse;
}

function parseBatchResponse(value: unknown): GameSdkPortableCommandBatchResponse {
  if (!value || typeof value !== "object" || typeof (value as { ok?: unknown }).ok !== "boolean") {
    throw new Error("GAME_SDK_REMOTE_RESPONSE_INVALID");
  }
  return value as GameSdkPortableCommandBatchResponse;
}

async function fetchRunnerResponse(
  definition: Pick<
    GameSdkRemoteBundleDefinition,
    "serverRuntimeToken" | "serverRuntimeUrl"
  >,
  request: GameSdkPortableServerRequest | GameSdkPortableCommandBatchRequest,
  fetchRunner: typeof fetch,
) {
  for (let attempt = 0; attempt < RUNNER_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchRunner(definition.serverRuntimeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${definition.serverRuntimeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      if (
        attempt + 1 < RUNNER_FETCH_ATTEMPTS
        && TRANSIENT_RUNNER_STATUSES.has(response.status)
      ) {
        continue;
      }
      return response;
    } catch {
      if (attempt + 1 >= RUNNER_FETCH_ATTEMPTS) {
        throw new Error("GAME_SDK_REMOTE_RUNNER_UNAVAILABLE");
      }
    }
  }
  throw new Error("GAME_SDK_REMOTE_RUNNER_UNAVAILABLE");
}

async function readRunnerPayload(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RUNNER_RESPONSE_BYTES) {
    throw new Error("GAME_SDK_REMOTE_RESPONSE_TOO_LARGE");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RUNNER_RESPONSE_BYTES) {
    throw new Error("GAME_SDK_REMOTE_RESPONSE_TOO_LARGE");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("GAME_SDK_REMOTE_RUNNER_AUTH_FAILED");
  }
  if (!response.ok) throw new Error("GAME_SDK_REMOTE_RUNNER_UNAVAILABLE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("GAME_SDK_REMOTE_RESPONSE_INVALID");
  }
}

export function createGameSdkRemoteServerModule(
  definition: GameSdkRemoteBundleDefinition,
  fetchRunner: typeof fetch = fetch,
): GameSdkServerModule<GameSdkStoredRoom, unknown, { type: string }, unknown> {
  const invoke = async (
    invocation: GameSdkPortableServerRequest["invocation"],
    resources: Readonly<GameSdkPlatformResources>,
  ) => {
    const effects: Record<string, GameSdkPortableEffectResult> = {};
    let llmEffects = 0;
    for (let pass = 0; pass <= MAX_RESOURCE_EFFECTS; pass += 1) {
      const request: GameSdkPortableServerRequest = {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation,
        effects,
      };
      const response = await fetchRunnerResponse(
        definition,
        request,
        fetchRunner,
      );
      const result = parseRunnerResponse(await readRunnerPayload(response));
      if (result.ok) return result.value;
      if ("error" in result) throw new Error(result.error);
      if (pass === MAX_RESOURCE_EFFECTS || effects[result.effect.id]) {
        throw new Error("GAME_SDK_RESOURCE_EFFECT_LIMIT");
      }
      if (invocation.operation === "presentRoom") {
        throw new Error("GAME_SDK_PRESENTATION_EFFECT_FORBIDDEN");
      }
      if (result.effect.resource === "llm") {
        llmEffects += 1;
        if (llmEffects > 1) {
          throw new Error("GAME_SDK_LLM_EFFECT_LIMIT");
        }
      }
      const invocationInput = invocation.input as {
        room?: { code?: unknown };
        context?: {
          requestId?: unknown;
          roomCode?: unknown;
        };
      };
      const requestId = invocationInput.context?.requestId;
      const roomCode = invocation.operation === "createRoom"
        ? invocationInput.context?.roomCode
        : invocationInput.room?.code;
      let effectResult: GameSdkPortableEffectResult;
      if (definition.effectJournal) {
        if (
          typeof requestId !== "string"
          || !requestId
          || typeof roomCode !== "string"
          || !roomCode
        ) {
          throw new Error("GAME_SDK_EFFECT_CONTEXT_INVALID");
        }
        effectResult = await definition.effectJournal.execute({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode,
          requestId,
          effect: result.effect,
        }, () => executeEffect(result.effect, resources));
      } else {
        effectResult = await executeEffect(result.effect, resources);
      }
      effects[result.effect.id] = effectResult;
      if (definition.feedbackCapture && result.effect.resource === "llm") {
        await definition.feedbackCapture.capture({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode: String(roomCode),
          requestId: String(requestId),
          effect: result.effect,
          result: effectResult,
        }).catch(() => undefined);
      }
    }
    throw new Error("GAME_SDK_RESOURCE_EFFECT_LIMIT");
  };

  const invokeCommandBatch = async (
    room: Readonly<GameSdkStoredRoom>,
    command: { type: string },
    commandContext: GameSdkCommandContext,
    presentationContext: GameSdkPresentationContext,
    timing?: GameSdkRuntimeTiming,
  ) => {
    const { resources } = commandContext;
    const trustedCommandContext = {
      actor: commandContext.actor,
      now: commandContext.now,
      requestId: commandContext.requestId,
    };
    const trustedPresentationContext = {
      viewer: presentationContext.viewer,
      now: presentationContext.now,
    };
    const effects: Record<string, GameSdkPortableEffectResult> = {};
    let llmEffects = 0;
    for (let pass = 0; pass <= MAX_RESOURCE_EFFECTS; pass += 1) {
      const apply: GameSdkPortableServerRequest & {
        invocation: Extract<
          GameSdkPortableServerRequest["invocation"],
          { operation: "applyCommand" }
        >;
      } = {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation: {
          operation: "applyCommand",
          input: {
            room,
            command,
            context: trustedCommandContext,
          },
        },
        effects,
      };
      const request: GameSdkPortableCommandBatchRequest = {
        kind: "game-fields-command-batch-v1",
        apply,
        presentationContext: trustedPresentationContext,
      };
      const runnerStartedAt = performance.now();
      const response = await fetchRunnerResponse(
        definition,
        request,
        fetchRunner,
      );
      timing?.record(
        "runner-call",
        Math.max(0, performance.now() - runnerStartedAt),
      );
      timing?.importServerTiming?.(response.headers.get("server-timing"));
      const result = parseBatchResponse(await readRunnerPayload(response));
      if (result.ok) {
        return result.value as { room: GameSdkStoredRoom; view: unknown };
      }
      if ("error" in result) throw new Error(result.error);
      if (result.phase === "present") {
        throw new Error("GAME_SDK_PRESENTATION_EFFECT_FORBIDDEN");
      }
      if (pass === MAX_RESOURCE_EFFECTS || effects[result.effect.id]) {
        throw new Error("GAME_SDK_RESOURCE_EFFECT_LIMIT");
      }
      if (result.effect.resource === "llm") {
        llmEffects += 1;
        if (llmEffects > 1) throw new Error("GAME_SDK_LLM_EFFECT_LIMIT");
      }
      let effectResult: GameSdkPortableEffectResult;
      if (definition.effectJournal) {
        effectResult = await definition.effectJournal.execute({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode: room.code,
          requestId: commandContext.requestId,
          effect: result.effect,
        }, () => executeEffect(result.effect, resources));
      } else {
        effectResult = await executeEffect(result.effect, resources);
      }
      effects[result.effect.id] = effectResult;
      if (definition.feedbackCapture && result.effect.resource === "llm") {
        await definition.feedbackCapture.capture({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode: room.code,
          requestId: commandContext.requestId,
          effect: result.effect,
          result: effectResult,
        }).catch(() => undefined);
      }
    }
    throw new Error("GAME_SDK_RESOURCE_EFFECT_LIMIT");
  };

  return {
    manifest: {
      ...definition.manifest,
      id: definition.runtimeId,
    },
    createRoom(input, context: GameSdkCreateContext) {
      const { resources, ...trustedContext } = context;
      return invoke({
        operation: "createRoom",
        input: { create: input, context: trustedContext },
      }, resources) as Promise<GameSdkStoredRoom>;
    },
    applyCommand(room, command, context: GameSdkCommandContext) {
      const { resources, ...trustedContext } = context;
      return invoke({
        operation: "applyCommand",
        input: { room, command, context: trustedContext },
      }, resources) as Promise<GameSdkStoredRoom>;
    },
    applyCommandAndPresent(
      room,
      command,
      commandContext,
      presentationContext,
      timing,
    ) {
      return invokeCommandBatch(
        room,
        command,
        commandContext,
        presentationContext,
        timing,
      );
    },
    presentRoom(room, context: GameSdkPresentationContext) {
      const { resources, ...trustedContext } = context;
      return invoke({
        operation: "presentRoom",
        input: { room, context: trustedContext },
      }, resources);
    },
  };
}
