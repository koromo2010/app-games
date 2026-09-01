import assert from "node:assert/strict";
import test from "node:test";
import {
  abortAllOnlineRoomDiscoveries,
  consumeOnlineRoomDiscovery,
  currentOnlineRoomDiscoveryEpoch,
  OnlineRoomDiscoveryError,
  trackOnlineRoomDiscovery,
} from "../lib/online-room-discovery.ts";

type Choice = {
  code: string;
  roomGenerationId: string;
  updatedAt: number;
};

test("継続取得は空の中間ページを越えてterminalまで蓄積する", async () => {
  const cursors: Array<string | null> = [];
  const rooms = await consumeOnlineRoomDiscovery<Choice>("wordwolf", async (cursor) => {
    cursors.push(cursor);
    if (cursor === null) return { rooms: [], nextCursor: "opaque-a" };
    if (cursor === "opaque-a") return {
      rooms: [{ code: "LATER", roomGenerationId: "generation-later", updatedAt: 2 }],
      nextCursor: "opaque-b",
    };
    return { rooms: [], nextCursor: null };
  });
  assert.deepEqual(cursors, [null, "opaque-a", "opaque-b"]);
  assert.deepEqual(rooms.map((room) => room.code), ["LATER"]);
});

test("継続取得はnamespace＋immutable generationでdedupeし最新観測を保持する", async () => {
  const rooms = await consumeOnlineRoomDiscovery<Choice>("sdk:game-a", async (cursor) => (
    cursor === null
      ? {
          rooms: [
            { code: "OLD", roomGenerationId: "generation-a", updatedAt: 1 },
            { code: "REUSED", roomGenerationId: "generation-b", updatedAt: 2 },
          ],
          nextCursor: "next",
        }
      : {
          rooms: [
            { code: "NEW", roomGenerationId: "generation-a", updatedAt: 3 },
            { code: "REUSED", roomGenerationId: "generation-c", updatedAt: 4 },
          ],
          nextCursor: null,
        }
  ));
  assert.deepEqual(rooms.map((room) => [room.code, room.roomGenerationId]), [
    ["REUSED", "generation-c"],
    ["NEW", "generation-a"],
    ["REUSED", "generation-b"],
  ]);
});

test("継続取得はmalformed・stalled・repeated・cyclic cursorをbounded fail-closedする", async () => {
  await assert.rejects(
    () => consumeOnlineRoomDiscovery("game", async () => ({ rooms: [], nextCursor: "bad cursor" })),
    (error: unknown) => error instanceof OnlineRoomDiscoveryError
      && error.code === "ROOM_LIST_CURSOR_MALFORMED",
  );
  await assert.rejects(
    () => consumeOnlineRoomDiscovery("game", async (cursor) => ({
      rooms: [],
      nextCursor: cursor ?? "same",
    }), { cursor: "same" }),
    (error: unknown) => error instanceof OnlineRoomDiscoveryError
      && error.code === "ROOM_LIST_CURSOR_STALLED",
  );

  const repeated = ["a", "b", "a"];
  await assert.rejects(
    () => consumeOnlineRoomDiscovery("game", async () => ({
      rooms: [],
      nextCursor: repeated.shift() ?? null,
    })),
    (error: unknown) => error instanceof OnlineRoomDiscoveryError
      && error.code === "ROOM_LIST_CURSOR_CYCLIC_OR_REPEATED",
  );
});

test("継続取得はrequest上限とAbortSignalで必ず停止する", async () => {
  let requests = 0;
  await assert.rejects(
    () => consumeOnlineRoomDiscovery("game", async () => ({
      rooms: [],
      nextCursor: `cursor-${++requests}`,
    }), { maximumRequests: 3 }),
    (error: unknown) => error instanceof OnlineRoomDiscoveryError
      && error.code === "ROOM_LIST_REQUEST_LIMIT_REACHED",
  );
  assert.equal(requests, 3);

  const controller = new AbortController();
  controller.abort(new DOMException("Navigation", "AbortError"));
  await assert.rejects(
    () => consumeOnlineRoomDiscovery("game", async () => ({ rooms: [], nextCursor: null }), {
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});

test("navigation・locale変更・unmountの共通失効は進行中取得を中止する", () => {
  const controller = new AbortController();
  const stopTracking = trackOnlineRoomDiscovery(controller);
  const previousEpoch = currentOnlineRoomDiscoveryEpoch();
  abortAllOnlineRoomDiscoveries("Navigation");
  assert.equal(controller.signal.aborted, true);
  assert.equal((controller.signal.reason as DOMException).name, "AbortError");
  assert.equal(currentOnlineRoomDiscoveryEpoch(), previousEpoch + 1);
  stopTracking();
});

test("同時追加・削除・期限切れ相当の変動ページでもbounded terminationする", async () => {
  let requests = 0;
  const rooms = await consumeOnlineRoomDiscovery<Choice>("changing-game", async (cursor) => {
    requests += 1;
    if (cursor === null) return {
      rooms: [{ code: "REMOVED-LATER", roomGenerationId: "removed", updatedAt: 1 }],
      nextCursor: "after-delete",
    };
    if (cursor === "after-delete") return { rooms: [], nextCursor: "after-expiry" };
    return {
      rooms: [{ code: "ADDED", roomGenerationId: "added", updatedAt: 2 }],
      nextCursor: null,
    };
  }, { maximumRequests: 4 });
  assert.equal(requests, 3);
  assert.deepEqual(rooms.map((room) => room.code), ["ADDED", "REMOVED-LATER"]);
});
