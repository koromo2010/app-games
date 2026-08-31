import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

function section(value: string, start: string, end?: string) {
  const startIndex = value.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = end ? value.indexOf(end, startIndex + start.length) : value.length;
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return value.slice(startIndex, endIndex);
}

test("top and /games render the same server-side lobby read model", () => {
  const homePage = source("app/page.tsx");
  const gamesPage = source("app/games/page.tsx");
  const route = source("app/games/GameLobbyRoute.tsx");
  const loader = source("app/games/load-game-lobby-page-data.ts");

  assert.match(homePage, /<GameLobbyRoute\s*\/>/);
  assert.match(gamesPage, /<GameLobbyRoute\s*\/>/);
  assert.match(route, /loadGameLobbyPageData\(\)/);
  assert.match(route, /<GameLobby \{\.\.\.props\} \/>/);
  for (const read of [
    "loadSiteSettings",
    "loadGameOperations",
    "loadGameDurationEstimates",
  ]) {
    assert.match(loader, new RegExp(read));
  }
  assert.doesNotMatch(loader, /loadApprovedGameSdkCatalog/);
  assert.match(loader, /assembleGameLobbyCriticalPageData/);
  assert.doesNotMatch(loader, /save|record|ensurePostgresSchema|redisCommand|sdkSql/);
});

test("approved SDK catalog is revalidated after the critical lobby render", () => {
  const route = source("app/api/public/game-catalog/route.ts");
  const lobby = source("app/games/GameLobby.tsx");
  const client = source("app/games/use-deferred-game-lobby-catalog.ts");

  assert.match(route, /loadApprovedGameSdkCatalogSnapshot/);
  assert.match(route, /loadGameOperations/);
  assert.match(route, /publicGameCatalogResponse/);
  assert.match(client, /cache: "no-cache"/);
  assert.match(client, /credentials: "omit"/);
  assert.match(lobby, /data-sdk-catalog-state/);
});

test("only the measured above-fold Word Wolf visual receives high fetch priority", () => {
  const grid = source("app/games/LobbyGameGrid.tsx");
  assert.match(grid, /isMeasuredLobbyLcpImage = game\.id === "wordwolf"/);
  assert.match(grid, /loading=\{isMeasuredLobbyLcpImage \? "eager" : "lazy"\}/);
  assert.match(grid, /fetchPriority=\{isMeasuredLobbyLcpImage \? "high" : "auto"\}/);
  assert.equal((grid.match(/fetchPriority=/g) ?? []).length, 1);
});

test("public catalog storage paths contain reads only", () => {
  const operationsStore = source("lib/game-operations-store.ts");
  const operationLoad = section(
    operationsStore,
    "export async function loadGameOperations(",
    "export async function loadGameOperation(",
  );
  assert.match(operationsStore, /import \{ readGameOperationsFromRedis \} from "\.\/game-operations-read\.ts"/);
  assert.match(operationLoad, /readGameOperationsFromRedis\(\{/);

  const operationsRead = source("lib/game-operations-read.ts");
  const redisRead = section(
    operationsRead,
    "export async function readGameOperationsFromRedis(",
  );
  assert.match(redisRead, /gameOperationsKey\(input\.environment\)/);
  assert.match(redisRead, /unscopedGameOperationsKey/);
  assert.match(redisRead, /legacyGameOperationsKey/);
  assert.equal((redisRead.match(/"GET"/g) ?? []).length, 3);
  assert.doesNotMatch(redisRead, /"(?:SET|DEL|EVAL|EXPIRE|PERSIST)"/);

  const durationStore = source("lib/game-duration-store.ts");
  const postgresRead = section(
    durationStore,
    "async function loadPostgresSamples()",
    "async function loadRedisSamples()",
  );
  assert.match(postgresRead, /SELECT game_type/);
  assert.doesNotMatch(postgresRead, /ensurePostgresSchema|\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i);

  const durationRedisRead = section(
    durationStore,
    "async function loadRedisSamples()",
    "async function loadDurationSamples()",
  );
  assert.match(durationRedisRead, /"ZREVRANGE"/);
  assert.doesNotMatch(durationRedisRead, /"(?:SET|DEL|EVAL|ZADD|EXPIRE)"/);

  const sdkSchema = section(
    source("apps/sdk-portal/lib/sdk-postgres.ts"),
    "export async function ensureSdkSchema()",
  );
  assert.match(sdkSchema, /SELECT COALESCE\(MAX\(version\), 0\)/);
  assert.doesNotMatch(sdkSchema, /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i);

  const runtimeCatalogGet = section(
    source("apps/sdk-portal/app/api/runtime-catalog/route.ts"),
    "export async function GET(request: Request)",
  );
  assert.match(runtimeCatalogGet, /WHERE r\.is_current/);
  assert.doesNotMatch(runtimeCatalogGet, /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i);
});

test("hidden, deleted, and invalid SDK entries do not reach the public grid", () => {
  const lobby = source("app/games/GameLobby.tsx");
  const runtimeCatalog = source("lib/game-sdk-runtime-catalog.ts");
  const runtimeCatalogRoute = source("apps/sdk-portal/app/api/runtime-catalog/route.ts");

  assert.match(lobby, /operation\.publication !== "hidden"/);
  assert.match(lobby, /operation\.publication === "public" \|\| privateUnlocked/);
  assert.match(runtimeCatalogRoute, /WHERE r\.is_current/);
  assert.match(runtimeCatalog, /if \(!validCatalogListPayload\(payload, channel\)\)/);
  assert.match(runtimeCatalog, /throw new Error\("GAME_SDK_RUNTIME_CATALOG_INVALID"\)/);
});
