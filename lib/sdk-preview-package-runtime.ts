import { createHash } from "node:crypto";
import type { GameSdkStoredRoom } from "@game-fields/game-sdk";
import type { GameSdkServerModule } from "@game-fields/game-sdk/runtime";
import { createGameFieldsSdkContentSource } from "./game-sdk-content-source.ts";
import {
  createGameFieldsSdkLlmGateway,
  enforceGameSdkLlmRateLimit,
} from "./game-sdk-llm-gateway.ts";
import { createGameSdkRemoteServerModule } from "./game-sdk-remote-module.ts";
import { createRemoteGameSdkRuntimeContract } from "./game-sdk-runtime-contract.ts";
import { createRedisGameSdkEffectJournal } from "./game-sdk-effect-journal.ts";
import {
  loadSdkPreviewRuntimeDefinition,
  type SdkPreviewRuntimeDefinition,
} from "./sdk-preview-runtime-source.ts";

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
  resources: {
    contentSource: ReturnType<typeof createGameFieldsSdkContentSource>;
    llm: ReturnType<typeof createGameFieldsSdkLlmGateway>;
  };
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
      contentSource: createGameFieldsSdkContentSource(),
      llm: createGameFieldsSdkLlmGateway({
        gameId: input.gameId,
        allowHighQuality: false,
        beforeGenerate: () => enforceGameSdkLlmRateLimit(
          input.request,
          input.playerId,
          input.gameId,
        ),
      }),
    },
  };
}
