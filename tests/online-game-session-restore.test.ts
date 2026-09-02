import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  markPlayerAuthenticated,
  readPlayerSession,
  savePlayerSession,
} from "../lib/player-session.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const validSession = {
  id: "test-player",
  name: "Test Player",
  avatarColor: "#22d3ee",
  avatarImage: null,
  locale: "ja" as const,
  updatedAt: 123,
};

async function withBrowserSession(
  fetchImpl: typeof fetch,
  run: (storage: MemoryStorage) => Promise<void>,
) {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  const browserWindow = Object.assign(new EventTarget(), { localStorage: storage });

  try {
    (globalThis as { window?: unknown }).window = browserWindow;
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    globalThis.fetch = fetchImpl;
    await run(storage);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
    if (previousStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
}

test("local認証marker欠落時もserver sessionを一度だけ確認してrehydrateする", async () => {
  let calls = 0;
  await withBrowserSession(async (input, init) => {
    calls += 1;
    assert.equal(input, "/api/player-session");
    assert.equal(init?.method, undefined);
    return Response.json({ session: validSession });
  }, async () => {
    assert.equal(isPlayerAuthenticated(), false);
    assert.deepEqual(await loadPersistentPlayerSession(), validSession);
    assert.equal(calls, 1);
    assert.equal(isPlayerAuthenticated(), true);
    assert.equal(readPlayerSession()?.id, validSession.id);
    assert.equal(readPlayerSession()?.name, validSession.name);
  });
});

test("server session無効時は未ログインを維持しread-only GETだけを行う", async () => {
  let calls = 0;
  await withBrowserSession(async (_input, init) => {
    calls += 1;
    assert.equal(init?.method, undefined);
    return Response.json({ error: "Login required." }, { status: 401 });
  }, async () => {
    assert.equal(await loadPersistentPlayerSession(), null);
    assert.equal(calls, 1);
    assert.equal(isPlayerAuthenticated(), false);
    assert.equal(readPlayerSession(), null);
  });
});

test("不正な200応答はlocal sessionへfallbackせずfail-closedにする", async () => {
  await withBrowserSession(async () => Response.json({ session: { id: "incomplete" } }), async () => {
    savePlayerSession(validSession);
    markPlayerAuthenticated();
    assert.equal(isPlayerAuthenticated(), true);
    assert.equal(await loadPersistentPlayerSession(), null);
    assert.equal(readPlayerSession()?.id, validSession.id);
  });
});

test("server session通信失敗は認証状態を作らずretryしない", async () => {
  let calls = 0;
  await withBrowserSession(async () => {
    calls += 1;
    throw new TypeError("network unavailable");
  }, async () => {
    await assert.rejects(loadPersistentPlayerSession(), /network unavailable/);
    assert.equal(calls, 1);
    assert.equal(isPlayerAuthenticated(), false);
    assert.equal(readPlayerSession(), null);
  });
});

test("共通game restoreはmarkerをserver確認のgateにせずmount内で同じ確認を再利用する", () => {
  const source = readFileSync("app/hooks/use-online-game-session-restore.ts", "utf8");
  assert.doesNotMatch(source, /if \(!isPlayerAuthenticated\(\)\)\s*\{/);
  assert.match(source, /useRef<Promise<PlayerSession \| null> \| null>\(null\)/);
  assert.match(source, /sessionLoadRef\.current \?\? loadPersistentPlayerSession\(\)/);
  assert.match(source, /sessionLoadRef\.current = sessionLoad/);
  assert.match(source, /void loadSessionOnce\(\)\.then/);
  assert.doesNotMatch(source, /setSession\(cachedSession\)/);
  assert.match(source, /\.catch\(\(\) => \{[\s\S]*setSession\(null\);[\s\S]*setRoom\(null\);/);
});

test("全online-room built-inは共通のbounded session restoreを使用する", () => {
  const directAdapters = [
    "app/wordwolf/use-wordwolf-room-session.ts",
    "app/daifugo/use-daifugo-controller.ts",
    "app/tahoiya/use-tahoiya-room-session.ts",
  ];
  for (const path of directAdapters) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /useOnlineGameSessionLoadOnce/);
    assert.doesNotMatch(source, /if \(!isPlayerAuthenticated\(\)\)\s*\{/);
  }

  const sharedConsumers = [
    "app/hodoai-talk/use-hodoai-room-session.ts",
    "app/northern-branch/use-northern-branch-controller.ts",
    "app/nigoichi/use-nigoichi-controller.ts",
    "app/code-intercept/use-code-intercept-controller.ts",
    "app/kotoba-senpuku/use-kotoba-senpuku-controller.ts",
  ];
  for (const path of sharedConsumers) {
    assert.match(readFileSync(path, "utf8"), /useOnlineGameSessionRestore/);
  }
});
