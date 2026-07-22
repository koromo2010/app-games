import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("official SDK examples are system-owned routes, not creator accounts", () => {
  const catalog = read("app/sdk-examples/page.tsx");
  const example = read("app/sdk-examples/word-wolf/word-wolf-sdk-example.tsx");
  const portal = read("apps/sdk-portal/app/sdk-examples/page.tsx");
  assert.match(catalog, /GAME FIELDS OFFICIAL/);
  assert.match(catalog, /sdk-examples\/word-wolf/);
  assert.match(example, /wordWolfSdkServerModule/);
  assert.match(example, /createGameSdkMockRuntime/);
  assert.match(example, /room\/rematch/);
  assert.match(example, /role: "spectator"/);
  assert.match(portal, /\/sdk-examples/);
  assert.doesNotMatch(catalog + example + portal, /sdk_creators|owner_player_id|management_token/);
});
