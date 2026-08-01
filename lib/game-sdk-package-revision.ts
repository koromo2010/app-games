import type { GameSdkRoomSnapshot } from "@game-fields/game-sdk";

export const gameSdkPackageRevisionPattern = /^[a-f0-9]{40}$/;

export type GameSdkPackageRevisionIssue =
  | {
      kind: "mismatch";
      requestedRevision: string;
      roomCode: string;
      roomRevision: string;
    }
  | {
      kind: "unknown";
      requestedRevision: string;
      roomCode: string;
      roomRevision: null;
    };

export function gameSdkPackageRevisionIssue(
  requestedRevision: string,
  room: Pick<GameSdkRoomSnapshot<unknown>, "code" | "packageRevision">,
): GameSdkPackageRevisionIssue | null {
  const requested = requestedRevision.trim();
  const pinned = room.packageRevision?.trim() ?? "";
  if (!gameSdkPackageRevisionPattern.test(requested)) {
    return {
      kind: "unknown",
      requestedRevision: requested,
      roomCode: room.code,
      roomRevision: null,
    };
  }
  if (!gameSdkPackageRevisionPattern.test(pinned)) {
    return {
      kind: "unknown",
      requestedRevision: requested,
      roomCode: room.code,
      roomRevision: null,
    };
  }
  if (requested === pinned) return null;
  return {
    kind: "mismatch",
    requestedRevision: requested,
    roomCode: room.code,
    roomRevision: pinned,
  };
}

export function gameSdkPackageRevisionHref(
  currentHref: string,
  revision: string,
) {
  if (!gameSdkPackageRevisionPattern.test(revision)) {
    throw new Error("GAME_SDK_PACKAGE_REVISION_INVALID");
  }
  const url = new URL(currentHref);
  url.searchParams.set("revision", revision);
  return url.toString();
}
