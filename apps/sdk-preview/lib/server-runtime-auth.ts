import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";

export type ServerRuntimeScope = {
  environment: "production" | "development";
  instanceId: string;
  gameId: string;
  revision: string;
};

export type ServerRuntimeAuthFailure =
  | "TOKEN_INVALID"
  | "AUDIENCE_INVALID"
  | "ROLE_INVALID"
  | "ENVIRONMENT_MISMATCH"
  | "INSTANCE_MISMATCH"
  | "GAME_MISMATCH"
  | "REVISION_MISMATCH";

export function serverRuntimeAuthFailure(
  grant: SdkPreviewGrant | null,
  scope: ServerRuntimeScope,
): ServerRuntimeAuthFailure | null {
  if (!grant) return "TOKEN_INVALID";
  if (grant.audience !== "package-server") return "AUDIENCE_INVALID";
  if (grant.role !== "runner") return "ROLE_INVALID";
  if (grant.environment !== scope.environment) return "ENVIRONMENT_MISMATCH";
  if (grant.instanceId !== scope.instanceId) return "INSTANCE_MISMATCH";
  if (grant.gameId !== scope.gameId) return "GAME_MISMATCH";
  if (grant.revision !== scope.revision) return "REVISION_MISMATCH";
  return null;
}

export function logServerRuntimeAuthFailure(
  failure: ServerRuntimeAuthFailure,
  operation: "health-check" | "invoke",
) {
  console.warn(JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "warn",
    event: "sdk.preview-runner-auth",
    service: "game-fields-sdk-preview",
    environment: "candidate-preview",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    fields: {
      operation,
      errorCode: failure,
      outcome: "rejected",
    },
  }));
}
