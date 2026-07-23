import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builtInOnlineGameProofs = [
  {
    game: "wordwolf",
    files: ["lib/wordwolf-command-domain.ts"],
    tokens: [
      "allGameSdkParticipantsComplete",
      "assignGameSdkRoles",
      "tallyGameSdkVotes",
    ],
  },
  {
    game: "tahoiya",
    files: ["lib/tahoiya-room-domain.ts"],
    tokens: [
      "allGameSdkParticipantsComplete",
      "tallyGameSdkVotes",
    ],
  },
  {
    game: "hodoai",
    files: ["lib/hodoai-room-domain.ts"],
    tokens: [
      "allGameSdkParticipantsComplete",
      "nextGameSdkRoundStep",
    ],
  },
  {
    game: "kotoba-senpuku",
    files: [
      "lib/kotoba-senpuku-room-domain.ts",
      "lib/kotoba-senpuku.ts",
    ],
    tokens: [
      "allGameSdkParticipantsComplete",
      "nextGameSdkEligibleSeat",
    ],
  },
  {
    game: "nigoichi",
    files: ["lib/nigoichi.ts"],
    tokens: ["allGameSdkParticipantsComplete"],
  },
  {
    game: "code-intercept",
    files: [
      "lib/code-intercept-room-domain.ts",
      "lib/code-intercept.ts",
    ],
    tokens: [
      "allGameSdkParticipantsComplete",
      "distributeGameSdkBalancedTeams",
    ],
  },
  {
    game: "northern-branch",
    files: ["lib/northern-branch-game.ts"],
    tokens: ["nextGameSdkEligibleSeat"],
  },
  {
    game: "daifugo",
    files: ["lib/daifugo.ts"],
    tokens: ["nextGameSdkEligibleSeat"],
  },
] as const;

test("8つの既存オンラインゲームが同じ共通進行モジュールを使う", () => {
  assert.equal(builtInOnlineGameProofs.length, 8);
  for (const proof of builtInOnlineGameProofs) {
    const source = proof.files
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.match(
      source,
      /@game-fields\/game-sdk\/modules/,
      `${proof.game} must import the canonical shared modules`,
    );
    for (const token of proof.tokens) {
      assert.equal(
        source.includes(token),
        true,
        `${proof.game} must use ${token}`,
      );
    }
  }
});

test("既存Room基盤はSDK用の別実装へ置き換えない", () => {
  const architecture = readFileSync(
    "docs/MODULAR_GAME_ARCHITECTURE.md",
    "utf8",
  );
  for (const token of [
    "lib/online-room-route-factory.ts",
    "lib/online-room-store-runtime.ts",
    "packages/game-runtime/src/online-room.ts",
  ]) {
    assert.equal(architecture.includes(token), true);
  }
});
