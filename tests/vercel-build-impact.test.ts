import assert from "node:assert/strict";
import test from "node:test";
import { evaluateVercelBuild } from "../scripts/check-vercel-build-impact.mjs";

const decide = (projectName: string, branch: string, changedPaths: string[]) =>
  evaluateVercelBuild({ projectName, branch, changedPaths });

test("branchが対象外なら変更パスにかかわらずskipする", () => {
  assert.deepEqual(decide("app-games", "develop", ["app/page.tsx"]), {
    build: false,
    reason: "branch-mismatch:main",
  });
  assert.deepEqual(decide("app-games-dev", "main", ["app/page.tsx"]), {
    build: false,
    reason: "branch-mismatch:develop",
  });
});

test("ドキュメントだけの変更は全surfaceでskipする", () => {
  for (const [project, branch] of [
    ["app-games", "main"],
    ["app-games-sdk", "main"],
    ["app-games-sdk-preview", "main"],
  ] as const) {
    assert.equal(decide(project, branch, ["docs/REDIS_CONSOLIDATION.md", "README.md"]).build, false);
  }
});

test("本体だけの変更はPlatformだけbuildする", () => {
  assert.equal(decide("app-games-dev", "develop", ["lib/redis-store.ts"]).build, true);
  assert.equal(decide("app-games-sdk-dev", "develop", ["lib/redis-store.ts"]).build, false);
  assert.equal(decide("app-games-preview-dev", "develop", ["lib/redis-store.ts"]).build, false);
});

test("PortalとPreviewの固有変更は相互にbuildしない", () => {
  assert.equal(decide("app-games-sdk-dev", "develop", ["apps/sdk-portal/app/page.tsx"]).build, true);
  assert.equal(decide("app-games-preview-dev", "develop", ["apps/sdk-portal/app/page.tsx"]).build, false);
  assert.equal(decide("app-games-preview-dev", "develop", ["apps/sdk-preview/app/health/route.ts"]).build, true);
  assert.equal(decide("app-games-sdk-dev", "develop", ["apps/sdk-preview/app/health/route.ts"]).build, false);
});

test("共有SDK packageとlockfileは影響する全Projectをbuildする", () => {
  for (const project of ["app-games-dev", "app-games-sdk-dev", "app-games-preview-dev"] as const) {
    assert.equal(decide(project, "develop", ["packages/game-sdk/src/runtime.ts"]).build, true);
    assert.equal(decide(project, "develop", ["package-lock.json"]).build, true);
  }
});

test("使用しない重複Portal Projectは常にskipする", () => {
  assert.deepEqual(decide("app-games-sdk-portal", "develop", ["apps/sdk-portal/app/page.tsx"]), {
    build: false,
    reason: "project-disabled",
  });
});

test("package asset validatorはPortalとPreviewだけbuildする", () => {
  const path = "packages/sdk-package-assets/src/index.ts";
  assert.equal(decide("app-games-dev", "develop", [path]).build, false);
  assert.equal(decide("app-games-sdk-dev", "develop", [path]).build, true);
  assert.equal(decide("app-games-preview-dev", "develop", [path]).build, true);
});

test("service authはPlatformとPortalだけbuildする", () => {
  const path = "packages/sdk-service-auth/src/index.ts";
  assert.equal(decide("app-games-dev", "develop", [path]).build, true);
  assert.equal(decide("app-games-sdk-dev", "develop", [path]).build, true);
  assert.equal(decide("app-games-preview-dev", "develop", [path]).build, false);
});

test("runtime artifactはPortalとPreviewだけbuildする", () => {
  const path = "packages/sdk-runtime-artifact/src/index.ts";
  assert.equal(decide("app-games-dev", "develop", [path]).build, false);
  assert.equal(decide("app-games-sdk-dev", "develop", [path]).build, true);
  assert.equal(decide("app-games-preview-dev", "develop", [path]).build, true);
});

test("未知Projectまたはdiff取得不能は安全側でbuildする", () => {
  assert.deepEqual(decide("unknown", "develop", ["docs/a.md"]), {
    build: true,
    reason: "unknown-project",
  });
  assert.deepEqual(evaluateVercelBuild({ projectName: "app-games-dev", branch: "develop", changedPaths: null }), {
    build: true,
    reason: "diff-unavailable",
  });
});
