export type GameFieldsRevisionedOnlineRoom = {
  code: string;
  revision: number;
  updatedAt: number;
};

export type GameFieldsOnlineRoomCompareAndSetResult =
  | "saved"
  | "conflict"
  | "missing";

export type GameFieldsOnlineRoomMutationContext = {
  revision: number;
  timestamp: number;
};

export type GameFieldsOnlineRoomMutationOptions<
  TRoom extends GameFieldsRevisionedOnlineRoom,
> = {
  prepare?: (
    current: TRoom,
    changed: TRoom,
    context: GameFieldsOnlineRoomMutationContext,
  ) => TRoom;
};

type OnlineRoomMutationRuntimeOptions<
  TRoom extends GameFieldsRevisionedOnlineRoom,
> = {
  loadRoom: (code: string) => Promise<TRoom | null>;
  normalizeRoom: (room: unknown) => TRoom | null;
  compareAndSet: (
    expectedRevision: number,
    room: TRoom,
  ) => Promise<GameFieldsOnlineRoomCompareAndSetResult>;
  onSaved?: (room: TRoom) => Promise<unknown>;
  now?: () => number;
  maximumAttempts?: number;
  errors: {
    notFound: string;
    invalid: string;
    conflict: string;
  };
};

export type GameFieldsOnlineRoomMutationRuntime<
  TRoom extends GameFieldsRevisionedOnlineRoom,
> = {
  mutate(
    code: string,
    mutation: (room: TRoom) => TRoom | Promise<TRoom>,
    options?: GameFieldsOnlineRoomMutationOptions<TRoom>,
  ): Promise<TRoom>;
};

/**
 * Storage-neutral online-room mutation lifecycle shared by the built-in app
 * and SDK-backed games. Redis keys, HTTP sessions, realtime notifications,
 * stats and replay persistence are injected by the platform adapter.
 */
export function createGameFieldsOnlineRoomMutationRuntime<
  TRoom extends GameFieldsRevisionedOnlineRoom,
>({
  loadRoom,
  normalizeRoom,
  compareAndSet,
  onSaved,
  now = Date.now,
  maximumAttempts = 6,
  errors,
}: OnlineRoomMutationRuntimeOptions<TRoom>): GameFieldsOnlineRoomMutationRuntime<TRoom> {
  const attempts = Math.max(1, Math.trunc(maximumAttempts));

  return {
    async mutate(code, mutation, options = {}) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const current = await loadRoom(code);
        if (!current) throw new Error(errors.notFound);
        const changed = await mutation(current);
        if (changed === current) return current;

        const revision = current.revision + 1;
        const timestamp = now();
        const prepared = options.prepare?.(
          current,
          changed,
          { revision, timestamp },
        ) ?? changed;
        const next = normalizeRoom({
          ...prepared,
          code: current.code,
          revision,
          updatedAt: timestamp,
        });
        if (!next) throw new Error(errors.invalid);

        const result = await compareAndSet(current.revision, next);
        if (result === "missing") throw new Error(errors.notFound);
        if (result === "conflict") continue;
        await onSaved?.(next);
        return next;
      }
      throw new Error(errors.conflict);
    },
  };
}
