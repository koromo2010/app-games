import assert from "node:assert/strict";
import test from "node:test";
import { resolveGameFieldsEnvironment } from "../lib/game-fields-environment.ts";

test("GAME_FIELDS_ENV is the explicit SDK persistence namespace", () => {
  assert.equal(resolveGameFieldsEnvironment(undefined, {
    GAME_FIELDS_ENV: "candidate-preview",
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  }), "candidate-preview");
});

test("unknown GAME_FIELDS_ENV fails closed instead of sharing another environment", () => {
  assert.throws(
    () => resolveGameFieldsEnvironment(undefined, {
      GAME_FIELDS_ENV: "preview",
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    /GAME_FIELDS_ENV_INVALID/,
  );
});

test("branch fallback remains safe for local and legacy deployments", () => {
  assert.equal(resolveGameFieldsEnvironment(undefined, {
    VERCEL_GIT_COMMIT_REF: "main",
    NODE_ENV: "production",
  }), "production");
  assert.equal(resolveGameFieldsEnvironment(undefined, {
    VERCEL_GIT_COMMIT_REF: "develop",
    NODE_ENV: "production",
  }), "development");
  assert.equal(resolveGameFieldsEnvironment(undefined, {
    NODE_ENV: "test",
  }), "test");
});
