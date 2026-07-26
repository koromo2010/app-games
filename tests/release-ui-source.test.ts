import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("lobby keeps card UI and adds a persisted accessible list view", () => {
  const source = read("app/games/LobbyGameGrid.tsx");
  assert.match(source, /LobbyGameCard/);
  assert.match(source, /LobbyGameListRow/);
  assert.match(source, /game-fields:lobby-game-view-mode/);
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /aria-pressed=\{viewMode === "cards"\}/);
  assert.match(source, /aria-pressed=\{viewMode === "list"\}/);
  assert.match(source, /game\.tags\.map/);
  assert.match(source, /activeRoom/);
  assert.match(source, /GameEntryAction/);
});

test("admin exposes environment-paired SDK adoption and independent dev to main", () => {
  const panel = read("app/admin/ReleaseManagementPanel.tsx");
  const page = read("app/admin/page.tsx");
  const sdkRoute = read("app/api/admin/sdk-promotions/route.ts");
  const devRoute = read("app/api/admin/dev-release/route.ts");
  const portalRoute = read(
    "apps/sdk-portal/app/api/internal/promotions/route.ts",
  );
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");

  assert.match(panel, /SDK作品採用/);
  assert.match(panel, /SDK-dev→dev/);
  assert.match(panel, /SDK→main/);
  assert.match(panel, /dev反映/);
  assert.match(panel, /dev→main/);
  assert.match(page, /releaseManagementMode/);
  assert.match(page, /"preview"/);
  assert.match(panel, /SDK-dev→devの採用検証をここで実行できます/);
  assert.match(panel, /const sdkTarget = isPreview \? "development" : "main"/);
  assert.match(panel, /isPreview \|\|/);
  assert.doesNotMatch(panel, /disabled=\{isPreview \|\| current \|\| !complete/);
  assert.match(panel, /sdkLoadError/);
  assert.match(panel, /devLoadError/);
  assert.match(panel, /sdkFailureMessage/);
  assert.match(panel, /識別情報: \$\{statusLabel\} \/ \$\{safeCode\}/);
  assert.match(panel, /次の操作:/);
  assert.match(panel, /whitespace-pre-line/);
  assert.match(sdkRoute, /requirePromotionReadEnvironment/);
  assert.match(sdkRoute, /requirePromotionAdminEnvironment/);
  assert.match(sdkRoute, /sdkPromotionInternalBaseUrl/);
  assert.match(sdkRoute, /body\.target !== promotionTarget\(\)/);
  assert.match(devRoute, /requireReleaseReadEnvironment/);
  assert.match(sdkRoute, /sdk-game\.promote/);
  assert.match(sdkRoute, /SDK_PROMOTION_MAIN_ONLY/);
  assert.match(devRoute, /code\.promote-develop-to-main/);
  assert.match(devRoute, /confirmation !== "dev→main"/);
  assert.match(
    portalRoute,
    /branch !== "main" && branch !== "develop"/,
  );
  assert.match(portalRoute, /authorize\(request\)/);
  assert.match(portalRoute, /const expectedTarget = expectedPromotionTarget\(\)/);
  assert.match(portalRoute, /target !== expectedTarget/);
  assert.doesNotMatch(portalRoute, /promotion_main_only/);
  assert.doesNotMatch(mcp, /promote_game_package_to_development/);
});

test("admin publication management includes adopted SDK games", () => {
  const panel = read("app/admin/GameOperationsPanel.tsx");
  const route = read("app/api/admin/game-operations/route.ts");
  const operations = read("lib/game-operations.ts");
  const store = read("lib/game-operations-store.ts");

  assert.match(panel, /\[\.\.\.registry, \.\.\.sdkGames\]/);
  assert.match(panel, /SDK採用作品/);
  assert.match(route, /loadApprovedGameSdkCatalog/);
  assert.match(route, /games: games\.map/);
  assert.match(route, /validateGameOperationsInput\(body\.operations, games\)/);
  assert.match(operations, /additionalGames: GameOperationDefinition\[\]/);
  assert.match(store, /normalizeGameOperations\(value, additionalGames\)/);
});
