import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ワードウルフの部屋操作はロビーと結果だけに表示する", () => {
  const sidebar = read("app/wordwolf/WordWolfRoomSidebar.tsx");
  const resultPanel = read("app/wordwolf/WordWolfResultPanel.tsx");
  const permissions = read("app/wordwolf/wordwolf-view-permissions.ts");
  const lifecycleActions = read("app/components/OnlineRoomLifecycleActions.tsx");

  assert.match(sidebar, /<OnlineRoomLifecycleActions/);
  assert.match(sidebar, /room\.phase === "lobby" \? "lobby" : room\.phase === "result" \? "result" : "playing"/);
  assert.match(resultPanel, /<OnlineRoomLifecycleActions/);
  assert.match(permissions, /canDissolve: isHost && Boolean\(isLobby \|\| isResult\)/);
  assert.match(lifecycleActions, /if \(surface === "playing"\) return null/);
  assert.match(lifecycleActions, /if \(surface === "lobby"\)/);
  assert.match(lifecycleActions, /<RoomResultActions/);
});

test("たほい屋の左パネルも共通の部屋操作ポリシーを使う", () => {
  const roomPanel = read("app/tahoiya/TahoiyaRoomPanel.tsx");
  assert.match(roomPanel, /<OnlineRoomLifecycleActions/);
  assert.match(roomPanel, /room\.phase === "lobby" \? "lobby" : room\.phase === "result" \? "result" : "playing"/);
});
