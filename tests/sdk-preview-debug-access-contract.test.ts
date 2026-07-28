import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previewRoomRoute = readFileSync(
  "app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts",
  "utf8",
);

test("formal Preview grants DEBUG to the linked creator or an approved site admin", () => {
  assert.match(previewRoomRoute, /getSdkPreviewAccountPlayerId\(creatorSlug\)/);
  assert.match(previewRoomRoute, /playerHasDebugAccess\(session\.id\)/);
  assert.match(previewRoomRoute, /creatorPlayerId === session\.id[\s\S]*?isSiteAdminIdentity/);
  assert.match(
    previewRoomRoute,
    /debugAccess: creatorPlayerId === session\.id[\s\S]*?\|\| isSiteAdminIdentity[\s\S]*?gameSdkModuleIsRequired\(moduleProfile, "debug"\)/,
  );
  assert.doesNotMatch(previewRoomRoute, /debugAccess:\s*true/);
});
