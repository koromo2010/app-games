import assert from "node:assert/strict";
import test from "node:test";
import { assembleGameLobbyPageData } from "../app/games/game-lobby-page-data.ts";

test("shared lobby data includes approved SDK games without changing catalog order", async () => {
  const sdkGames = [
    { id: "sdk-newer", title: "Newer SDK game" },
    { id: "sdk-older", title: "Older SDK game" },
  ];
  const operations = [
    { gameId: "sdk-newer", publication: "public" },
    { gameId: "sdk-older", publication: "hidden" },
  ];
  const durationEstimates = { wordwolf: { label: "8–12 min", sampleCount: 12 } };
  let operationsInput: unknown;

  const data = await assembleGameLobbyPageData({
    loadApprovedGameSdkCatalog: async () => sdkGames,
    loadSiteSettings: async () => ({ siteName: "GAME FIELDS TEST" }),
    loadGameOperations: async (_options, additionalGames) => {
      operationsInput = additionalGames;
      return operations;
    },
    loadGameDurationEstimates: async () => durationEstimates,
  });

  assert.strictEqual(operationsInput, sdkGames);
  assert.deepEqual(data, {
    siteName: "GAME FIELDS TEST",
    gameOperations: operations,
    durationEstimates,
    additionalGames: sdkGames,
  });
  assert.deepEqual(data.additionalGames.map((game) => game.id), [
    "sdk-newer",
    "sdk-older",
  ]);
});

test("SDK catalog failure keeps built-in lobby data available", async () => {
  let operationsInput: unknown = null;
  const data = await assembleGameLobbyPageData({
    loadApprovedGameSdkCatalog: async () => {
      throw new Error("catalog unavailable");
    },
    loadSiteSettings: async () => ({ siteName: "GAME FIELDS" }),
    loadGameOperations: async (_options, additionalGames) => {
      operationsInput = additionalGames;
      return [{ gameId: "wordwolf", publication: "public" }];
    },
    loadGameDurationEstimates: async () => ({}),
  });

  assert.deepEqual(operationsInput, []);
  assert.deepEqual(data.additionalGames, []);
  assert.deepEqual(data.gameOperations, [
    { gameId: "wordwolf", publication: "public" },
  ]);
});
