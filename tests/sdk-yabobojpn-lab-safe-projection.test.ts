import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  acceptsExactTargetSafeProjectionRequest,
  createYabobojpnLabSafeProjection,
} from "../apps/sdk-portal/lib/creator-exact-target-safe-projection.ts";
import { inspectYabobojpnLabArtifacts } from "../apps/sdk-portal/lib/creator-deletion-forensics.ts";

const secret = "t173-safe-projection-test-secret-value";

function projection(overrides: Partial<Parameters<typeof createYabobojpnLabSafeProjection>[0]> = {}) {
  return createYabobojpnLabSafeProjection({
    environment: "development",
    observation: "OBSERVED",
    lifecycle: "deleted",
    deletedAt: "2026-08-19T00:43:25.000Z",
    ownerPlayerId: "raw-owner-player-id",
    secret,
    counts: {
      games: 2,
      packageRevisions: 3,
      releases: 1,
      currentReleases: 1,
      activeGrants: 1,
      revokedGrants: 2,
    },
    artifactSummary: { status: "COMPLETE", locators: 2, checked: 2, present: 2, missing: 0, unavailable: 0 },
    ...overrides,
  });
}

test("exact target request accepts only the static GET path with no target inputs", () => {
  const path = "/api/internal/audit/yabobojpn-lab-safe-projection";
  assert.equal(acceptsExactTargetSafeProjectionRequest(new Request(`https://example.test${path}`), path), true);
  assert.equal(acceptsExactTargetSafeProjectionRequest(new Request(`https://example.test${path}?slug=other`), path), false);
  assert.equal(acceptsExactTargetSafeProjectionRequest(new Request(`https://example.test${path}`, { headers: { "x-target-slug": "other" } }), path), false);
  assert.equal(acceptsExactTargetSafeProjectionRequest(new Request(`https://example.test${path}`, { method: "POST" }), path), false);
  assert.equal(acceptsExactTargetSafeProjectionRequest(new Request("https://example.test/api/internal/audit/other"), path), false);
  assert.equal(acceptsExactTargetSafeProjectionRequest({
    url: `https://example.test${path}`,
    method: "GET",
    body: {},
    headers: new Headers(),
  } as unknown as Request, path), false);
});

test("safe projection has a closed allowlist and never returns raw identity or content", () => {
  const result = projection();
  assert.deepEqual(Object.keys(result).sort(), [
    "aggregates", "creator", "deletionWindow", "environment", "grants", "observations", "owner", "publication", "recovery", "schemaVersion", "scope",
  ].sort());
  assert.deepEqual(Object.keys(result.aggregates).sort(), ["games", "gitArtifactsAvailable", "packageRevisions", "releases"].sort());
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /raw-owner-player-id|creatorId|playerId|gameId|packageId|revisionId|releaseId|grantId|accountRef|email|displayName|title|payload|manifest|token|cookie|secret|connection/i);
  assert.equal(result.owner.state, "BOUND");
  assert.match(result.owner.fingerprint ?? "", /^opf_v1_[A-Za-z0-9_-]{43}$/);
  assert.equal(result.aggregates.gitArtifactsAvailable, 2);
});

test("owner fingerprint is environment-bound and never exposes the owner identifier", () => {
  const development = projection({ environment: "development" });
  const production = projection({ environment: "production" });
  assert.notEqual(development.owner.fingerprint, production.owner.fingerprint);
  assert.doesNotMatch(development.owner.fingerprint ?? "", /raw-owner-player-id/);
});

test("missing, active, deleted, and ambiguous lifecycles have explicit safe projections", () => {
  for (const lifecycle of ["missing", "active", "deleted", "ambiguous"] as const) {
    const result = projection({ lifecycle, ownerPlayerId: null });
    assert.equal(result.creator.lifecycle, lifecycle);
    assert.equal("slug" in result.creator, false);
  }
  assert.equal(projection({ lifecycle: "missing", ownerPlayerId: null }).recovery.quarantineFirstFeasibility, "NOT_APPLICABLE_TARGET_MISSING");
  assert.equal(projection({ lifecycle: "active", ownerPlayerId: null }).recovery.quarantineFirstFeasibility, "NOT_APPLICABLE_CREATOR_ACTIVE");
  assert.equal(projection({ lifecycle: "deleted", ownerPlayerId: null }).recovery.quarantineFirstFeasibility, "REQUIRES_SEPARATE_AUTHORIZATION");
});

test("store and artifact observation failures fail closed to UNKNOWN without retry state", () => {
  const storeUnknown = projection({
    observation: "UNKNOWN",
    lifecycle: "ambiguous",
    ownerPlayerId: null,
    artifactSummary: undefined,
  });
  assert.deepEqual(storeUnknown.observations, { store: "UNKNOWN", gitArtifacts: "UNKNOWN" });
  assert.equal(storeUnknown.deletionWindow.consistency, "UNKNOWN");
  assert.equal(storeUnknown.recovery.quarantineFirstFeasibility, "UNKNOWN");
  const artifactUnknown = projection({
    artifactSummary: { status: "PARTIAL", locators: 2, checked: 2, present: 1, missing: 0, unavailable: 1 },
  });
  assert.equal(artifactUnknown.observations.gitArtifacts, "UNKNOWN");
  assert.equal(artifactUnknown.aggregates.gitArtifactsAvailable, 1);
});

test("artifact inspection shares the bounded reader but remains fixed to yabobojpn-lab", async () => {
  const summary = await inspectYabobojpnLabArtifacts([
    { kind: "mock", gameId: "internal-game-id", revision: "a".repeat(40) },
  ], {
    readCommit: async (revision) => ({ commitSha: revision, treeSha: revision }),
    readTree: async () => [{ path: "previews/yabobojpn-lab/internal-game-id/mock/index.html", type: "blob", sha: "1" }],
  });
  assert.deepEqual(summary, { status: "COMPLETE", locators: 1, checked: 1, present: 1, missing: 0, unavailable: 0 });
  assert.doesNotMatch(JSON.stringify(summary), /internal-game-id|a{40}/);
});

test("operator routes authenticate before reads, prohibit overrides, and contain no write path", () => {
  const internal = readFileSync("apps/sdk-portal/app/api/internal/audit/yabobojpn-lab-safe-projection/route.ts", "utf8");
  const admin = readFileSync("app/api/admin/sdk-yabobojpn-lab-safe-projection/route.ts", "utf8");
  const legacyInternal = readFileSync("apps/sdk-portal/app/api/internal/audit/creator-deletion-forensics/route.ts", "utf8");
  const legacyAdmin = readFileSync("app/api/admin/sdk-creator-deletion-forensics/route.ts", "utf8");
  assert.ok(internal.indexOf("requireSdkServiceRequest") < internal.indexOf("acceptsExactTargetSafeProjectionRequest"));
  assert.match(admin, /requireFullSiteAdminSession/);
  assert.match(internal, /readOnly: true/);
  assert.match(internal + admin, /private, no-store/);
  assert.match(internal + admin, /yabobojpn-lab-safe-projection/);
  assert.doesNotMatch(internal + admin, /searchParams\.set\([^)]*(?:slug|target)|\[creatorSlug\]|\[\.\.\./i);
  assert.doesNotMatch(internal, /ensureSdkSchema|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(legacyInternal + legacyAdmin, /moi-lab2/);
  assert.match(legacyInternal, /mode === "target"/);
});
