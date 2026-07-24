import type {
  GameSdkCommandContext,
  GameSdkCreateContext,
  GameSdkPresentationContext,
  GameSdkServerModule,
} from "./runtime.js";
import type { GameSdkStoredRoom } from "./index.js";
import type { GameSdkPlatformResources } from "./resources.js";

export const GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION = 1 as const;
export const GAME_SDK_PORTABLE_SERVER_GLOBAL = "GameFieldsServerBundle" as const;

export type GameSdkPortableResource = "contentSource" | "llm";
export type GameSdkPortableResourceOperation =
  | "drawWords"
  | "drawWordPairs"
  | "findDefinitions"
  | "generate";

export type GameSdkPortableEffectRequest = {
  id: string;
  resource: GameSdkPortableResource;
  operation: GameSdkPortableResourceOperation;
  request: unknown;
};

export type GameSdkPortableEffectResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

type PortableInvocation =
  | {
      operation: "manifest";
      input?: never;
    }
  | {
      operation: "createRoom";
      input: {
        create: unknown;
        context: Omit<GameSdkCreateContext, "resources">;
      };
    }
  | {
      operation: "applyCommand";
      input: {
        room: unknown;
        command: unknown;
        context: Omit<GameSdkCommandContext, "resources">;
      };
    }
  | {
      operation: "presentRoom";
      input: {
        room: unknown;
        context: Omit<GameSdkPresentationContext, "resources">;
      };
    };

export type GameSdkPortableServerRequest = {
  version: typeof GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION;
  invocation: PortableInvocation;
  effects?: Readonly<Record<string, GameSdkPortableEffectResult>>;
};

export type GameSdkPortableServerResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: string }
  | { ok: false; effect: GameSdkPortableEffectRequest };

export type GameSdkPortableServerGlobal = {
  protocolVersion: typeof GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION;
  invoke(requestJson: string): Promise<string>;
};

function portableErrorCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{1,99}$/.test(candidate)
    ? candidate
    : "GAME_SDK_SERVER_EXECUTION_FAILED";
}

function effectId(
  resource: GameSdkPortableResource,
  operation: GameSdkPortableResourceOperation,
  request: unknown,
) {
  return `${resource}:${operation}:${JSON.stringify(request)}`;
}

function portableResources(
  cachedEffects: Readonly<Record<string, GameSdkPortableEffectResult>>,
  pending: GameSdkPortableEffectRequest[],
): Readonly<GameSdkPlatformResources> {
  const execute = async (
    resource: GameSdkPortableResource,
    operation: GameSdkPortableResourceOperation,
    request: unknown,
  ) => {
    const id = effectId(resource, operation, request);
    const cached = cachedEffects[id];
    if (!cached) {
      pending.push({ id, resource, operation, request });
      throw new Error("GAME_SDK_RESOURCE_EFFECT_REQUIRED");
    }
    if (!cached.ok) throw new Error(cached.error);
    return cached.value;
  };

  return {
    contentSource: {
      drawWords: (request) => execute("contentSource", "drawWords", request) as never,
      drawWordPairs: (request) => execute("contentSource", "drawWordPairs", request) as never,
      findDefinitions: (request) => execute("contentSource", "findDefinitions", request) as never,
    },
    llm: {
      generate: (request) => execute("llm", "generate", request) as never,
    },
  };
}

function assertPortableRequest(value: unknown): asserts value is GameSdkPortableServerRequest {
  if (!value || typeof value !== "object") throw new Error("GAME_SDK_PORTABLE_INVALID_REQUEST");
  const request = value as Partial<GameSdkPortableServerRequest>;
  if (
    request.version !== GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION
    || !request.invocation
    || typeof request.invocation !== "object"
    || !["manifest", "createRoom", "applyCommand", "presentRoom"].includes(
      String(request.invocation.operation),
    )
  ) {
    throw new Error("GAME_SDK_PORTABLE_INVALID_REQUEST");
  }
}

/**
 * Installs one compiled game module into the isolated server bundle.
 *
 * The bundle never receives platform credentials or adapters. Privileged work
 * is represented as a deterministic effect request and executed by the trusted
 * platform outside the guest VM before the invocation is retried.
 */
export function installGameSdkPortableServer<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>(
  serverModule: GameSdkServerModule<
    TRoom,
    TCreateInput,
    TCommand,
    TRoomView
  >,
) {
  const portableGlobal: GameSdkPortableServerGlobal = {
    protocolVersion: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
    async invoke(requestJson) {
      const pending: GameSdkPortableEffectRequest[] = [];
      try {
        const parsed = JSON.parse(requestJson) as unknown;
        assertPortableRequest(parsed);
        const effects = parsed.effects ?? {};
        const resources = portableResources(effects, pending);
        let value: unknown;
        if (parsed.invocation.operation === "manifest") {
          value = serverModule.manifest;
        } else if (parsed.invocation.operation === "createRoom") {
          value = await serverModule.createRoom(
            parsed.invocation.input.create as TCreateInput,
            { ...parsed.invocation.input.context, resources },
          );
        } else if (parsed.invocation.operation === "applyCommand") {
          value = await serverModule.applyCommand(
            parsed.invocation.input.room as TRoom,
            parsed.invocation.input.command as TCommand,
            { ...parsed.invocation.input.context, resources },
          );
        } else {
          value = await serverModule.presentRoom(
            parsed.invocation.input.room as TRoom,
            { ...parsed.invocation.input.context, resources },
          );
        }
        if (pending[0]) {
          return JSON.stringify({ ok: false, effect: pending[0] });
        }
        return JSON.stringify({ ok: true, value });
      } catch (error) {
        if (pending[0]) {
          return JSON.stringify({ ok: false, effect: pending[0] });
        }
        return JSON.stringify({ ok: false, error: portableErrorCode(error) });
      }
    },
  };

  (globalThis as typeof globalThis & {
    [GAME_SDK_PORTABLE_SERVER_GLOBAL]?: GameSdkPortableServerGlobal;
  })[GAME_SDK_PORTABLE_SERVER_GLOBAL] = portableGlobal;
}
