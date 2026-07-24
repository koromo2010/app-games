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
  channel: "development" | "stable";
  supportsDebug: boolean;
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
    channel: "development",
    supportsDebug: wordWolfSdkServerModule.manifest.supportsDebug,
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
