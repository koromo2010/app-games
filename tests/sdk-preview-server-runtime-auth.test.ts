import assert from "node:assert/strict";
import test from "node:test";
import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";
import { serverRuntimeAuthFailure } from "../apps/sdk-preview/lib/server-runtime-auth.ts";

const scope = {
  environment: "development" as const,
  instanceId: "moi-lab",
  gameId: "skull",
  revision: "a".repeat(40),
};

const grant: SdkPreviewGrant = {
  version: 4,
  audience: "package-server",
  environment: "development",
  channel: "candidate-preview",
  role: "runner",
  instanceId: scope.instanceId,
  gameId: scope.gameId,
  revision: scope.revision,
  bundleSha256: "b".repeat(64),
  expiresAt: 2_000,
};

test("server runtime auth reports a safe reason without exposing a token", () => {
  assert.equal(serverRuntimeAuthFailure(grant, scope), null);
  assert.equal(serverRuntimeAuthFailure(null, scope), "TOKEN_INVALID");
  assert.equal(
    serverRuntimeAuthFailure({ ...grant, environment: "production" }, scope),
    "ENVIRONMENT_MISMATCH",
  );
  assert.equal(
    serverRuntimeAuthFailure({ ...grant, gameId: "other-game" }, scope),
    "GAME_MISMATCH",
  );
});
