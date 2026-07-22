import assert from "node:assert/strict";
import test from "node:test";
import registry from "../config/game-registry.json" with { type: "json" };
import { builtInGameCapabilityPolicies } from "../app/games/built-in-game-module-policies.ts";

test("every built-in game has one explicit module policy", () => {
  assert.deepEqual(
    Object.keys(builtInGameCapabilityPolicies).sort(),
    registry.map((game) => game.id).sort(),
  );
});

test("disabled modules always explain the intentional omission", () => {
  for (const [gameId, policy] of Object.entries(builtInGameCapabilityPolicies)) {
    for (const [name, decision] of Object.entries(policy)) {
      if (decision.mode === "disabled") {
        assert.ok(decision.reason.trim().length >= 8, `${gameId}.${name} needs a reason`);
      }
    }
  }
});
