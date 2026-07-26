import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const gamesPage = source("app/games/page.tsx");
const adminRoute = source("app/api/admin/game-operations/route.ts");
const store = source("lib/game-operations-store.ts");

test("lobby uses canonical stored visibility for approved SDK games", () => {
  assert.match(gamesPage, /loadGameOperations\(\{\}, sdkGames\)/);
  assert.doesNotMatch(gamesPage, /sdkOperations/);
  assert.doesNotMatch(gamesPage, /publication:\s*"public"/);
  assert.match(gamesPage, /gameOperations=\{gameOperations\}/);
});

test("admin and lobby normalize the same complete game set", () => {
  assert.match(adminRoute, /loadGameOperations\(\{ fresh: true \}, games\)/);
  assert.match(adminRoute, /saveGameOperations\([\s\S]*body\.operations[\s\S]*games/);
  assert.match(store, /additionalGames: AdditionalGame\[\]/);
  assert.match(store, /normalizeGameOperations\(cache\.operations, additionalGames\)/);
  assert.match(store, /defaultGameOperations\(additionalGames\)/);
});
