import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { redisCommand } from "./redis-store.ts";
import { normalizeGameSdkPlatformRoomCode } from "./game-sdk-platform-room-store.ts";

export type SdkPreviewRoomInviteTarget = {
  creatorSlug: string;
  gameId: string;
  revision: string;
  updatedAt: number;
};

function inviteKey(code: string) {
  return `sdk-preview-room-invite:${normalizeGameSdkPlatformRoomCode(code)}`;
}

export async function saveSdkPreviewRoomInviteTarget(
  code: string,
  target: Omit<SdkPreviewRoomInviteTarget, "updatedAt">,
) {
  const value: SdkPreviewRoomInviteTarget = {
    ...target,
    updatedAt: Date.now(),
  };
  await redisCommand<"OK">([
    "SET",
    inviteKey(code),
    JSON.stringify(value),
    "EX",
    String(multiplayerRoomTtlSeconds),
  ]);
}

export async function loadSdkPreviewRoomInviteTarget(code: string) {
  const raw = await redisCommand<string | null>(["GET", inviteKey(code)]);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SdkPreviewRoomInviteTarget>;
    if (
      typeof value.creatorSlug !== "string"
      || !value.creatorSlug.trim()
      || typeof value.gameId !== "string"
      || !value.gameId.trim()
      || typeof value.revision !== "string"
      || !/^[a-f0-9]{40}$/.test(value.revision)
    ) return null;
    return value as SdkPreviewRoomInviteTarget;
  } catch {
    return null;
  }
}

export async function deleteSdkPreviewRoomInviteTarget(code: string) {
  await redisCommand<number>(["DEL", inviteKey(code)]);
}
