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
import {
  createGameSdkRunnerInvocationBudget,
  invokeGameSdkRunner,
  runWithinGameSdkRunnerBudget,
  type GameSdkRunnerClientEvent,
  type GameSdkRunnerOperation,
  type GameSdkRunnerResilienceOptions,
} from "./game-sdk-runner-client.ts";
import { emitObservabilityEvent } from "./observability/index.ts";

const MAX_RESOURCE_EFFECTS = 8;

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

function timingHeaders(timing: GameSdkRuntimeTiming | undefined) {
  const candidate = timing as (GameSdkRuntimeTiming & {
    correlationHeaders?: () => Record<string, string>;
  }) | undefined;
  return candidate?.correlationHeaders?.() ?? {};
}

function importArtifactCacheOutcome(
  response: Response,
  timing: GameSdkRuntimeTiming | undefined,
) {
  timing?.setArtifactCacheOutcome?.(
    response.headers.get("x-game-sdk-artifact-cache"),
  );
}

function runnerOperation(
  operation: GameSdkPortableServerRequest["invocation"]["operation"],
  effectPass: boolean,
): GameSdkRunnerOperation {
  if (effectPass) return "resource-effect-pass";
  if (operation === "createRoom") return "create-room";
  if (operation === "applyCommand") return "apply-command";
  return "present-room";
}

function runnerRequestIdentity(
  invocation: GameSdkPortableServerRequest["invocation"],
) {
  const input = invocation.input as {
    context?: { requestId?: unknown };
  };
  return typeof input.context?.requestId === "string"
    ? input.context.requestId
    : undefined;
}

function observeRunnerEvent(runtimeId: string, event: GameSdkRunnerClientEvent) {
  if (event.type === "attempt" && event.attempt === 1) return;
  const breakerEvent = event.type.startsWith("breaker-");
  const outcome = event.type === "breaker-closed"
    ? "success" as const
    : event.type === "breaker-half-open" || event.type === "attempt"
      ? "started" as const
      : "failed" as const;
  emitObservabilityEvent(
    event.type === "failure" || event.type === "breaker-open" ? "warn" : "info",
    breakerEvent ? "game-sdk.runner-breaker" : "game-sdk.runner-dependency",
    {
      game: `sdk:${runtimeId}`,
      operation: event.operation,
      action: event.type,
      ...(event.state ? { phase: event.state } : {}),
      ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
      ...(event.statusCode === undefined ? {} : { statusCode: event.statusCode }),
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      outcome,
    },
  );
}

export function createGameSdkRemoteServerModule(
  definition: GameSdkRemoteBundleDefinition,
  fetchRunner: typeof fetch = fetch,
  resilience: GameSdkRunnerResilienceOptions = {},
): GameSdkServerModule<GameSdkStoredRoom, unknown, { type: string }, unknown> {
  const runnerResilience: GameSdkRunnerResilienceOptions = {
    ...resilience,
    onEvent(event) {
      observeRunnerEvent(definition.runtimeId, event);
      resilience.onEvent?.(event);
    },
  };
  const invoke = async (
    invocation: GameSdkPortableServerRequest["invocation"],
    resources: Readonly<GameSdkPlatformResources>,
  ) => {
    const budget = createGameSdkRunnerInvocationBudget(runnerResilience);
    const effects: Record<string, GameSdkPortableEffectResult> = {};
    let llmEffects = 0;
    for (let pass = 0; pass <= MAX_RESOURCE_EFFECTS; pass += 1) {
      const request: GameSdkPortableServerRequest = {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation,
        effects,
      };
      const { payload } = await invokeGameSdkRunner({
        url: definition.serverRuntimeUrl,
        token: definition.serverRuntimeToken,
        artifactIdentity: definition.serverBundleSha256,
        operation: runnerOperation(invocation.operation, pass > 0),
        request,
        requestId: runnerRequestIdentity(invocation),
        fetchRunner,
        budget,
        resilience: runnerResilience,
      });
      const result = parseRunnerResponse(payload);
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
      if (
        typeof requestId !== "string"
        || !requestId
        || typeof roomCode !== "string"
        || !roomCode
      ) {
        throw new Error("GAME_SDK_EFFECT_CONTEXT_INVALID");
      }
      if (!definition.effectJournal) {
        throw new Error("GAME_SDK_EFFECT_JOURNAL_MISSING");
      }
      const effectResult = await runWithinGameSdkRunnerBudget(
        budget,
        () => definition.effectJournal!.execute({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode,
          requestId,
          effect: result.effect,
        }, () => executeEffect(result.effect, resources)),
        "GAME_SDK_EFFECT_INDETERMINATE",
      );
      effects[result.effect.id] = effectResult;
      if (definition.feedbackCapture && result.effect.resource === "llm") {
        await runWithinGameSdkRunnerBudget(
          budget,
          () => definition.feedbackCapture!.capture({
            runtimeId: definition.runtimeId,
            packageRevision: definition.revision,
            roomCode,
            requestId,
            effect: result.effect,
            result: effectResult,
          }),
          "GAME_SDK_FEEDBACK_CAPTURE_TIMEOUT",
        ).catch(() => undefined);
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
    const budget = createGameSdkRunnerInvocationBudget(runnerResilience);
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
      const { response, payload } = await invokeGameSdkRunner({
        url: definition.serverRuntimeUrl,
        token: definition.serverRuntimeToken,
        artifactIdentity: definition.serverBundleSha256,
        operation: pass === 0
          ? "apply-command-and-present"
          : "resource-effect-pass",
        request,
        requestId: commandContext.requestId,
        headers: timingHeaders(timing),
        fetchRunner,
        budget,
        resilience: runnerResilience,
      });
      importArtifactCacheOutcome(response, timing);
      timing?.record(
        "runner-call",
        Math.max(0, performance.now() - runnerStartedAt),
      );
      timing?.importServerTiming?.(response.headers.get("server-timing"));
      const result = parseBatchResponse(payload);
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
      if (!definition.effectJournal) {
        throw new Error("GAME_SDK_EFFECT_JOURNAL_MISSING");
      }
      const effectResult = await runWithinGameSdkRunnerBudget(
        budget,
        () => definition.effectJournal!.execute({
          runtimeId: definition.runtimeId,
          packageRevision: definition.revision,
          roomCode: room.code,
          requestId: commandContext.requestId,
          effect: result.effect,
        }, () => executeEffect(result.effect, resources)),
        "GAME_SDK_EFFECT_INDETERMINATE",
      );
      effects[result.effect.id] = effectResult;
      if (definition.feedbackCapture && result.effect.resource === "llm") {
        await runWithinGameSdkRunnerBudget(
          budget,
          () => definition.feedbackCapture!.capture({
            runtimeId: definition.runtimeId,
            packageRevision: definition.revision,
            roomCode: room.code,
            requestId: commandContext.requestId,
            effect: result.effect,
            result: effectResult,
          }),
          "GAME_SDK_FEEDBACK_CAPTURE_TIMEOUT",
        ).catch(() => undefined);
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
