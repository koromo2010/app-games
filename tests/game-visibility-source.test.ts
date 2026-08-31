import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const gamesPage = source("app/games/page.tsx");
const lobbyRoute = source("app/games/GameLobbyRoute.tsx");
const lobbyLoader = source("app/games/load-game-lobby-page-data.ts");
const lobbyPageData = source("app/games/game-lobby-page-data.ts");
const criticalLobbyPageData = lobbyPageData.split(
  "export type DeferredGameLobbyCatalogSources",
)[0]!;
const adminRoute = source("app/api/admin/game-operations/route.ts");
const store = source("lib/game-operations-store.ts");
const readStore = source("lib/game-operations-read.ts");

test("lobby uses canonical stored visibility for approved SDK games", () => {
  assert.match(gamesPage, /import \{ GameLobbyRoute \} from "\.\/GameLobbyRoute"/);
  assert.match(gamesPage, /return <GameLobbyRoute \/>/);
  assert.match(lobbyRoute, /loadGameLobbyPageData/);
  assert.match(lobbyRoute, /return <GameLobby \{\.\.\.props\} \/>/);
  assert.match(lobbyLoader, /loadGameOperations/);
  assert.doesNotMatch(lobbyLoader, /loadApprovedGameSdkCatalog/);
  assert.match(lobbyLoader, /assembleGameLobbyCriticalPageData\(\{/);
  assert.match(lobbyPageData, /sources\.loadGameOperations\(\{\}, \[\]\)/);

  const readModel = [gamesPage, lobbyRoute, lobbyLoader, criticalLobbyPageData].join("\n");
  assert.doesNotMatch(readModel, /loadApprovedGameSdkCatalogSnapshot/);
  assert.doesNotMatch(readModel, /publication:\s*"public"/);
});

test("admin and lobby normalize the same complete game set", () => {
  assert.match(adminRoute, /loadGameOperations\(\{ fresh: true \}, games\)/);
  assert.match(adminRoute, /validateGameOperationsInput\(body\.operations, games\)/);
  assert.match(adminRoute, /saveGameOperations\([\s\S]*body\.operations[\s\S]*games/);
  assert.match(store, /additionalGames: GameOperationDefinition\[\] = \[\]/);
  assert.match(store, /normalizeGameOperations\(cache\.operations, additionalGames\)/);
  assert.match(store, /defaultGameOperations\(additionalGames\)/);
  assert.match(store, /readGameOperationsFromRedis\(\{[\s\S]*additionalGames,/);
  assert.match(readStore, /additionalGames\?: GameOperationDefinition\[\]/);
  assert.match(readStore, /normalizeGameOperations\(current, additionalGames\)/);
  assert.match(readStore, /normalizeGameOperations\(unscoped, additionalGames\)/);
  assert.match(readStore, /defaultGameOperations\(additionalGames\)/);
});
