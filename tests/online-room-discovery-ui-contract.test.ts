import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(
  new URL(`../${path}`, import.meta.url),
  "utf8",
);

const builtInApiClients = [
  "app/wordwolf/wordwolf-room-api-client.ts",
  "app/tahoiya/tahoiya-room-api-client.ts",
  "app/hodoai-talk/hodoai-room-api-client.ts",
  "app/northern-branch/northern-branch-room-api-client.ts",
  "app/kotoba-senpuku/kotoba-senpuku-room-api-client.ts",
  "app/nigoichi/nigoichi-room-api-client.ts",
  "app/code-intercept/code-intercept-room-api-client.ts",
  "app/daifugo/daifugo-room-api-client.ts",
];

test("8 built-in games share terminal cursor traversal", () => {
  for (const path of builtInApiClients) {
    assert.match(read(path), /createOnlineRoomApiClient/, path);
  }
  const client = read("lib/online-room-api-client.ts");
  assert.match(client, /consumeOnlineRoomDiscovery/);
  assert.match(client, /expectedRoomInstanceId/);
});

test("built-in UIs do not confirm an empty list while traversal is in flight", () => {
  assert.match(
    read("app/wordwolf/use-wordwolf-room-lifecycle.ts"),
    /setIsJoinListOpen\(false\);[\s\S]*?listJoinableRoomsFromStore\(\)/,
  );
  for (const path of [
    "app/hodoai-talk/use-hodoai-room-actions.ts",
    "app/northern-branch/use-northern-branch-controller.ts",
    "app/kotoba-senpuku/use-kotoba-senpuku-controller.ts",
    "app/nigoichi/use-nigoichi-controller.ts",
    "app/code-intercept/use-code-intercept-controller.ts",
    "app/daifugo/use-daifugo-controller.ts",
  ]) {
    assert.match(read(path), /setShowChoices\(false\);[\s\S]*?fetchJoinableRooms\(\)/, path);
  }
  assert.match(
    read("app/tahoiya/TahoiyaRoomPanel.tsx"),
    /joinableRooms\.length > 0 &&/,
  );
});

test("both SDK Room UIs reserve empty confirmation for terminal completion", () => {
  const lifecycle = read("app/components/game-sdk/use-game-sdk-room-lifecycle.ts");
  const frame = read("app/components/game-sdk/GameSdkFrameView.tsx");
  const approved = read("app/sdk-games/[gameId]/ApprovedSdkGameShell.tsx");

  assert.match(lifecycle, /setHasCompletedRoomDiscovery\(false\)/);
  assert.match(lifecycle, /setHasCompletedRoomDiscovery\(true\)/);
  assert.match(frame, /hasCompletedRoomDiscovery && rooms\.length === 0/);
  assert.match(approved, /hasCompletedRoomDiscovery && rooms\.length === 0/);
});

test("navigation, locale change, and unmount invalidate active traversal", () => {
  const transitions = read("app/components/RouteTransitionProvider.tsx");
  assert.match(transitions, /abortAllOnlineRoomDiscoveries/);
  assert.match(transitions, /\[locale, pathname\]/);
});
