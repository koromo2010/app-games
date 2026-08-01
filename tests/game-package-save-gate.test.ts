import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  saveValidatedGamePackage,
  validateGamePackageForPersistence,
} from "../apps/sdk-portal/lib/game-package-persistence.ts";
import { GamePackageAssetValidationError } from "../apps/sdk-portal/lib/game-package-asset-audit.ts";
import { saveCreatorGamePackage } from "../apps/sdk-portal/lib/game-package-store.ts";
import { saveGamePackageFilesToGit } from "../apps/sdk-portal/lib/mock-git-store.ts";
import { sdkPackageAssetFixture } from "./sdk-package-asset-fixtures.ts";

test("asset rejection calls no schema or persistence dependency", async () => {
  const calls = { schema: 0, db: 0, git: 0, blob: 0, redis: 0, audit: 0, submission: 0, publication: 0, promotion: 0, stable: 0 };
  const files = sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./missing.png'>" });
  await assert.rejects(saveValidatedGamePackage({
    files,
    afterValidation: () => { calls.schema += 1; },
    persist: async () => { for (const key of Object.keys(calls) as Array<keyof typeof calls>) if (key !== "schema") calls[key] += 1; },
  }), /GAME_SDK_PACKAGE_ASSET_MISSING/);
  assert.deepEqual(calls, { schema: 0, db: 0, git: 0, blob: 0, redis: 0, audit: 0, submission: 0, publication: 0, promotion: 0, stable: 0 });
});

test("successful validation runs schema callback before persistence once", async () => {
  const order: string[] = [];
  const result = await saveValidatedGamePackage({
    files: sdkPackageAssetFixture(),
    afterValidation: () => { order.push("schema"); return 42; },
    persist: (_validated, schema) => { order.push("persistence"); return schema; },
  });
  assert.equal(result, 42);
  assert.deepEqual(order, ["schema", "persistence"]);
});

test("low-level Git save cannot bypass the asset gate", async () => {
  let fetchCalls = 0;
  await assert.rejects(saveGamePackageFilesToGit({
    instanceId: "moi-lab",
    gameId: "portable-fixture",
    files: sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./missing.png'>" }),
  }, {
    fetchRuntime: (async () => { fetchCalls += 1; return Response.json({}); }) as typeof fetch,
    env: {
      NODE_ENV: "test",
      SDK_MOCK_GITHUB_REPOSITORY: "example/package",
      SDK_MOCK_GITHUB_WRITE_TOKEN: "not-used",
    },
  }), /GAME_SDK_PACKAGE_ASSET_MISSING/);
  assert.equal(fetchCalls, 0);
});

async function writePackage(directory: string, files: ReturnType<typeof sdkPackageAssetFixture>) {
  for (const file of files) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content);
  }
}

test("CLI audits exactly one selected package with valid and invalid exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "t76b-asset-cli-"));
  const valid = join(root, "valid");
  const other = join(root, "other-invalid");
  await mkdir(valid);
  await mkdir(other);
  await writePackage(valid, sdkPackageAssetFixture());
  await writePackage(other, sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./missing.png'>" }));
  const validRun = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "apps/sdk-portal/scripts/audit-game-package-assets.ts", valid], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(validRun.status, 0, validRun.stderr || validRun.stdout);
  assert.match(validRun.stdout, /"valid": true/);
  const invalidRun = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "apps/sdk-portal/scripts/audit-game-package-assets.ts", other], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(invalidRun.status, 1, invalidRun.stderr || invalidRun.stdout);
  assert.match(invalidRun.stdout, /GAME_SDK_PACKAGE_ASSET_MISSING/);
});

test("CLI rejects missing and invalid directory arguments", () => {
  const missing = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "apps/sdk-portal/scripts/audit-game-package-assets.ts"], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  const invalid = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "apps/sdk-portal/scripts/audit-game-package-assets.ts", join(tmpdir(), "does-not-exist-t76b")], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
});

test("forged validation receipts cannot bypass persistence validation", async () => {
  const files = sdkPackageAssetFixture();
  await assert.rejects(saveValidatedGamePackage({
    files,
    validatedPackage: { files, assetAudit: { valid: true, findings: [] } },
    persist: () => "forbidden",
  }), /GAME_SDK_PACKAGE_ASSET_VALIDATION_RECEIPT_INVALID/);
});

test("issued validation receipts are reusable only for their exact file array", async () => {
  const files = sdkPackageAssetFixture();
  const receipt = validateGamePackageForPersistence(files);
  assert.equal(await saveValidatedGamePackage({ files, validatedPackage: receipt, persist: () => "saved" }), "saved");
  await assert.rejects(saveValidatedGamePackage({ files: [...files], validatedPackage: receipt, persist: () => "forbidden" }), /GAME_SDK_PACKAGE_ASSET_VALIDATION_RECEIPT_INVALID/);
});

test("saveCreatorGamePackage rejects assets before schema, DB or Git", async () => {
  const calls = { schema: 0, db: 0, git: 0 };
  await assert.rejects(saveCreatorGamePackage({
    creatorId: "creator",
    creatorSlug: "moi-lab",
    gameId: "portable-fixture",
    files: sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./missing.png'>" }),
  }, {
    ensureSchema: async () => { calls.schema += 1; },
    sql: (async () => { calls.db += 1; return []; }) as never,
    saveFiles: async () => { calls.git += 1; return "a".repeat(40); },
  }), /GAME_SDK_PACKAGE_ASSET_MISSING/);
  assert.deepEqual(calls, { schema: 0, db: 0, git: 0 });
});

test("REST prepares and validates before creator authentication but preserves auth response order", async () => {
  const source = await readFile("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/package/route.ts", "utf8");
  assert.ok(source.indexOf("prepareGamePackageUploadFiles(body.files)") < source.indexOf("authenticateCreator(slug, token)"));
  assert.ok(source.indexOf("if (!creator)") < source.indexOf("if (prepared instanceof Error)"));
  assert.match(source, /validatedPackage: prepared\.validation/);
});

test("MCP publish path continues through the shared creator save boundary", async () => {
  const source = await readFile("apps/sdk-portal/app/api/mcp/route.ts", "utf8");
  assert.match(source, /name === "publish_game_package"/);
  assert.match(source, /saveCreatorGamePackage\(\{/);
});

test("validation errors retain deterministic structured findings", () => {
  assert.throws(() => validateGamePackageForPersistence(sdkPackageAssetFixture({
    "index.html": "<!doctype html><img src='./missing.png'>",
  })), (error) => error instanceof GamePackageAssetValidationError && error.findings[0]?.code === "GAME_SDK_PACKAGE_ASSET_MISSING");
});
