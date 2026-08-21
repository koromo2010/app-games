import assert from "node:assert/strict";
import test from "node:test";
import { gameEntryOverviewFor } from "../lib/game-entry-overview.ts";

test("entry overview is derived from the registry and links only to a published available landing page", () => {
  const tahoiya = gameEntryOverviewFor("tahoiya", "ja");
  assert.deepEqual(tahoiya, {
    gameId: "tahoiya",
    title: "たほい屋",
    summary: "知らない言葉に辞書らしい偽の説明を作り、本物の説明に紛れ込ませて投票でだまし合うゲーム。",
    players: "3-8人",
    time: "10-20分",
    tags: ["対戦", "ブラフ", "作文"],
    helpHref: "/games/tahoiya",
  });

  assert.equal(gameEntryOverviewFor("wordwolf", "ja")?.helpHref, null);
  assert.equal(gameEntryOverviewFor("tahoiya", "en")?.helpHref, null);
  assert.equal(gameEntryOverviewFor("missing-game", "ja"), null);
});
