import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createCreatorDeletionAggregateProjection,
  createCreatorDeletionTargetProjection,
  deletionWindowConsistency,
  inspectCreatorArtifacts,
} from "../apps/sdk-portal/lib/creator-deletion-forensics.ts";

test("legacy 00:43 UTC deletion minute is classified as consistent but not proven", () => {
  assert.equal(deletionWindowConsistency("2026-08-19T00:43:25.000Z"), "CONSISTENT_WITH_LEGACY_0043_UTC_RETENTION_TRIGGER");
  assert.equal(deletionWindowConsistency("2026-08-19T01:43:25.000Z"), "OUTSIDE_LEGACY_0043_UTC_TRIGGER_MINUTE");
  assert.equal(deletionWindowConsistency(null), "NOT_ESTABLISHED");
});

test("artifact inspection verifies exact scoped paths without returning revisions or game IDs", async () => {
  const summary = await inspectCreatorArtifacts([
    { kind: "mock", gameId: "janken", revision: "a".repeat(40) },
    { kind: "package", gameId: "janken", revision: "b".repeat(40) },
  ], {
    readCommit: async (revision) => ({ commitSha: revision, treeSha: revision }),
    readTree: async (treeSha) => treeSha.startsWith("a")
      ? [{ path: "previews/moi-lab2/janken/mock/index.html", type: "blob", sha: "1" }]
      : [{ path: "packages/moi-lab2/janken/bundle/game-fields-package.json", type: "blob", sha: "2" }],
  });
  assert.deepEqual(summary, { status: "COMPLETE", locators: 2, checked: 2, present: 2, missing: 0, unavailable: 0 });
  assert.doesNotMatch(JSON.stringify(summary), /janken|a{40}|b{40}/);
});

test("target projection exposes timestamps, physical counts, and store status without PII or content", () => {
  const result = createCreatorDeletionTargetProjection({
    environment: "production",
    creator: {
      lifecycle: "deleted",
      ownerIsNull: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-08-19T00:43:25Z",
      deletedAt: "2026-08-19T00:43:25Z",
    },
    assets: { gameRows: 2, packageRevisionRows: 3 },
    artifactSummary: { status: "COMPLETE", locators: 4, checked: 4, present: 4, missing: 0, unavailable: 0 },
  });
  assert.equal(result.creator.slug, "moi-lab2");
  assert.equal(result.causality.conclusion, "CONSISTENT_NOT_PROVEN");
  assert.equal(result.assets.gameRows, 2);
  assert.equal(result.stores.gitArtifacts.present, 4);
  assert.doesNotMatch(JSON.stringify(result), /playerId|owner_player|accountRef|email|token|title|description|manifest/i);
});

test("aggregate projection contains no creator slugs", () => {
  const result = createCreatorDeletionAggregateProjection({
    environment: "production",
    counts: { deletedCreators: 2, legacyCronMinuteCreators: 1 },
    earliestDeletedAt: "2026-08-18T00:43:54Z",
    latestDeletedAt: "2026-08-19T00:43:25Z",
  });
  assert.equal(result.scope, "aggregate-no-slugs");
  assert.doesNotMatch(JSON.stringify(result), /moi-lab2|\"slug\"|player|email|token/i);
});

test("routes require admin/service auth, enforce exact target, and use read-only transactions", () => {
  const internal = readFileSync("apps/sdk-portal/app/api/internal/audit/creator-deletion-forensics/route.ts", "utf8");
  const admin = readFileSync("app/api/admin/sdk-creator-deletion-forensics/route.ts", "utf8");
  assert.match(internal, /requireSdkServiceRequest/);
  assert.match(admin, /requireFullSiteAdminSession/);
  assert.match(internal, /readOnly: true/g);
  assert.match(internal + admin, /moi-lab2/);
  assert.match(internal + admin, /private, no-store/);
  assert.doesNotMatch(internal, /SELECT[^`]*(email|access_token_hash|refresh_token_hash|title|description|manifest)/s);
  assert.doesNotMatch(internal + admin, /\b(?:INSERT|UPDATE|DELETE)\b/);
});
