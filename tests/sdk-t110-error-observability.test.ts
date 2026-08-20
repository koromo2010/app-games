import assert from "node:assert/strict";
import test from "node:test";
import { buildSdkToolErrorResult, projectSdkToolErrorDetails } from "../apps/sdk-portal/lib/sdk-tool-error-contract.ts";
import { buildPostHandshakeToolInputSchema } from "../apps/sdk-portal/lib/sdk-tool-schema.ts";
import { normalizeRequirementsGameId } from "../apps/sdk-portal/lib/sdk-requirements-contract.ts";

const bindingSchema = { type: "string", minLength: 32 };

test("requirements published schema is directly testable and requires only its read inputs plus binding", () => {
  const schema = buildPostHandshakeToolInputSchema({
    type: "object",
    properties: { slug: { type: "string" }, gameId: { type: "string" } },
    required: ["slug", "gameId"],
    additionalProperties: false,
  }, bindingSchema);

  assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["environmentBinding", "gameId", "slug"]);
  assert.deepEqual(schema.required, ["slug", "gameId", "environmentBinding"]);
  assert.equal(schema.additionalProperties, false);
});

test("schema builder deduplicates injected binding and keeps owner context write-only", () => {
  const schema = buildPostHandshakeToolInputSchema({
    type: "object",
    properties: { slug: { type: "string" }, environmentBinding: bindingSchema },
    required: ["slug", "environmentBinding"],
    additionalProperties: false,
  }, bindingSchema, { ownerBoundWrite: true });

  assert.deepEqual(schema.required, ["slug", "environmentBinding", "expectedAccountRef"]);
  assert.ok(schema.properties?.expectedAccountContextVersion);
});

test("requirements game ID normalization emits a stable validation code", () => {
  assert.equal(normalizeRequirementsGameId(" Twixt-Repro "), "twixt-repro");
  assert.throws(() => normalizeRequirementsGameId("BAD!"), /GAME_SDK_GAME_ID_INVALID/);
});

test("known requirements failures expose safe code, layer, and operation", () => {
  const cases = [
    ["SDK_HANDSHAKE_REQUIRED", "SDK_HANDSHAKE_REQUIRED", "authorization", "environment-binding"],
    ["AUTHORING_ENVIRONMENT_BINDING_MISMATCH", "AUTHORING_ENVIRONMENT_BINDING_MISMATCH", "authorization", "environment-binding"],
    ["SDK_AUTHORING_CLIENT_BINDING_MISMATCH", "SDK_AUTHORING_CLIENT_BINDING_MISMATCH", "authorization", "client-binding"],
    ["SDK_OWNER_REQUIRED", "SDK_OWNER_REQUIRED", "authorization", "requirements-owner"],
    ["SDK_PROTOTYPE_INPUT_INVALID", "SDK_PROTOTYPE_INPUT_INVALID", "validation", "prototype-input"],
    ["GAME_SDK_GAME_ID_INVALID", "GAME_SDK_GAME_ID_INVALID", "validation", "requirements-input"],
    ["GAME_SDK_DRAFT_NOT_FOUND", "GAME_SDK_DRAFT_NOT_FOUND", "validation", "requirements-contract"],
    ["MODULE_PROFILE_NOT_CONFIRMED", "MODULE_PROFILE_NOT_CONFIRMED", "validation", "requirements-contract"],
    ["MODULE_PROFILE_STALE", "MODULE_PROFILE_STALE", "validation", "requirements-contract"],
  ] as const;

  for (const [input, code, layer, operation] of cases) {
    const details = projectSdkToolErrorDetails(new Error(`${input}: SQL secret-token stack trace`));
    assert.deepEqual(details, {
      code,
      message: `${code}: SDK操作を続行できません。`,
      layer,
      operation,
    });
    const result = buildSdkToolErrorResult(details);
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, details);
    assert.doesNotMatch(JSON.stringify(result), /secret-token|stack trace|SQL/);
  }
});

test("unknown failures retain generic handler fallback without raw exception", () => {
  const details = projectSdkToolErrorDetails(new Error("SQL secret-token stack trace"));
  assert.deepEqual(details, {
    code: "SDK_OPERATION_FAILED",
    message: "SDK操作に失敗しました。",
    layer: "handler",
    operation: "handler",
  });
});
