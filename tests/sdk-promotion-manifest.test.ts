import assert from "node:assert/strict";
import test from "node:test";
import { jsonValuesEqual } from "../apps/sdk-portal/lib/canonical-json.ts";

test("SDK promotion manifest comparison ignores object key order", () => {
  const storedManifest = {
    capabilities: {
      timers: true,
      room: { maxPlayers: 8, minPlayers: 1 },
    },
    gameId: "ai-word-guess",
  };
  const runtimeManifest = {
    gameId: "ai-word-guess",
    capabilities: {
      room: { minPlayers: 1, maxPlayers: 8 },
      timers: true,
    },
  };

  assert.equal(jsonValuesEqual(storedManifest, runtimeManifest), true);
});

test("SDK promotion manifest comparison keeps array order significant", () => {
  assert.equal(
    jsonValuesEqual(
      { phases: ["lobby", "playing", "result"] },
      { phases: ["playing", "lobby", "result"] },
    ),
    false,
  );
});

test("SDK promotion manifest comparison rejects changed values", () => {
  assert.equal(
    jsonValuesEqual(
      { room: { minimumPlayers: 1 } },
      { room: { minimumPlayers: 2 } },
    ),
    false,
  );
});
