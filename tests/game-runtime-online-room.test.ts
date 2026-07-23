import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameFieldsOnlineRoomMutationRuntime,
  type GameFieldsOnlineRoomCompareAndSetResult,
} from "@game-fields/game-runtime";

type TestRoom = {
  code: string;
  revision: number;
  updatedAt: number;
  value: number;
};

test("game-runtimeは競合後に最新Roomへ論理Commandを再適用する", async () => {
  let stored: TestRoom | null = {
    code: "ROOM",
    revision: 2,
    updatedAt: 100,
    value: 1,
  };
  let timestamp = 200;
  let saveAttempts = 0;
  const runtime = createGameFieldsOnlineRoomMutationRuntime<TestRoom>({
    loadRoom: async () => stored && { ...stored },
    normalizeRoom: (value) => {
      const room = value as Partial<TestRoom>;
      return typeof room.code === "string"
        && typeof room.revision === "number"
        && typeof room.updatedAt === "number"
        && typeof room.value === "number"
        ? room as TestRoom
        : null;
    },
    compareAndSet: async (expectedRevision, room) => {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        stored = {
          code: "ROOM",
          revision: 3,
          updatedAt: 150,
          value: 6,
        };
        return "conflict";
      }
      if (!stored || stored.revision !== expectedRevision) return "conflict";
      stored = room;
      return "saved";
    },
    now: () => ++timestamp,
    errors: {
      notFound: "ROOM_NOT_FOUND",
      invalid: "INVALID_ROOM",
      conflict: "ROOM_CONFLICT",
    },
  });

  const room = await runtime.mutate("ROOM", (current) => ({
    ...current,
    value: current.value + 2,
  }));

  assert.equal(saveAttempts, 2);
  assert.equal(room.revision, 4);
  assert.equal(room.value, 8);
  assert.equal(room.updatedAt, 202);
});

test("game-runtimeはmissing・不正Room・競合上限を区別する", async () => {
  const createRuntime = (
    loadRoom: () => Promise<TestRoom | null>,
    normalizeRoom: (value: unknown) => TestRoom | null,
    compareAndSet: () => Promise<GameFieldsOnlineRoomCompareAndSetResult>,
  ) => createGameFieldsOnlineRoomMutationRuntime<TestRoom>({
    loadRoom,
    normalizeRoom,
    compareAndSet,
    maximumAttempts: 2,
    errors: {
      notFound: "ROOM_NOT_FOUND",
      invalid: "INVALID_ROOM",
      conflict: "ROOM_CONFLICT",
    },
  });
  const room: TestRoom = {
    code: "ROOM",
    revision: 1,
    updatedAt: 1,
    value: 0,
  };

  await assert.rejects(
    () => createRuntime(
      async () => null,
      () => room,
      async () => "saved",
    ).mutate("ROOM", (current) => current),
    /ROOM_NOT_FOUND/,
  );
  await assert.rejects(
    () => createRuntime(
      async () => room,
      () => null,
      async () => "saved",
    ).mutate("ROOM", (current) => ({ ...current, value: 1 })),
    /INVALID_ROOM/,
  );
  await assert.rejects(
    () => createRuntime(
      async () => room,
      (value) => value as TestRoom,
      async () => "conflict",
    ).mutate("ROOM", (current) => ({ ...current, value: 1 })),
    /ROOM_CONFLICT/,
  );
});
