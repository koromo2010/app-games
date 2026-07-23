import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const games = ["wordwolf", "tahoiya", "hodoai", "kotoba-senpuku", "nigoichi", "northern-branch", "code-intercept", "daifugo"];

test("全オンラインRoom APIはCookie認証とGET参加者照合を持つ", async () => {
  const factory = await readFile(new URL("../lib/online-room-route-factory.ts", import.meta.url), "utf8");
  for (const game of games) {
    const route = await readFile(new URL(`../app/api/${game}/rooms/route.ts`, import.meta.url), "utf8");
    assert.match(route, /createOnlineRoomRouteHandlers/, `${game}: shared route factory`);
    assert.match(factory, /requireAuthenticatedPlayer(?:Id)?\(/, `${game}: signed-cookie auth`);
    assert.match(factory, /players\.some\([^\n]+authenticatedPlayerId/, `${game}: GET membership check`);
    assert.match(factory, /body\.action/, `${game}: typed command input`);
    assert.match(factory, /actorId: session\.id/, `${game}: server-derived actor`);
  }
});

test("ワードウルフのデバッグ代理操作も保存済み参加者だけを対象にする", async () => {
  const source = await readFile(new URL("../app/api/wordwolf/commands/route.ts", import.meta.url), "utf8");
  assert.match(source, /requestedActorIsRoomPlayer/);
  assert.match(source, /room\.players\.some\(\(item\) => item\.id === requestedActorId\)/);
});
