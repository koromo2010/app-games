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

test("admin exposes independent SDK to main and dev to main paths", () => {
  const panel = read("app/admin/ReleaseManagementPanel.tsx");
  const page = read("app/admin/page.tsx");
  const sdkRoute = read("app/api/admin/sdk-promotions/route.ts");
  const devRoute = read("app/api/admin/dev-release/route.ts");
  const portalRoute = read(
    "apps/sdk-portal/app/api/internal/promotions/route.ts",
  );
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");

  assert.match(panel, /SDK作品採用/);
  assert.match(panel, /SDK→main/);
  assert.match(panel, /dev反映/);
  assert.match(panel, /dev→main/);
  assert.match(page, /releaseManagementMode/);
  assert.match(page, /"preview"/);
  assert.match(panel, /dev試作表示です/);
  assert.match(panel, /isPreview \|\|/);
  assert.match(sdkRoute, /requirePromotionReadEnvironment/);
  assert.match(devRoute, /requireReleaseReadEnvironment/);
  assert.match(sdkRoute, /sdk-game\.promote/);
  assert.match(sdkRoute, /SDK_PROMOTION_MAIN_ONLY/);
  assert.match(devRoute, /code\.promote-develop-to-main/);
  assert.match(devRoute, /confirmation !== "dev→main"/);
  assert.match(portalRoute, /target !== "main"/);
  assert.match(portalRoute, /VERCEL_GIT_COMMIT_REF !== "main"/);
  assert.doesNotMatch(mcp, /promote_game_package_to_development/);
});
