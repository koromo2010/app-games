import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("official SDK examples are system-owned routes, not creator accounts", () => {
  const catalog = read("app/sdk-examples/page.tsx");
  const example = read("app/sdk-examples/word-wolf/word-wolf-sdk-example.tsx");
  const portal = read("apps/sdk-portal/app/sdk-examples/page.tsx");
  const bridge = read("app/sdk-examples/SdkOfficialExampleNavigationBridge.tsx");
  const frame = read("apps/sdk-portal/app/sdk-examples/OfficialExampleFrame.tsx");
  const portalExample = read("apps/sdk-portal/app/sdk-examples/word-wolf/page.tsx");
  assert.match(catalog, /<GameLobby/);
  assert.match(catalog, /additionalGames=\{officialGames\}/);
  assert.match(catalog, /includeBuiltInGames=\{false\}/);
  assert.match(catalog, /gameId: "sdk-official-word-wolf"/);
  assert.match(catalog, /publication: "public"/);
  assert.match(catalog, /sdk-examples\/word-wolf/);
  assert.match(example, /import \{ WordWolfGame \} from "@\/app\/wordwolf\/WordWolfGame"/);
  assert.match(example, /SdkOfficialExampleNavigationBridge/);
  assert.match(example, /<WordWolfGame \/>/);
  assert.match(bridge, /game-fields:sdk-official-example:navigate/);
  assert.match(bridge, /href: "\/sdk-examples"/);
  assert.match(frame, /event\.origin !== trustedOrigin/);
  assert.match(frame, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(frame, /router\.push\("\/sdk-examples"\)/);
  assert.match(portalExample, /<OfficialExampleFrame/);
  assert.doesNotMatch(example, /createGameSdkMockRuntime|wordWolfSdkServerModule/);
  assert.match(portal, /\/sdk-examples/);
  assert.doesNotMatch(catalog + example + portal, /sdk_creators|owner_player_id|management_token/);
});
