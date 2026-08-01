import type { GameSdkOnlineRoomHttpOperation } from "./game-sdk-online-room-http.ts";
import { multiplayerRoomExpiryArgs } from "./multiplayer-room-lifecycle.ts";
import type { ObservabilityFields } from "./observability/types.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
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
    ...multiplayerRoomExpiryArgs(),
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

type SdkPreviewRoomInviteIndexSuccess = {
  operation: GameSdkOnlineRoomHttpOperation;
  room?: {
    code: string;
    packageRevision?: string;
  };
  affected?: number;
  commandApplied?: boolean;
  requestedRoomCode: string;
  creatorSlug: string;
  gameId: string;
  fallbackRevision: string;
  onFailure?: (
    error: unknown,
    fields: ObservabilityFields,
  ) => void;
};

/**
 * Keeps the secondary invite lookup aligned with successful Room mutations.
 * Reads and idempotent no-op Commands never refresh this index.
 */
export async function scheduleSdkPreviewRoomInviteIndexSuccess({
  operation,
  room,
  affected,
  commandApplied,
  requestedRoomCode,
  creatorSlug,
  gameId,
  fallbackRevision,
  onFailure,
}: SdkPreviewRoomInviteIndexSuccess) {
  const shouldSave = operation === "create"
    || (operation === "command" && commandApplied === true);
  if (shouldSave && room?.code) {
    await schedulePostResponseWork(
      "sdk-preview-room-invite-index-save",
      () => saveSdkPreviewRoomInviteTarget(room.code, {
        creatorSlug,
        gameId,
        revision: room.packageRevision ?? fallbackRevision,
      }),
      {
        mode: "best-effort",
        telemetryEvent: "game-sdk.preview-room-invite-index",
        telemetryFields: {
          action: "save",
          channel: "candidate-preview",
        },
        onFailure,
      },
    );
    return;
  }

  if (
    operation === "dissolve"
    && affected === 1
    && requestedRoomCode
  ) {
    await schedulePostResponseWork(
      "sdk-preview-room-invite-index-delete",
      () => deleteSdkPreviewRoomInviteTarget(requestedRoomCode),
      {
        mode: "best-effort",
        telemetryEvent: "game-sdk.preview-room-invite-index",
        telemetryFields: {
          action: "delete",
          channel: "candidate-preview",
        },
        onFailure,
      },
    );
  }
}
