import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, search, replacement) {
  const current = readFileSync(path, "utf8");
  const matches = current.split(search).length - 1;
  if (matches !== 1) throw new Error(`${path}: expected one match, found ${matches}`);
  writeFileSync(path, current.replace(search, replacement));
}

replaceOnce(
  "tests/game-sdk-shell-contract.test.ts",
  `    result: [
      [view, /moduleRequired\\("result"\\)/],
      [view, /standardResult\\.rankings\\.map/],
    ],`,
  `    result: [
      [resultPanel, /moduleRequired\\("result"\\)/],
      [resultPanel, /standardResult\\.rankings\\.map/],
      [resultPanel, /<CommonGameResultShell/],
    ],`,
);

writeFileSync("tests/wordwolf-room-actions-ui.test.ts", `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(\`../\${path}\`, import.meta.url), "utf8");

test("ワードウルフの部屋操作はロビーと結果に一組ずつ表示する", () => {
  const sidebar = read("app/wordwolf/WordWolfRoomSidebar.tsx");
  const resultPanel = read("app/wordwolf/WordWolfResultPanel.tsx");
  const permissions = read("app/wordwolf/wordwolf-view-permissions.ts");
  const lifecycleActions = read("app/components/OnlineRoomLifecycleActions.tsx");

  assert.equal((sidebar.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.ok(sidebar.includes('surface={room.phase === "lobby" ? "lobby" : "playing"}'));
  assert.doesNotMatch(sidebar, /room\.phase === "result" \? "result"/);
  assert.equal((resultPanel.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.match(resultPanel, /surface="result"/);
  assert.match(resultPanel, /<CommonGameResultShell/);
  assert.match(permissions, /canDissolve: isHost && Boolean\(isLobby \|\| isResult\)/);
  assert.match(lifecycleActions, /if \(surface === "playing"\) return null/);
  assert.match(lifecycleActions, /if \(surface === "lobby"\)/);
  assert.match(lifecycleActions, /<RoomResultActions/);
});

test("たほい屋もロビーと結果に部屋操作を一組ずつ表示する", () => {
  const roomPanel = read("app/tahoiya/TahoiyaRoomPanel.tsx");
  const resultPanel = read("app/tahoiya/TahoiyaResultPanel.tsx");

  assert.equal((roomPanel.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.ok(roomPanel.includes('surface={room.phase === "lobby" ? "lobby" : "playing"}'));
  assert.doesNotMatch(roomPanel, /room\.phase === "result" \? "result"/);
  assert.equal((resultPanel.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.match(resultPanel, /surface="result"/);
  assert.match(resultPanel, /<CommonGameResultShell/);
});
`);
