import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = resolve("scripts/create-game.mjs");

test("game scaffold creates SDK contracts without platform storage or actor IDs", () => {
  const cwd = mkdtempSync(join(tmpdir(), "game-fields-sdk-"));
  const result = spawnSync(process.execPath, [script, "sample-game", "サンプルゲーム"], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  const gameDir = join(cwd, "app", "sample-game");
  const files = readdirSync(gameDir).sort();
  assert.equal(files.includes("sample-game-contracts.ts"), true);
  assert.equal(files.includes("sample-game-app-set.ts"), true);
  assert.equal(files.includes("sample-game-server-module.ts"), true);
  assert.equal(files.includes("SDK_CONTRACT.test.ts.example"), true);

  const manifest = readFileSync(join(gameDir, "sample-game-manifest.ts"), "utf8");
  assert.match(manifest, /sdkVersion: GAME_SDK_VERSION/);

  const contracts = readFileSync(join(gameDir, "sample-game-contracts.ts"), "utf8");
  assert.doesNotMatch(contracts, /actorId/);
  assert.doesNotMatch(contracts, /\bplayerName\b/);
  assert.match(contracts, /GameSdkOnlineRoom/);

  const appSet = readFileSync(join(gameDir, "sample-game-app-set.ts"), "utf8");
  assert.match(appSet, /defineGameSdkOnlineRoomAppSet/);
  assert.match(appSet, /context\.actor\.playerId/);
  assert.match(appSet, /applyAppCommand/);
  const serverModule = readFileSync(join(gameDir, "sample-game-server-module.ts"), "utf8");
  assert.match(serverModule, /createGameSdkOnlineRoomModule/);
  assert.doesNotMatch(serverModule, /createRoom|applyCommand|presentRoom/);
  assert.doesNotMatch(serverModule, /Redis|DATABASE_URL|API_KEY/);

  const typeScriptConfig = join(cwd, "tsconfig.sdk.json");
  writeFileSync(typeScriptConfig, JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      baseUrl: resolve("."),
      paths: {
        "@game-fields/game-sdk": ["packages/game-sdk/dist/index.d.ts"],
        "@game-fields/game-sdk/runtime": ["packages/game-sdk/dist/runtime.d.ts"],
        "@game-fields/game-sdk/mock-runtime": ["packages/game-sdk/dist/mock-runtime.d.ts"],
      },
    },
    include: [
      join(gameDir, "sample-game-manifest.ts"),
      join(gameDir, "sample-game-contracts.ts"),
      join(gameDir, "sample-game-app-set.ts"),
      join(gameDir, "sample-game-server-module.ts"),
    ],
  }));
  const typeCheck = spawnSync(process.execPath, [
    resolve("node_modules/typescript/bin/tsc"),
    "-p",
    typeScriptConfig,
  ], { encoding: "utf8" });
  assert.equal(typeCheck.status, 0, `${typeCheck.stdout}\n${typeCheck.stderr}`);
});

test("game scaffold refuses to overwrite an existing game directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "game-fields-sdk-existing-"));
  const first = spawnSync(process.execPath, [script, "sample-game", "Sample"], { cwd, encoding: "utf8" });
  const second = spawnSync(process.execPath, [script, "sample-game", "Sample"], { cwd, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /already exists/);
});
