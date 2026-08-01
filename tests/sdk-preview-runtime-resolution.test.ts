import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePreviewRuntime,
} from "../apps/sdk-portal/lib/preview-runtime-resolution.ts";

test("通常導線とrevision指定導線は同じPackage resolverを使用する", async () => {
  const latestRevision = "a".repeat(40);
  const requested: Array<string | undefined> = [];
  const resolvePackageRevision = async (revision?: string) => {
    requested.push(revision);
    return {
      revision: revision ?? latestRevision,
      runtime: "immutable-package-runtime",
    };
  };

  const normal = await resolvePreviewRuntime({
    resolvePackageRevision,
    resolveLegacyPreview: async () => ({ runtime: "legacy-mock" }),
  });
  const pinned = await resolvePreviewRuntime({
    requestedRevision: latestRevision,
    resolvePackageRevision,
    resolveLegacyPreview: async () => ({ runtime: "legacy-mock" }),
  });

  assert.deepEqual(requested, [undefined, latestRevision]);
  assert.deepEqual(normal, pinned);
  assert.equal(normal?.runtime, "immutable-package-runtime");
});

test("通常導線はPackageが存在しない場合だけ旧Mockを解決する", async () => {
  let legacyCalls = 0;
  const resolved = await resolvePreviewRuntime({
    resolvePackageRevision: async () => undefined,
    resolveLegacyPreview: async () => {
      legacyCalls += 1;
      return { runtime: "legacy-mock" };
    },
  });

  assert.deepEqual(resolved, { runtime: "legacy-mock" });
  assert.equal(legacyCalls, 1);
});

test("Package解決失敗は旧Mockへfallbackせず開始不能のまま返す", async () => {
  let legacyCalls = 0;
  await assert.rejects(
    () => resolvePreviewRuntime({
      resolvePackageRevision: async () => {
        throw new Error("PACKAGE_RUNTIME_UNAVAILABLE");
      },
      resolveLegacyPreview: async () => {
        legacyCalls += 1;
        return { runtime: "legacy-mock" };
      },
    }),
    /PACKAGE_RUNTIME_UNAVAILABLE/,
  );
  assert.equal(legacyCalls, 0);
});

test("存在しないrevision指定は旧Mockへfallbackしない", async () => {
  let legacyCalls = 0;
  const resolved = await resolvePreviewRuntime({
    requestedRevision: "b".repeat(40),
    resolvePackageRevision: async () => undefined,
    resolveLegacyPreview: async () => {
      legacyCalls += 1;
      return { runtime: "legacy-mock" };
    },
  });

  assert.equal(resolved, undefined);
  assert.equal(legacyCalls, 0);
});
