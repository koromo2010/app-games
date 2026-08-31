import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleDeferredGameLobbyCatalog,
  assembleGameLobbyCriticalPageData,
} from "../app/games/game-lobby-page-data.ts";

test("critical lobby data does not wait for the approved SDK catalog", async () => {
  const operations = [
    { gameId: "wordwolf", publication: "public" },
  ];
  const durationEstimates = { wordwolf: { label: "8–12 min", sampleCount: 12 } };
  let operationsInput: unknown;

  const data = await assembleGameLobbyCriticalPageData({
    loadSiteSettings: async () => ({ siteName: "GAME FIELDS TEST" }),
    loadGameOperations: async (_options, additionalGames) => {
      operationsInput = additionalGames;
      return operations;
    },
    loadGameDurationEstimates: async () => durationEstimates,
  });

  assert.deepEqual(operationsInput, []);
  assert.deepEqual(data, {
    siteName: "GAME FIELDS TEST",
    gameOperations: operations,
    durationEstimates,
    deferredCatalogEndpoint: "/api/public/game-catalog",
  });
});

test("deferred catalog preserves source order and reads operations fresh", async () => {
  const sdkGames = [
    { id: "sdk-newer", title: "Newer SDK game" },
    { id: "sdk-older", title: "Older SDK game" },
  ];
  let operationsOptions: unknown;
  let operationsInput: unknown;
  const data = await assembleDeferredGameLobbyCatalog({
    loadApprovedGameSdkCatalogSnapshot: async () => ({
      games: sdkGames,
      sourceVersion: "a".repeat(64),
    }),
    loadGameOperations: async (options, additionalGames) => {
      operationsOptions = options;
      operationsInput = additionalGames;
      return [{ gameId: "sdk-newer", publication: "public" }];
    },
  });

  assert.deepEqual(operationsOptions, { fresh: true });
  assert.strictEqual(operationsInput, sdkGames);
  assert.deepEqual(data.additionalGames, sdkGames);
  assert.deepEqual(data.gameOperations, [
    { gameId: "sdk-newer", publication: "public" },
  ]);
  assert.equal(data.sourceVersion, "a".repeat(64));
});
