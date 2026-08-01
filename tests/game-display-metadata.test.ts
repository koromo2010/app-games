import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createGameDisplayMetadataSnapshot,
  loadGameDisplayMetadataSnapshot,
  resolveGameDisplayMetadata,
} from "../lib/game-display-metadata.ts";
import { gameReplayShareText } from "../lib/game-replay-types.ts";

const builtIn = {
  ja: [{ id: "wordwolf", title: "ワードウルフ", href: "/wordwolf" }],
  en: [{ id: "wordwolf", title: "Word Wolf", href: "/wordwolf" }],
} as const;

const sdk = {
  ja: [
    { id: "link-lines", title: "道つなぎ", href: "/sdk-games/link-lines" },
    { id: "ai-word-guess", title: "コトバに迫れ", href: "/sdk-games/ai-word-guess" },
  ],
  en: [
    { id: "link-lines", title: "Link Lines", href: "/sdk-games/link-lines" },
    { id: "ai-word-guess", title: "Close in on the Word", href: "/sdk-games/ai-word-guess" },
  ],
} as const;

test("sdk:link-linesの戦績はlocale名へ解決され、raw IDをHTMLへ出さない", () => {
  const snapshot = createGameDisplayMetadataSnapshot({ builtIn, sdk });
  const ja = resolveGameDisplayMetadata(snapshot, "sdk:link-lines", "ja");
  const en = resolveGameDisplayMetadata(snapshot, "sdk:link-lines", "en");
  const html = `<p>${ja.displayName} · 勝利</p>`;

  assert.equal(ja.displayName, "道つなぎ");
  assert.equal(en.displayName, "Link Lines");
  assert.doesNotMatch(html, /SDK: sdk:link-lines|sdk:link-lines/);
});

test("stable ID、score key、URLは表示名を変更しても変わらない", () => {
  const before = createGameDisplayMetadataSnapshot({ builtIn, sdk });
  const renamed = createGameDisplayMetadataSnapshot({
    builtIn,
    sdk: {
      ja: [{ ...sdk.ja[0], title: "新しい道つなぎ" }],
      en: [{ ...sdk.en[0], title: "New Link Lines" }],
    },
  });

  assert.equal(before["sdk:link-lines"]?.stableId, "sdk:link-lines");
  assert.equal(renamed["sdk:link-lines"]?.stableId, "sdk:link-lines");
  assert.equal(renamed["sdk:link-lines"]?.href, "/sdk-games/link-lines");
  assert.equal(resolveGameDisplayMetadata(renamed, "sdk:link-lines", "ja").displayName, "新しい道つなぎ");
});

test("複数SDKゲームと同名ゲームはstable IDごとに個別解決する", () => {
  const sameNameSdk = {
    ja: sdk.ja.map((game) => ({ ...game, title: "同じ名前" })),
    en: sdk.en.map((game) => ({ ...game, title: "Same name" })),
  };
  const snapshot = createGameDisplayMetadataSnapshot({ builtIn, sdk: sameNameSdk });

  assert.equal(Object.keys(snapshot).length, 3);
  assert.equal(snapshot["sdk:link-lines"]?.href, "/sdk-games/link-lines");
  assert.equal(snapshot["sdk:ai-word-guess"]?.href, "/sdk-games/ai-word-guess");
  assert.notEqual(snapshot["sdk:link-lines"]?.stableId, snapshot["sdk:ai-word-guess"]?.stableId);
});

test("unknown、deleted、private相当のSDK IDは内部IDや保存済み名称へfallbackしない", () => {
  const snapshot = createGameDisplayMetadataSnapshot({ builtIn, sdk });
  const unknown = resolveGameDisplayMetadata(snapshot, "sdk:private-draft", "ja");
  const share = gameReplayShareText({
    gameType: "sdk:private-draft",
    title: "非公開の制作者名",
    resultLabel: "勝利",
    shareHighlights: [],
  }, snapshot, "ja");

  assert.equal(unknown.available, false);
  assert.equal(unknown.displayName, "SDKゲーム");
  assert.equal(unknown.href, "/games");
  assert.doesNotMatch(share, /private-draft|非公開の制作者名|sdk:/);
});

test("組み込みゲームの名称とlinkを維持し、英語名欠落時は日本語名へfallbackする", () => {
  const snapshot = createGameDisplayMetadataSnapshot({
    builtIn: {
      ja: builtIn.ja,
      en: [{ id: "wordwolf", title: "", href: "/wordwolf" }],
    },
    sdk: { ja: [], en: [] },
  });
  const game = resolveGameDisplayMetadata(snapshot, "wordwolf", "en");

  assert.equal(game.displayName, "ワードウルフ");
  assert.equal(game.href, "/wordwolf");
});

test("SDK catalogのlocale名が空でも組み込み名やraw IDを表示しない", () => {
  const snapshot = createGameDisplayMetadataSnapshot({
    builtIn,
    sdk: {
      ja: [{ id: "link-lines", title: "", href: "/sdk-games/link-lines" }],
      en: [{ id: "link-lines", title: "", href: "/sdk-games/link-lines" }],
    },
  });
  const game = resolveGameDisplayMetadata(snapshot, "sdk:link-lines", "en");

  assert.equal(game.displayName, "SDKゲーム");
  assert.doesNotMatch(game.displayName, /link-lines|sdk:/i);
});

test("1 request内のcatalog取得は1回で、失敗時もraw SDK IDを返さない", async () => {
  let calls = 0;
  const loaded = await loadGameDisplayMetadataSnapshot({
    builtIn,
    loadSdkCatalog: async () => {
      calls += 1;
      return sdk;
    },
  });
  assert.equal(calls, 1);
  assert.equal(resolveGameDisplayMetadata(loaded, "sdk:link-lines", "ja").displayName, "道つなぎ");

  const failed = await loadGameDisplayMetadataSnapshot({
    builtIn,
    loadSdkCatalog: async () => {
      throw new Error("catalog unavailable");
    },
  });
  assert.equal(resolveGameDisplayMetadata(failed, "sdk:link-lines", "en").displayName, "SDK game");
});

test("top、一覧、戦績、履歴は共有resolverを使用し、raw fallbackを持たない", () => {
  const surfaces = [
    "app/games/GameLobby.tsx",
    "app/games/LobbyStatsPanel.tsx",
    "app/users/me/UserDashboard.tsx",
    "app/components/GameReplayPanel.tsx",
  ].map((path) => readFileSync(path, "utf8"));

  for (const source of surfaces) {
    assert.match(source, /resolveGameDisplayMetadata/);
    assert.doesNotMatch(source, /\?\?\s*result\.gameType/);
    assert.doesNotMatch(source, /slice\(["']sdk:/);
  }
});

test("display metadataの公開GET loaderはcatalog readだけでRedis／DB mutationを持たない", () => {
  const source = readFileSync("lib/game-display-metadata-server.ts", "utf8");
  assert.match(source, /loadApprovedGameSdkCatalog/);
  assert.doesNotMatch(source, /redisCommand|sdkSql|loadGameOperations|\bSET\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
});
