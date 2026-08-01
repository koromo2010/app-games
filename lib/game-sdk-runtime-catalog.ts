import {
  assertGameManifest,
  type GameSdkManifest,
} from "@game-fields/game-sdk";
import {
  normalizeGameSdkModuleProfile,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import type { GameCatalogEntry, GameTag } from "@/app/games/game-catalog";
import type {
  GameFieldsAuthenticatedIdentity,
  GameFieldsPlatformResultOutboxEntry,
} from "@game-fields/game-runtime";
import { createGameFieldsSdkContentSource } from "./game-sdk-content-source.ts";
import {
  createAuthenticatedGameSdkPlatformAdapter,
} from "./game-sdk-platform-adapter.ts";
import {
  createGameFieldsSdkLlmGateway,
  enforceGameSdkLlmRateLimit,
} from "./game-sdk-llm-gateway.ts";
import { createGameSdkRemoteServerModule } from "./game-sdk-remote-module.ts";
import { createRemoteGameSdkRuntimeContract } from "./game-sdk-runtime-contract.ts";
import { createRedisGameSdkEffectJournal } from "./game-sdk-effect-journal.ts";
import { createRedisGameSdkFeedbackCapture } from "./game-sdk-feedback-store.ts";
import { gameSdkPlatformResourcePolicy } from "./game-sdk-platform-resource-policy.ts";
import type {
  ApprovedGameSdkRegistration,
  ApprovedGameSdkRoomAdapter,
} from "./game-sdk-server-registry.ts";
import {
  isSdkPreviewRuntimeUrl,
  sdkPortalInternalBaseUrl,
} from "./sdk-preview-runtime-source.ts";
import { sdkServiceHeaders } from "./sdk-service-auth.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";
import {
  resolveApprovedSdkGamePresentation,
} from "../config/sdk-game-presentations.ts";

type RuntimeCatalogChannel = "development" | "main";

type RuntimeCatalogPayload = {
  creatorSlug: string;
  sourceGameId: string;
  gameId: string;
  title: string;
  revision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: GameSdkManifest;
  moduleProfile: GameSdkModuleProfile;
  channel: RuntimeCatalogChannel;
  clientRuntimeUrl: string;
  serverRuntimeUrl: string;
  serverRuntimeToken: string;
  serverRuntimeExpiresAt: number;
};

function deploymentChannel(env: NodeJS.ProcessEnv) {
  return expectedAppEnvironment(
    env.VERCEL_ENV,
    env.NODE_ENV,
    env.VERCEL_GIT_COMMIT_REF,
  ) === "production"
    ? "main" as const
    : "development" as const;
}

type RuntimeCatalogListPayload = {
  channel: RuntimeCatalogChannel;
  games: Array<{
    id: string;
    description: string;
    revision: string;
    packageRootSha256: string;
    serverBundleSha256: string;
    appSetSourceSha256: string;
    manifest: GameSdkManifest;
    modulePolicy: unknown;
  }>;
};

function catalogTag(manifest: GameSdkManifest): GameTag {
  if (manifest.minimumPlayers === 1 && manifest.maximumPlayers === 1) {
    return "推理";
  }
  return "対戦";
}

function validCatalogListPayload(
  value: unknown,
  expectedChannel: RuntimeCatalogChannel,
): value is RuntimeCatalogListPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<RuntimeCatalogListPayload>;
  if (payload.channel !== expectedChannel || !Array.isArray(payload.games)) {
    return false;
  }
  return payload.games.every((game) => {
    if (
      !game
      || typeof game !== "object"
      || !/^[a-z][a-z0-9-]{1,63}$/.test(game.id)
      || typeof game.description !== "string"
      || !/^[a-f0-9]{40}$/.test(game.revision)
      || !/^[a-f0-9]{64}$/.test(game.packageRootSha256)
      || !/^[a-f0-9]{64}$/.test(game.serverBundleSha256)
      || !/^[a-f0-9]{64}$/.test(game.appSetSourceSha256)
      || !game.modulePolicy
      || typeof game.modulePolicy !== "object"
      || Array.isArray(game.modulePolicy)
    ) return false;
    try {
      assertGameManifest(game.manifest);
    } catch {
      return false;
    }
    return true;
  });
}

export async function loadApprovedGameSdkCatalog(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GameCatalogEntry[]> {
  const channel = deploymentChannel(env);
  const url = `${sdkPortalInternalBaseUrl(env)}/api/runtime-catalog?channel=${channel}`;
  const response = await fetch(url, {
    headers: sdkServiceHeaders("GET", url),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GAME_SDK_RUNTIME_CATALOG_UNAVAILABLE");
  const payload = await response.json() as unknown;
  if (!validCatalogListPayload(payload, channel)) {
    throw new Error("GAME_SDK_RUNTIME_CATALOG_INVALID");
  }
  return payload.games.map((game) => {
    const moduleProfile = normalizeGameSdkModuleProfile(game.modulePolicy);
    const presentation = resolveApprovedSdkGamePresentation({
      gameId: game.id,
      fallbackTitle: game.manifest.title,
    });
    return {
      id: game.id,
      title: presentation.title.ja,
      englishTitle: presentation.title.en,
      visual: presentation.visual,
      tags: [catalogTag(game.manifest)],
      href: `/sdk-games/${game.id}`,
      players: game.manifest.minimumPlayers === game.manifest.maximumPlayers
        ? String(game.manifest.minimumPlayers)
        : `${game.manifest.minimumPlayers}–${game.manifest.maximumPlayers}`,
      time: "未計測",
      summary: game.description.trim().slice(0, 240)
        || presentation.title.ja,
      accent: "from-cyan-300 via-emerald-200 to-amber-200",
      private: false,
      stats: moduleProfile.stats.mode === "required"
        ? "account"
        : "local-disabled",
    };
  });
}

function validCatalogPayload(
  value: unknown,
  expectedGameId: string,
  expectedChannel: RuntimeCatalogChannel,
  env: NodeJS.ProcessEnv,
): value is RuntimeCatalogPayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RuntimeCatalogPayload>;
  if (
    item.gameId !== expectedGameId
    || item.channel !== expectedChannel
    || typeof item.creatorSlug !== "string"
    || !/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(item.creatorSlug)
    || typeof item.sourceGameId !== "string"
    || !/^[a-z][a-z0-9-]{1,63}$/.test(item.sourceGameId)
    || typeof item.revision !== "string"
    || !/^[a-f0-9]{40}$/.test(item.revision)
    || typeof item.packageRootSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(item.packageRootSha256)
    || typeof item.serverBundleSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(item.serverBundleSha256)
    || typeof item.appSetSourceSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(item.appSetSourceSha256)
    || typeof item.serverRuntimeToken !== "string"
    || !item.serverRuntimeToken
    || typeof item.serverRuntimeExpiresAt !== "number"
    || item.serverRuntimeExpiresAt <= Date.now()
    || !item.manifest
    || !item.moduleProfile
    || typeof item.moduleProfile !== "object"
    || Array.isArray(item.moduleProfile)
  ) return false;
  if (
    !isSdkPreviewRuntimeUrl(
      item.clientRuntimeUrl,
      `/package-open/${item.creatorSlug}/${item.sourceGameId}/${item.revision}`,
      { allowTokenFragment: true, env },
    )
    || !isSdkPreviewRuntimeUrl(
      item.serverRuntimeUrl,
      `/server/${item.creatorSlug}/${item.sourceGameId}/${item.revision}`,
      { env },
    )
  ) return false;
  try {
    assertGameManifest(item.manifest);
  } catch {
    return false;
  }
  return item.manifest.id === item.sourceGameId;
}

async function loadRuntimeCatalogPayload(
  gameId: string,
  channel: RuntimeCatalogChannel,
  env: NodeJS.ProcessEnv,
  revision?: string,
) {
  const url = `${sdkPortalInternalBaseUrl(env)}/api/runtime-catalog/${gameId}?channel=${channel}${
    revision ? `&revision=${encodeURIComponent(revision)}` : ""
  }`;
  const response = await fetch(url, {
    headers: sdkServiceHeaders("GET", url),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("GAME_SDK_RUNTIME_CATALOG_UNAVAILABLE");
  const payload = await response.json() as unknown;
  if (!validCatalogPayload(payload, gameId, channel, env)) {
    throw new Error("GAME_SDK_RUNTIME_CATALOG_INVALID");
  }
  return {
    ...payload,
    moduleProfile: normalizeGameSdkModuleProfile(payload.moduleProfile),
  };
}

function remoteModule(payload: RuntimeCatalogPayload, runtimeId: string) {
  const resourcePolicy = gameSdkPlatformResourcePolicy(
    payload.manifest,
    payload.moduleProfile,
  );
  return createGameSdkRemoteServerModule({
    manifest: payload.manifest,
    runtimeId,
    revision: payload.revision,
    serverBundleSha256: payload.serverBundleSha256,
    serverRuntimeUrl: payload.serverRuntimeUrl,
    serverRuntimeToken: payload.serverRuntimeToken,
    effectJournal: createRedisGameSdkEffectJournal(),
    ...(resourcePolicy.feedback ? {
      feedbackCapture: createRedisGameSdkFeedbackCapture(payload.gameId),
    } : {}),
  });
}

function runtimeResources(
  gameId: string,
  request: Request,
  playerId: string,
  payload: Pick<RuntimeCatalogPayload, "manifest" | "moduleProfile">,
) {
  const resourcePolicy = gameSdkPlatformResourcePolicy(
    payload.manifest,
    payload.moduleProfile,
  );
  return {
    ...(resourcePolicy.contentSource ? {
      contentSource: createGameFieldsSdkContentSource(),
    } : {}),
    ...(resourcePolicy.llm ? {
      llm: createGameFieldsSdkLlmGateway({
        gameId,
        allowHighQuality: false,
        beforeGenerate: () => enforceGameSdkLlmRateLimit(
          request,
          playerId,
          gameId,
        ),
      }),
    } : {}),
  };
}

function resultPersistence(
  gameId: string,
  payload: RuntimeCatalogPayload,
) {
  const presentation = resolveApprovedSdkGamePresentation({
    gameId,
    fallbackTitle: payload.manifest.title,
  });
  const moduleRequired = (id: keyof GameSdkModuleProfile) => (
    payload.moduleProfile[id].mode === "required"
  );
  return async (result: Readonly<GameFieldsPlatformResultOutboxEntry>) => {
    const { persistApprovedGameSdkResultEvent } = await import(
      "./game-sdk-result-persistence.ts"
    );
    await persistApprovedGameSdkResultEvent({
      gameType: `sdk:${gameId}`,
      title: presentation.title.ja,
      supportsStats: moduleRequired("stats"),
      supportsRating: payload.manifest.supportsRating
        && moduleRequired("rating"),
      supportsReplay: payload.manifest.supportsReplay
        && moduleRequired("replay"),
      result,
    });
  };
}

export async function loadApprovedGameSdkRuntimeRegistration(
  gameIdInput: string,
  env: NodeJS.ProcessEnv = process.env,
  revision?: string,
): Promise<ApprovedGameSdkRegistration | null> {
  const gameId = gameIdInput.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(gameId)) return null;
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) return null;
  const channel = deploymentChannel(env);
  const payload = await loadRuntimeCatalogPayload(
    gameId,
    channel,
    env,
    revision,
  );
  if (!payload) return null;
  const presentation = resolveApprovedSdkGamePresentation({
    gameId,
    fallbackTitle: payload.manifest.title,
  });
  const currentModule = remoteModule(payload, gameId);
  const moduleRequired = (id: keyof GameSdkModuleProfile) => (
    payload.moduleProfile[id].mode === "required"
  );
  const currentContract = createRemoteGameSdkRuntimeContract({
    revision: payload.revision,
    packageRootSha256: payload.packageRootSha256,
  });
  return {
    id: gameId,
    title: presentation.title.ja,
    clientKind: "iframe-package",
    clientRuntimeUrl: payload.clientRuntimeUrl,
    deployment: "main",
    revision: payload.revision,
    packageRootSha256: payload.packageRootSha256,
    serverBundleSha256: payload.serverBundleSha256,
    appSetSourceSha256: payload.appSetSourceSha256,
    supportsDebug: payload.manifest.supportsDebug
      && moduleRequired("debug"),
    supportsSpectators: payload.manifest.supportsSpectators
      && moduleRequired("spectators"),
    supportsReplay: payload.manifest.supportsReplay
      && moduleRequired("replay"),
    supportsRating: payload.manifest.supportsRating
      && moduleRequired("rating"),
    usesLlm: payload.manifest.usesLlm
      && moduleRequired("llm"),
    moduleProfile: payload.moduleProfile,
    settings: payload.manifest.settings ?? [],
    rules: (payload.manifest.rules ?? []).map((rule) => rule.ja),
    createAdapter(
      resolveIdentity: () => Promise<GameFieldsAuthenticatedIdentity>,
      adapterRequest: Request,
      playerId: string,
    ) {
      return createAuthenticatedGameSdkPlatformAdapter({
        module: currentModule,
        runtimeContract: currentContract,
        allowActiveRoomPackageRevisionReplacement: true,
        async resolveRuntime(contract) {
          const pinned = await loadRuntimeCatalogPayload(
            gameId,
            channel,
            env,
            contract.packageRevision,
          );
          if (!pinned) return null;
          return {
            module: remoteModule(pinned, gameId),
            runtimeContract: createRemoteGameSdkRuntimeContract({
              revision: pinned.revision,
              packageRootSha256: pinned.packageRootSha256,
            }),
            moduleProfile: pinned.moduleProfile,
            resources: runtimeResources(
              gameId,
              adapterRequest,
              playerId,
              pinned,
            ),
            onResultConfirmed: resultPersistence(gameId, pinned),
          };
        },
        resolveIdentity,
        moduleProfile: payload.moduleProfile,
        resources: runtimeResources(
          gameId,
          adapterRequest,
          playerId,
          payload,
        ),
        onResultConfirmed: resultPersistence(gameId, payload),
      }) as unknown as ApprovedGameSdkRoomAdapter;
    },
  };
}
