import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(
  new URL(`../${path}`, import.meta.url),
  "utf8",
);

const onlineRoomStores = [
  "lib/code-intercept-room-store.ts",
  "lib/daifugo-room-store.ts",
  "lib/hodoai-room-store.ts",
  "lib/kotoba-senpuku-room-store.ts",
  "lib/nigoichi-room-store.ts",
  "lib/northern-branch-room-store.ts",
  "lib/tahoiya-room-store.ts",
  "lib/wordwolf-room-store.ts",
];

test("オンラインRoom Storeは共通platform runtimeへ接続する", () => {
  for (const path of onlineRoomStores) {
    const source = read(path);

    assert.match(source, /createPlatformOnlineRoomStoreRuntime/);
    assert.doesNotMatch(source, /claimOnlineRoomForPlayer/);
    assert.doesNotMatch(source, /loadPlayerActiveOnlineRoom/);
    assert.doesNotMatch(source, /dissolveIndexedOnlineRoom/);
    assert.doesNotMatch(source, /loadIndexedOnlineRoomPage/);
  }
});

test("platform runtimeはactive-room解放と期限切れ一覧除外を所有する", () => {
  const source = read("lib/online-room-store-runtime.ts");

  assert.match(source, /releasePlayerActiveRoom/);
  assert.match(source, /releaseMany/);
  assert.match(source, /isMultiplayerRoomExpired\(room\.updatedAt\)/);
});
