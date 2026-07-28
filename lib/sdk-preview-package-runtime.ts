import { createHash } from "node:crypto";
import {
  GAME_SDK_VERSION,
  type GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type { GameSdkServerModule } from "@game-fields/game-sdk/runtime";
import type { GameSdkPlatformResources } from "@game-fields/game-sdk/resources";
import { createGameFieldsSdkContentSource } from "./game-sdk-content-source.ts";
import {
  createGameFieldsSdkLlmGateway,
  enforceGameSdkLlmRateLimit,
} from "./game-sdk-llm-gateway.ts";
import { createGameSdkRemoteServerModule } from "./game-sdk-remote-module.ts";
import { createRemoteGameSdkRuntimeContract } from "./game-sdk-runtime-contract.ts";
import { createRedisGameSdkEffectJournal } from "./game-sdk-effect-journal.ts";
import { createRedisGameSdkFeedbackCapture } from "./game-sdk-feedback-store.ts";
import { gameSdkPlatformResourcePolicy } from "./game-sdk-platform-resource-policy.ts";
import {
  loadSdkPreviewRuntimeDefinition,
  type SdkPreviewRuntimeDefinition,
} from "./sdk-preview-runtime-source.ts";

const observedSdkVersionDriftBundles = new Set<string>();

export type SdkVersionDriftObservation = {
  creatorSlug: string;
  gameId: string;
  revision: string;
  serverBundleSha256: string;
  bundleSdkVersion: number;
  platformSdkVersion: number;
};

export function sdkVersionDriftObservation(input: {
  creatorSlug: string;
  gameId: string;
  definition: SdkPreviewRuntimeDefinition;
}): SdkVersionDriftObservation | null {
  const { definition } = input;
  if (
    definition.runtimeKind !== "package"
    || !definition.manifest
    || !definition.revision
    || !definition.serverBundleSha256
    || definition.manifest.sdkVersion >= GAME_SDK_VERSION
  ) {
    return null;
  }
  return {
    creatorSlug: input.creatorSlug,
    gameId: input.gameId,
    revision: definition.revision,
    serverBundleSha256: definition.serverBundleSha256,
    bundleSdkVersion: definition.manifest.sdkVersion,
    platformSdkVersion: GAME_SDK_VERSION,
  };
}

export function observeSdkVersionDrift(input: {
  creatorSlug: string;
  gameId: string;
  definition: SdkPreviewRuntimeDefinition;
}) {
  const observation = sdkVersionDriftObservation(input);
  if (!observation) return false;
  const key = [
    observation.creatorSlug,
    observation.gameId,
    observation.revision,
    observation.serverBundleSha256,
    observation.bundleSdkVersion,
    observation.platformSdkVersion,
  ].join(":");
  if (observedSdkVersionDriftBundles.has(key)) return false;
  observedSdkVersionDriftBundles.add(key);
  console.warn(JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "warning",
    event: "game_sdk.bundle_version_drift",
    service: "game-fields-sdk-preview",
    environment: process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "production"
      : "development",
    fields: observation,
  }));
  return true;
}

export function sdkPreviewPackageRuntimeId(
  creatorSlug: string,
  gameId: string,
) {
  const digest = createHash("sha256")
    .update(`${creatorSlug}/${gameId}`)
    .digest("hex")
    .slice(0, 24);
  return `preview-${digest}`;
}

export async function loadSdkPreviewPackageModule(input: {
  creatorSlug: string;
  gameId: string;
  request: Request;
  playerId: string;
  revision?: string;
}): Promise<{
  definition: SdkPreviewRuntimeDefinition;
  module: GameSdkServerModule<GameSdkStoredRoom, unknown, { type: string }, unknown>;
  resources: GameSdkPlatformResources;
  roomScopeId: string;
  runtimeContract: ReturnType<typeof createRemoteGameSdkRuntimeContract>;
} | null> {
  const definition = await loadSdkPreviewRuntimeDefinition(
    input.creatorSlug,
    input.gameId,
    fetch,
    process.env,
    input.revision,
  );
  if (
    !definition
    || definition.runtimeKind !== "package"
    || !definition.manifest
    || !definition.revision
    || !definition.serverRuntimeUrl
    || !definition.serverRuntimeToken
    || !definition.serverBundleSha256
    || !definition.packageRootSha256
  ) {
    return null;
  }
  observeSdkVersionDrift({
    creatorSlug: input.creatorSlug,
    gameId: input.gameId,
    definition,
  });
  const resourcePolicy = gameSdkPlatformResourcePolicy(
    definition.manifest,
    definition.modulePolicy,
  );
  const remoteModule = createGameSdkRemoteServerModule({
    manifest: definition.manifest,
    runtimeId: sdkPreviewPackageRuntimeId(
      input.creatorSlug,
      input.gameId,
    ),
    revision: definition.revision,
    serverBundleSha256: definition.serverBundleSha256,
    serverRuntimeUrl: definition.serverRuntimeUrl,
    serverRuntimeToken: definition.serverRuntimeToken,
    effectJournal: createRedisGameSdkEffectJournal("candidate-preview"),
    ...(resourcePolicy.feedback ? {
      feedbackCapture: createRedisGameSdkFeedbackCapture(
        input.gameId,
        "candidate-preview",
      ),
    } : {}),
  });
  return {
    definition,
    module: remoteModule,
    roomScopeId: sdkPreviewPackageRuntimeId(
      input.creatorSlug,
      input.gameId,
    ),
    runtimeContract: createRemoteGameSdkRuntimeContract({
      revision: definition.revision,
      packageRootSha256: definition.packageRootSha256,
    }),
    resources: {
      ...(resourcePolicy.contentSource ? {
        contentSource: createGameFieldsSdkContentSource(),
      } : {}),
      ...(resourcePolicy.llm ? {
        llm: createGameFieldsSdkLlmGateway({
          gameId: input.gameId,
          allowHighQuality: false,
          beforeGenerate: () => enforceGameSdkLlmRateLimit(
            input.request,
            input.playerId,
            input.gameId,
          ),
        }),
      } : {}),
    },
  };
}
