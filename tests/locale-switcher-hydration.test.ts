import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPlayerSession,
  getPlayerAuthenticatedSnapshot,
  getServerPlayerAuthenticatedSnapshot,
  markPlayerAuthenticated,
  savePlayerSession,
  subscribePlayerSession,
} from "../lib/player-session.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("認証snapshotはSSRで固定され、session変更通知後だけclient値を更新する", () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const storage = new MemoryStorage();
  const eventTarget = new EventTarget();
  const browserWindow = Object.assign(eventTarget, { localStorage: storage });
  let notifications = 0;

  try {
    delete (globalThis as { window?: unknown }).window;
    assert.equal(getServerPlayerAuthenticatedSnapshot(), false);

    (globalThis as { window?: unknown }).window = browserWindow;
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    assert.equal(getPlayerAuthenticatedSnapshot(), false);

    const unsubscribe = subscribePlayerSession(() => {
      notifications += 1;
    });
    savePlayerSession({
      name: "Test Player",
      avatarColor: "#22d3ee",
      avatarImage: null,
    });
    markPlayerAuthenticated();

    assert.equal(getPlayerAuthenticatedSnapshot(), true);
    assert.ok(notifications >= 2);
    assert.equal(getServerPlayerAuthenticatedSnapshot(), false);

    clearPlayerSession();
    assert.equal(getPlayerAuthenticatedSnapshot(), false);
    assert.ok(notifications >= 3);
    unsubscribe();
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
    if (previousStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
  }
});
