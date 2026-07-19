import assert from "node:assert/strict";
import test from "node:test";
import { canAssignHodoaiSorter, canReorderHodoaiCards, canViewHodoaiCardValue, clueHasNumber, dealHodoaiCards, hodoaiClueRoundDestination, hodoaiGameShareText, hodoaiResultPresentation, hodoaiSharePlayerLabel, hodoaiThemes, isValidHodoaiClue, normalizeHodoaiClue, normalizeHodoaiConfig, pickRandomHodoaiSorter } from "../lib/hodoai-talk.ts";

test("設定枚数ぶんの重複しない数字カードを各プレイヤーへ配る", () => {
  const players = [
    { id: "p1", name: "A", joinedAt: 1 },
    { id: "p2", name: "B", joinedAt: 2 },
  ];
  const dealt = dealHodoaiCards(players, 3);
  assert.equal(dealt.cards.length, 6);
  assert.equal(dealt.cards.filter((card) => card.ownerId === "p1").length, 3);
  assert.equal(dealt.cards.filter((card) => card.ownerId === "p2").length, 3);
  assert.equal(new Set(Object.values(dealt.values)).size, 6);
});

test("1人あたりのカード枚数は初期値1枚、設定範囲は1〜5枚", () => {
  assert.equal(normalizeHodoaiConfig({}).cardsPerPlayer, 1);
  assert.equal(normalizeHodoaiConfig({ cardsPerPlayer: 0 }).cardsPerPlayer, 1);
  assert.equal(normalizeHodoaiConfig({ cardsPerPlayer: 99 }).cardsPerPlayer, 5);
});

test("数字の直接説明は半角・全角・漢数字ともヒントに使えない", () => {
  assert.equal(clueHasNumber("80くらい"), true);
  assert.equal(clueHasNumber("八十くらい"), true);
  assert.equal(clueHasNumber("キャンプ"), false);
});

test("1文字のことばも提出でき、空欄と数字だけを拒否する", () => {
  assert.equal(isValidHodoaiClue("猫"), true);
  assert.equal(isValidHodoaiClue("  雨  "), true);
  assert.equal(isValidHodoaiClue("  "), false);
  assert.equal(isValidHodoaiClue("百"), false);
  assert.equal(normalizeHodoaiClue("  青い   空  "), "青い 空");
});

test("途中のことば回では同じカードのまま次へ進み、最終回だけ並べ替える", () => {
  assert.equal(hodoaiClueRoundDestination(1, 3), "clue");
  assert.equal(hodoaiClueRoundDestination(2, 3), "clue");
  assert.equal(hodoaiClueRoundDestination(3, 3), "arrange");
});

test("並べ替えフェーズでは指定された1人だけがカードを操作できる", () => {
  assert.equal(canReorderHodoaiCards({ phase: "arrange", sorterId: "sorter" }, "sorter"), true);
  assert.equal(canReorderHodoaiCards({ phase: "arrange", sorterId: "sorter" }, "host"), false);
  assert.equal(canReorderHodoaiCards({ phase: "clue", sorterId: "sorter" }, "sorter"), false);
});

test("並べ替え役は参加者からランダムに選ぶ", () => {
  const players = [
    { id: "first", name: "A", joinedAt: 1 },
    { id: "second", name: "B", joinedAt: 2 },
    { id: "third", name: "C", joinedAt: 3 },
  ];
  assert.equal(pickRandomHodoaiSorter(players, () => 0), "first");
  assert.equal(pickRandomHodoaiSorter(players, () => 0.5), "second");
  assert.equal(pickRandomHodoaiSorter(players, () => 0.999), "third");
});

test("並べ替え中は自分の秘密の数字だけ確認できる", () => {
  assert.equal(canViewHodoaiCardValue({ ownerId: "self" }, "self"), true);
  assert.equal(canViewHodoaiCardValue({ ownerId: "other" }, "self"), false);
  assert.equal(canViewHodoaiCardValue({ ownerId: "other" }, "self", true), true);
});

test("ワードスケールのお題は十分な種類がありIDが重複しない", () => {
  assert.ok(hodoaiThemes.length >= 36);
  assert.equal(new Set(hodoaiThemes.map((theme) => theme.id)).size, hodoaiThemes.length);
});

test("ホストはロビーと並べ替え中だけ実在する参加者を並べ替え役にできる", () => {
  const players = [{ id: "host", name: "A", joinedAt: 1 }, { id: "sorter", name: "B", joinedAt: 2 }];
  assert.equal(canAssignHodoaiSorter({ phase: "lobby", hostId: "host", players }, "host", "sorter"), true);
  assert.equal(canAssignHodoaiSorter({ phase: "arrange", hostId: "host", players }, "host", "sorter"), true);
  assert.equal(canAssignHodoaiSorter({ phase: "clue", hostId: "host", players }, "host", "sorter"), false);
  assert.equal(canAssignHodoaiSorter({ phase: "lobby", hostId: "host", players }, "sorter", "sorter"), false);
  assert.equal(canAssignHodoaiSorter({ phase: "lobby", hostId: "host", players }, "host", "missing"), false);
});

test("ワードスケールの共有ログは本人が許可した表示名だけを、数字・ことばと一緒に載せる", () => {
  const text = hodoaiGameShareText({
    totalPoints: 2,
    players: [
      { id: "player-1", name: "あかり", shareNameAllowed: true },
      { id: "player-2", name: "ひみつ", shareNameAllowed: false },
    ],
    history: [{
      round: 1,
      theme: { id: "gift", title: "贈り物", lowLabel: "低", highLabel: "高" },
      inversions: 1,
      points: 2,
      cards: [{ id: "player-1", ownerId: "player-1", cardNumber: 1 }, { id: "player-2", ownerId: "player-2", cardNumber: 1 }],
      clueRounds: [
        { round: 1, theme: { id: "gift", title: "贈り物", lowLabel: "低", highLabel: "高" }, clues: { "player-1": "秘密のヒント" } },
        { round: 2, theme: { id: "trip", title: "旅行", lowLabel: "低", highLabel: "高" }, clues: { "player-1": "別の秘密" } },
      ],
      order: ["player-2", "player-1"],
      values: { "player-1": 80, "player-2": 20 },
      clues: { "player-1": "秘密のヒント" },
    }],
  });
  assert.match(text, /チーム得点 2\/3点/);
  assert.match(text, /ことば1「贈り物」/);
  assert.match(text, /ことば2「旅行」/);
  assert.match(text, /1\. 80｜秘密のヒント \/ 別の秘密｜あかり・カード1/);
  assert.match(text, /2\. 20｜ことばなし｜PLAYER2・カード1/);
  assert.doesNotMatch(text, /player-1|ひみつ/);
});

test("共有名の同意がない参加者は入室順のPLAYER表記になる", () => {
  const players = [{ id: "first", name: "名前を出さない", shareNameAllowed: false }, { id: "second", name: "名前を出す", shareNameAllowed: true }];
  assert.equal(hodoaiSharePlayerLabel(players, "first"), "PLAYER1");
  assert.equal(hodoaiSharePlayerLabel(players, "second"), "名前を出す");
});

test("答え合わせ・共有・プレイバック用の結果行は同じ120から0の順序を使う", () => {
  const result = {
    round: 1,
    theme: { id: "scale", title: "尺度", lowLabel: "低", highLabel: "高" },
    inversions: 0,
    points: 3,
    cards: [
      { id: "low", ownerId: "p1", cardNumber: 1 },
      { id: "high", ownerId: "p2", cardNumber: 1 },
    ],
    clueRounds: [{ round: 1, theme: { id: "scale", title: "尺度", lowLabel: "低", highLabel: "高" }, clues: { low: "小", high: "大" } }],
    order: ["low", "high"],
    values: { low: 10, high: 110 },
    clues: { low: "小", high: "大" },
  };
  const presentation = hodoaiResultPresentation(result, [
    { id: "p1", name: "A" },
    { id: "p2", name: "B" },
  ]);
  assert.equal(presentation.order, "descending");
  assert.deepEqual(presentation.rows.map((row) => row.value), [110, 10]);
});
