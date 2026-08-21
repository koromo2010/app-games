import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createCreatorOwnershipDiagnostic,
  operatorOwnerFingerprint,
} from "../apps/sdk-portal/lib/creator-ownership-diagnostic.ts";

const secret = "t128-diagnostic-test-secret-value-0001";

test("owner fingerprint is deterministic, environment-bound, and opaque", () => {
  const production = operatorOwnerFingerprint({ ownerPlayerId: "raw-player", environment: "production", secret });
  const repeated = operatorOwnerFingerprint({ ownerPlayerId: "raw-player", environment: "production", secret });
  const development = operatorOwnerFingerprint({ ownerPlayerId: "raw-player", environment: "development", secret });
  assert.equal(production, repeated);
  assert.notEqual(production, development);
  assert.match(production, /^opf_v1_[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(production, /raw-player/);
});

test("projection returns only safe owner, asset, and grant fields", () => {
  const result = createCreatorOwnershipDiagnostic({
    slug: "moi-lab2",
    lifecycle: "active",
    ownerPlayerId: "raw-player",
    principalValidity: "missing",
    counts: { games: 2, drafts: 1, prototypeRevisions: 1, packageRevisions: 3, currentReleases: 1, activeGrants: 1, revokedGrants: 2 },
    environment: "production",
    secret,
  });
  assert.equal(result.creator.slug, "moi-lab2");
  assert.equal(result.owner.principalValidity, "missing");
  assert.equal(result.grants.consistency, "MISMATCH");
  assert.deepEqual(result.assets, { games: 2, drafts: 1, prototypeRevisions: 1, packageRevisions: 3, currentReleases: 1 });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /raw-player|accountRef|email|token|title|description|manifest/);
});

test("unbound owner is explicit and does not create a fingerprint", () => {
  const result = createCreatorOwnershipDiagnostic({
    slug: "moi-lab2",
    lifecycle: "active",
    ownerPlayerId: null,
    principalValidity: "unknown",
    counts: { games: 0, drafts: 0, prototypeRevisions: 0, packageRevisions: 0, currentReleases: 0, activeGrants: 0, revokedGrants: 0 },
    environment: "production",
    secret,
  });
  assert.deepEqual(result.owner, { state: "null", fingerprint: null, principalValidity: "NOT_APPLICABLE" });
  assert.equal(result.grants.consistency, "NOT_APPLICABLE");
});

test("operator routes are authenticated, slug-limited, no-store projections", () => {
  const portal = readFileSync("apps/sdk-portal/app/api/internal/audit/creator-ownership/route.ts", "utf8");
  const platform = readFileSync("app/api/internal/sdk-owner-principal/route.ts", "utf8");
  const admin = readFileSync("app/api/admin/sdk-creator-ownership/route.ts", "utf8");
  assert.match(portal, /requireSdkServiceRequest/);
  assert.match(platform, /requireSdkServiceRequest/);
  assert.match(admin, /requireFullSiteAdminSession/);
  assert.match(portal, /readOnly: true/);
  assert.match(portal, /key !== "slug"/);
  assert.match(admin, /key !== "slug"/);
  assert.match(portal + platform + admin, /private, no-store/);
  assert.doesNotMatch(portal, /SELECT[^`]*(email|access_token_hash|refresh_token_hash)/s);
});
