import { redisCommand } from "./redis-store.ts";

const prefix = "online-room:realtime:session-epoch:v1";

function key(actorId: string) {
  return `${prefix}:${actorId}`;
}

export async function loadOnlineRoomRealtimeSessionEpoch(actorId: string) {
  const value = await redisCommand<string | null>(["GET", key(actorId)]);
  const epoch = Number(value ?? 0);
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}

/**
 * Commits server-observable revocation before cookie or transport cleanup.
 * Delivery-time authorization reads this epoch, so stale capabilities fail
 * even when a transport has not processed the cleanup signal yet.
 */
export async function revokeOnlineRoomRealtimeActor(actorId: string) {
  return redisCommand<number>(["INCR", key(actorId)]);
}

export type OnlineRoomRealtimeRevocationSignal = {
  actorId: string;
  reason:
    | "participant-leave"
    | "participant-detach"
    | "membership-removal"
    | "kick-or-ban"
    | "active-claim-release"
    | "spectator-revoke"
    | "role-change"
    | "session-invalidation"
    | "account-disable"
    | "room-close"
    | "generation-replacement";
  roomInstanceId?: string;
};

type Listener = (signal: OnlineRoomRealtimeRevocationSignal) => void;
const listeners = new Set<Listener>();

export function onOnlineRoomRealtimeRevocation(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Common consumer boundary. T-190 owns production of detach/release signals. */
export async function consumeOnlineRoomRealtimeRevocation(
  signal: OnlineRoomRealtimeRevocationSignal,
) {
  await revokeOnlineRoomRealtimeActor(signal.actorId);
  for (const listener of listeners) listener(signal);
}
