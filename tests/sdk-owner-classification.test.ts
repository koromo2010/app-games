import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyCreatorOwner,
  resolveSdkSession,
  type CreatorOwnerRecord,
} from "../apps/sdk-portal/lib/sdk-owner-classification.ts";
import {
  SDK_OWNER_EVENT_CODES,
  SdkOwnerLookupError,
  logSdkOwnerLookupFailure,
  logSdkOwnerResult,
  sanitizeErrorCode,
} from "../apps/sdk-portal/lib/sdk-owner-observability.ts";

const creator = (owner_player_id: string | null, overrides: Partial<CreatorOwnerRecord> = {}): CreatorOwnerRecord => ({
  id: "creator-row",
  slug: "krm",
  display_name: "Creator",
  owner_player_id,
  deleted_at: null,
  ...overrides,
});

function captureWarnings(run: () => void) {
  const values: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => values.push(...args);
  try {
    run();
  } finally {
    console.warn = original;
  }
  return values.join("\n");
}

test("owner classifier separates missing, deleted, and missing-owner records", () => {
  assert.deepEqual(classifyCreatorOwner(undefined, "player-1"), { status: "creator_not_found" });
  assert.deepEqual(
    classifyCreatorOwner(creator("player-1", { deleted_at: "2026-08-02T00:00:00.000Z" }), "player-1"),
    { status: "creator_deleted" },
  );
  assert.deepEqual(classifyCreatorOwner(creator(null), "player-1"), { status: "owner_null" });
  assert.deepEqual(classifyCreatorOwner(creator(""), "player-1"), { status: "owner_empty" });
});

test("owner comparison is exact and does not normalize case, whitespace, or prefixes", () => {
  for (const storedOwner of ["PLAYER-1", " player-1", "game-fields:player-1"]) {
    assert.deepEqual(classifyCreatorOwner(creator(storedOwner), "player-1"), { status: "owner_mismatch" });
  }
  const result = classifyCreatorOwner(creator("player-1"), "player-1");
  assert.equal(result.status, "authorized");
  assert.deepEqual(
    result.status === "authorized" ? result.creator : null,
    { id: "creator-row", slug: "krm", display_name: "Creator" },
  );
  if (result.status === "authorized") {
    assert.equal("owner_player_id" in result.creator, false);
    assert.equal("deleted_at" in result.creator, false);
  }
});

test("session null is missing while session exceptions propagate", async () => {
  assert.deepEqual(await resolveSdkSession(async () => null), { status: "session_missing" });
  const failure = new Error("session payload and cookie must not be logged");
  await assert.rejects(
    () => resolveSdkSession(async () => { throw failure; }),
    (error) => error === failure,
  );
});

test("schema and lookup failures remain exceptions with sanitized classification", () => {
  const schema = new SdkOwnerLookupError("schema", { code: "42P01", message: "SQL parameter secret" });
  const lookup = new SdkOwnerLookupError("lookup", { code: "permission denied; player-1" });
  assert.equal(schema.phase, "schema");
  assert.equal(schema.errorCode, "42P01");
  assert.equal(lookup.phase, "lookup");
  assert.equal(lookup.errorCode, "UNKNOWN");
  assert.equal(sanitizeErrorCode({ code: "DROP TABLE player-1" }), "UNKNOWN");
  assert.equal(schema.message, "SDK owner lookup unavailable.");
});

test("sanitized logs contain event and outcome but no identity, SQL, or full error", () => {
  const resultLog = captureWarnings(() => logSdkOwnerResult("owner_mismatch"));
  const errorLog = captureWarnings(() => logSdkOwnerLookupFailure(
    new Error("raw player-1 cookie session payload SQL parameter"),
  ));
  const schemaLog = captureWarnings(() => logSdkOwnerLookupFailure(
    new SdkOwnerLookupError("schema", { code: "42P01", message: "raw SQL" }),
  ));
  assert.match(resultLog, new RegExp(SDK_OWNER_EVENT_CODES.identityMismatch));
  assert.match(errorLog, new RegExp(SDK_OWNER_EVENT_CODES.lookupFailed));
  assert.match(schemaLog, new RegExp(SDK_OWNER_EVENT_CODES.schemaCheckFailed));
  for (const output of [resultLog, errorLog, schemaLog]) {
    assert.doesNotMatch(output, /player-1|cookie|session payload|SQL parameter|raw SQL/);
  }
});

test("targeted routes keep session, owner mismatch, record inconsistency, and lookup failures separate", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const instance = read("apps/sdk-portal/app/[instanceId]/page.tsx");
  const game = read("apps/sdk-portal/app/[instanceId]/games/[gameId]/page.tsx");
  const submit = read("apps/sdk-portal/app/api/dashboard/games/[instanceId]/[gameId]/submit/route.ts");
  for (const source of [instance, game, submit]) {
    assert.doesNotMatch(source, /authenticateCreatorOwner[\s\S]{0,120}catch \(\) => null/);
    assert.doesNotMatch(source, /catch \(\) => null/);
    assert.match(source, /session_missing/);
    assert.match(source, /owner_mismatch/);
  }
  for (const source of [instance, game]) {
    assert.match(source, /CreatorAccountReconnect/);
    assert.match(source, /CreatorOwnershipIssue kind="record_inconsistency"/);
    assert.match(source, /CreatorOwnershipIssue kind="lookup_unavailable"/);
  }
  assert.match(submit, /owner_mismatch[\s\S]{0,240}status: 403/);
  assert.match(submit, /所有権情報に不整合があります。再接続では修復できません。[\s\S]{0,100}status: 409/);
  assert.match(submit, /所有権情報を一時的に確認できません。[\s\S]{0,100}status: 503/);
});

test("owner query does not select management token data", () => {
  const source = readFileSync("apps/sdk-portal/lib/instance-registry.ts", "utf8");
  const start = source.indexOf("async function registeredCreatorForOwner");
  const end = source.indexOf("export async function instanceSlugAvailable", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const ownerQuery = source.slice(start, end);
  assert.match(ownerQuery, /SELECT id, slug, display_name, owner_player_id, deleted_at/);
  assert.doesNotMatch(ownerQuery, /management_token/);
  assert.doesNotMatch(ownerQuery, /playerId\s*[:=]/);
});
