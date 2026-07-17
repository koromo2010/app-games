import assert from "node:assert/strict";
import test from "node:test";
import { actionRequiresDebugAccess, playerEmailHasAdminDebugAccess, playerHasResolvedDebugAccess, roomRequestsDebugMode } from "../lib/debug-access-policy.ts";

test("デバッグ専用操作だけをアカウント認証対象にする", () => {
  assert.equal(actionRequiresDebugAccess({ type: "set-debug", enabled: true }), true);
  assert.equal(actionRequiresDebugAccess({ type: "set-debug", enabled: false }), false);
  assert.equal(actionRequiresDebugAccess({ type: "abort-game" }), true);
  assert.equal(actionRequiresDebugAccess({ type: "debug-fill-secrets" }), true);
  assert.equal(actionRequiresDebugAccess({ type: "set-debug-replay", enabled: true }), true);
  assert.equal(actionRequiresDebugAccess({ type: "submit-clue", actorId: "host", playerId: "dummy" }), true);
  assert.equal(actionRequiresDebugAccess({ type: "submit-clue", actorId: "self", playerId: "self" }), false);
  assert.equal(actionRequiresDebugAccess({ type: "start-game" }), false);
});

test("デバッグ状態の部屋保存だけをアカウント認証対象にする", () => {
  assert.equal(roomRequestsDebugMode({ debugMode: true }), true);
  assert.equal(roomRequestsDebugMode({ debugMode: false }), false);
  assert.equal(roomRequestsDebugMode(null), false);
});

test("プレイヤーと管理者の正規化済みメールが一致するときだけデバッグ利用を許可する", () => {
  assert.equal(playerEmailHasAdminDebugAccess(" Admin@example.com ", ["admin@example.com"]), true);
  assert.equal(playerEmailHasAdminDebugAccess("Ａ@example.com", ["a@example.com"]), true);
  assert.equal(playerEmailHasAdminDebugAccess("player@example.com", ["admin@example.com"]), false);
  assert.equal(playerEmailHasAdminDebugAccess(null, ["admin@example.com"]), false);
});

test("管理画面からの個別付与はメール未登録でもデバッグ利用を許可する", () => {
  assert.equal(playerHasResolvedDebugAccess(null, [], true), true);
  assert.equal(playerHasResolvedDebugAccess("player@example.com", ["admin@example.com"], false), false);
  assert.equal(playerHasResolvedDebugAccess("player@example.com", ["PLAYER@example.com"], false), true);
});
