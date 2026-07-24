import type { GameSdkSettingDefinition } from "@game-fields/game-sdk";
import type { GameFieldsAuthenticatedIdentity } from "@game-fields/game-runtime";
import { wordWolfSdkServerModule } from "../games/wordwolf-sdk/server-module.ts";
import { createGameFieldsSdkContentSource } from "./game-sdk-content-source.ts";
import {
  createGameFieldsSdkLlmGateway,
  enforceGameSdkLlmRateLimit,
} from "./game-sdk-llm-gateway.ts";
import {
  createAuthenticatedGameSdkPlatformAdapter,
  type AuthenticatedGameSdkPlatformAdapter,
} from "./game-sdk-platform-adapter.ts";

type SafeCommand = { type: string };

export type ApprovedGameSdkRoomAdapter = AuthenticatedGameSdkPlatformAdapter<
  unknown,
  SafeCommand,
  unknown
>;

export type ApprovedGameSdkRegistration = {
  id: string;
  title: string;
  clientKind: "wordwolf" | "iframe-package";
  clientRuntimeUrl?: string;
  revision?: string;
  serverBundleSha256?: string;
  appSetSourceSha256?: string;
  channel: "development" | "stable";
  supportsDebug: boolean;
  supportsSpectators: boolean;
  settings: readonly GameSdkSettingDefinition[];
  rules: readonly string[];
  createAdapter(
    resolveIdentity: () => Promise<GameFieldsAuthenticatedIdentity>,
    request: Request,
    playerId: string,
  ): ApprovedGameSdkRoomAdapter;
};

const registrations: readonly ApprovedGameSdkRegistration[] = [
  {
    id: wordWolfSdkServerModule.manifest.id,
    title: wordWolfSdkServerModule.manifest.title.ja,
    clientKind: "wordwolf",
    channel: "development",
    supportsDebug: wordWolfSdkServerModule.manifest.supportsDebug,
    supportsSpectators: wordWolfSdkServerModule.manifest.supportsSpectators,
    settings: wordWolfSdkServerModule.manifest.settings ?? [],
    rules: (wordWolfSdkServerModule.manifest.rules ?? []).map((rule) => rule.ja),
    createAdapter(resolveIdentity, request, playerId) {
      return createAuthenticatedGameSdkPlatformAdapter({
        module: wordWolfSdkServerModule,
        resolveIdentity,
        resources: {
          contentSource: createGameFieldsSdkContentSource(),
          llm: createGameFieldsSdkLlmGateway({
            gameId: wordWolfSdkServerModule.manifest.id,
            allowHighQuality: true,
            beforeGenerate: () => enforceGameSdkLlmRateLimit(
              request,
              playerId,
            ),
          }),
        },
        async onRoomSaved(previous, next) {
          if (
            next.phase !== "result"
            || !(
              "standardResult" in next.room
              && next.room.standardResult
            )
          ) return;
          const { persistApprovedGameSdkResult } = await import(
            "./game-sdk-result-persistence.ts"
          );
          await persistApprovedGameSdkResult({
            gameType: "wordwolf-sdk",
            title: wordWolfSdkServerModule.manifest.title.ja,
            supportsRating: wordWolfSdkServerModule.manifest.supportsRating,
            supportsReplay: wordWolfSdkServerModule.manifest.supportsReplay,
            previous,
            next,
          });
        },
      }) as unknown as ApprovedGameSdkRoomAdapter;
    },
  },
];

function isMainDeployment(env: NodeJS.ProcessEnv) {
  return env.VERCEL_GIT_COMMIT_REF === "main";
}

/**
 * Only reviewed, statically imported SDK modules belong here. Preview HTML and
 * creator uploads never become executable server modules through metadata.
 */
export function approvedGameSdkRegistration(
  gameId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const normalized = gameId.trim().toLowerCase();
  const registration = registrations.find((item) => item.id === normalized);
  if (!registration) return null;
  if (registration.channel === "development" && isMainDeployment(env)) return null;
  return registration;
}

export function approvedGameSdkIds(env: NodeJS.ProcessEnv = process.env) {
  return registrations
    .filter((item) => item.channel === "stable" || !isMainDeployment(env))
    .map((item) => item.id);
}
