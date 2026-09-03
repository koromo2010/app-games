import { createHash } from "node:crypto";
import { resolveGameFieldsEnvironment } from "./game-fields-environment.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";
import { developmentRoomFixtureNamespace } from "./development-room-fixture-public-contract.ts";

export * from "./development-room-fixture-public-contract.ts";

export function developmentRoomFixtureEnvironmentAvailable(
  env: NodeJS.ProcessEnv = process.env,
) {
  try {
    return env.APP_ENV === "development"
      && expectedAppEnvironment(
        env.VERCEL_ENV,
        env.NODE_ENV,
        env.VERCEL_GIT_COMMIT_REF,
      ) === "development"
      && resolveGameFieldsEnvironment(undefined, env) === "development";
  } catch {
    return false;
  }
}

export function developmentRoomFixtureActorDigest(playerId: string) {
  return createHash("sha256")
    .update(`${developmentRoomFixtureNamespace}:actor:${playerId.trim()}`)
    .digest("hex");
}

export function developmentRoomFixturePublicIdentity(input: {
  surface: string;
  roomIdentity: string;
}) {
  return createHash("sha256")
    .update(`${developmentRoomFixtureNamespace}:${input.surface}:${input.roomIdentity}`)
    .digest("hex");
}
