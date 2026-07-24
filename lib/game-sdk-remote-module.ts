import type {
  GameSdkManifest,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type {
  GameSdkCommandContext,
  GameSdkCreateContext,
  GameSdkPresentationContext,
  GameSdkServerModule,
} from "@game-fields/game-sdk/runtime";
import type { GameSdkPlatformResources } from "@game-fields/game-sdk/resources";
import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
  type GameSdkPortableEffectRequest,
  type GameSdkPortableEffectResult,
  type GameSdkPortableServerRequest,
  type GameSdkPortableServerResponse,
} from "@game-fields/game-sdk/portable-server";

const MAX_RESOURCE_EFFECTS = 8;
const MAX_RUNNER_RESPONSE_BYTES = 1024 * 1024;

export type GameSdkRemoteBundleDefinition = {
  manifest: GameSdkManifest;
  runtimeId: string;
  revision: string;
  serverBundleSha256: string;
  serverRuntimeUrl: string;
  serverRuntimeToken: string;
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

export function createGameSdkRemoteServerModule(
  definition: GameSdkRemoteBundleDefinition,
  fetchRunner: typeof fetch = fetch,
): GameSdkServerModule<GameSdkStoredRoom, unknown, { type: string }, unknown> {
  const invoke = async (
    invocation: GameSdkPortableServerRequest["invocation"],
    resources: Readonly<GameSdkPlatformResources>,
  ) => {
    const effects: Record<string, GameSdkPortableEffectResult> = {};
    for (let pass = 0; pass <= MAX_RESOURCE_EFFECTS; pass += 1) {
      const request: GameSdkPortableServerRequest = {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation,
        effects,
      };
      const response = await fetchRunner(definition.serverRuntimeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${definition.serverRuntimeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RUNNER_RESPONSE_BYTES) {
        throw new Error("GAME_SDK_REMOTE_RESPONSE_TOO_LARGE");
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RUNNER_RESPONSE_BYTES) {
        throw new Error("GAME_SDK_REMOTE_RESPONSE_TOO_LARGE");
      }
      if (!response.ok) throw new Error("GAME_SDK_REMOTE_RUNNER_UNAVAILABLE");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("GAME_SDK_REMOTE_RESPONSE_INVALID");
      }
      const result = parseRunnerResponse(payload);
      if (result.ok) return result.value;
      if ("error" in result) throw new Error(result.error);
      if (pass === MAX_RESOURCE_EFFECTS || effects[result.effect.id]) {
        throw new Error("GAME_SDK_RESOURCE_EFFECT_LIMIT");
      }
      effects[result.effect.id] = await executeEffect(result.effect, resources);
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
    presentRoom(room, context: GameSdkPresentationContext) {
      const { resources, ...trustedContext } = context;
      return invoke({
        operation: "presentRoom",
        input: { room, context: trustedContext },
      }, resources);
    },
  };
}
