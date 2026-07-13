import assert from "node:assert/strict";
import test from "node:test";
import { actionRequiresDebugAccess, roomRequestsDebugMode } from "../lib/debug-access-policy.ts";

test("デバッグ専用操作だけをアカウント認証対象にする", () => {
  assert.equal(actionRequiresDebugAccess({ type: "set-debug", enabled: true }), true);
  assert.equal(actionRequiresDebugAccess({ type: "set-debug", enabled: false }), false);
  assert.equal(actionRequiresDebugAccess({ type: "abort-game" }), true);
  assert.equal(actionRequiresDebugAccess({ type: "debug-fill-secrets" }), true);
  assert.equal(actionRequiresDebugAccess({ type: "start-game" }), false);
});

test("デバッグ状態の部屋保存だけをアカウント認証対象にする", () => {
  assert.equal(roomRequestsDebugMode({ debugMode: true }), true);
  assert.equal(roomRequestsDebugMode({ debugMode: false }), false);
  assert.equal(roomRequestsDebugMode(null), false);
});
