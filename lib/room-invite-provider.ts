import type { GameSdkStoredRoom } from "@game-fields/game-sdk";
import { loadCanvasRoom } from "./canvas-room-store.ts";
import { loadStoredCodeInterceptRoom } from "./code-intercept-room-store.ts";
import { loadStoredDaifugoRoom } from "./daifugo-room-store.ts";
import { resolveGameFieldsEnvironment } from "./game-fields-environment.ts";
import { gamePlayHref } from "./game-routes.ts";
import { loadApprovedGameSdkRuntimeRegistration } from "./game-sdk-runtime-catalog.ts";
import { createRedisGameSdkPlatformRoomStore } from "./game-sdk-platform-room-store.ts";
import { loadStoredHodoaiRoom } from "./hodoai-room-store.ts";
import { loadStoredKotobaSenpukuRoom } from "./kotoba-senpuku-room-store.ts";
import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { loadStoredNigoichiRoom } from "./nigoichi-room-store.ts";
import { loadStoredNorthernRoom } from "./northern-branch-room-store.ts";
import { sdkPreviewPackageRuntimeId } from "./sdk-preview-package-runtime.ts";
import { loadSdkPreviewRuntimeDefinition } from "./sdk-preview-runtime-source.ts";
import { loadStoredTahoiyaRoom } from "./tahoiya-room-store.ts";
import { loadStoredWordWolfRoom } from "./wordwolf-room-store.ts";
import {
  canonicalRoomInviteTargetsEqual,
  normalizeRoomInstanceId,
  type CanonicalRoomInviteProviderKind,
  type CanonicalRoomInviteTarget,
} from "./room-invite-target.ts";

type CommonRoom = {
  code: string;
  hostId?: string;
  ownerId?: string;
  players?: Array<{ id?: string }>;
  roomInstanceId?: string;
  updatedAt: number;
  contentLocale?: unknown;
};

const builtInLoaders: Record<string, (code: string) => Promise<CommonRoom | null>> = {
  wordwolf: loadStoredWordWolfRoom,
  tahoiya: loadStoredTahoiyaRoom,
  hodoai: loadStoredHodoaiRoom,
  "kotoba-senpuku": loadStoredKotobaSenpukuRoom,
  "northern-branch": loadStoredNorthernRoom,
  nigoichi: loadStoredNigoichiRoom,
  "code-intercept": loadStoredCodeInterceptRoom,
  daifugo: loadStoredDaifugoRoom,
};

export type RoomInviteTargetHint = {
  providerKind: CanonicalRoomInviteProviderKind;
  gameNamespace: string;
  displayCode: string;
  sourceCreatorSlug?: string;
  sourceGameId?: string;
  packageRevision?: string;
};

function roomExpiry(updatedAt: number) {
  return updatedAt + multiplayerRoomTtlSeconds * 1_000;
}

function actorCanInvite(room: CommonRoom, actorId: string) {
  return room.hostId === actorId
    || room.ownerId === actorId
    || room.players?.some((player) => player.id === actorId) === true;
}

function contentLanguage(value: unknown) {
  return value === "ja" || value === "en" ? value : undefined;
}

async function resolveBuiltInOrCanvas(
  hint: RoomInviteTargetHint,
  actorId?: string,
) {
  const loader = hint.providerKind === "canvas"
    ? loadCanvasRoom
    : builtInLoaders[hint.gameNamespace];
  if (!loader) return null;
  const room = await loader(hint.displayCode);
  const roomInstanceId = normalizeRoomInstanceId(room?.roomInstanceId);
  if (!room || !roomInstanceId || (actorId && !actorCanInvite(room, actorId))) {
    return null;
  }
  return {
    environment: resolveGameFieldsEnvironment(),
    providerKind: hint.providerKind,
    gameNamespace: hint.gameNamespace,
    displayCode: room.code,
    roomInstanceId,
    expiresAt: roomExpiry(room.updatedAt),
    contentLanguage: contentLanguage((room as CommonRoom).contentLocale),
  } as const;
}

async function resolveApprovedSdk(
  hint: RoomInviteTargetHint,
  actorId?: string,
) {
  const registration = await loadApprovedGameSdkRuntimeRegistration(
    hint.gameNamespace,
    process.env,
    hint.packageRevision,
  );
  if (
    !registration?.revision
    || !registration.sourceCreatorSlug
    || !registration.sourceGameId
    || !registration.packageRootSha256
    || !registration.serverBundleSha256
    || !registration.appSetSourceSha256
  ) return null;
  const environment = resolveGameFieldsEnvironment();
  const room = await createRedisGameSdkPlatformRoomStore<GameSdkStoredRoom>(
    registration.id,
    environment,
  ).load(hint.displayCode);
  if (
    !room
    || (actorId && !actorCanInvite({
      ...room,
      hostId: room.hostPlayerId,
      players: (room.room as { players?: Array<{ id?: string }> }).players,
    }, actorId))
    || room.runtimeContract.packageRevision !== registration.revision
    || room.runtimeContract.packageRootSha256 !== registration.packageRootSha256
  ) return null;
  return {
    environment,
    providerKind: "sdk-approved" as const,
    gameNamespace: registration.id,
    displayCode: room.code,
    roomInstanceId: room.creationRequestId,
    expiresAt: roomExpiry(room.updatedAt),
    sdk: {
      publicGameId: registration.id,
      sourceCreatorSlug: registration.sourceCreatorSlug,
      sourceGameId: registration.sourceGameId,
      packageRevision: registration.revision,
      packageRootSha256: registration.packageRootSha256,
      serverBundleSha256: registration.serverBundleSha256,
      appSetSourceSha256: registration.appSetSourceSha256,
    },
  };
}

async function resolvePreviewSdk(
  hint: RoomInviteTargetHint,
  actorId?: string,
) {
  if (!hint.sourceCreatorSlug || !hint.sourceGameId || !hint.packageRevision) {
    return null;
  }
  const definition = await loadSdkPreviewRuntimeDefinition(
    hint.sourceCreatorSlug,
    hint.sourceGameId,
    fetch,
    process.env,
    hint.packageRevision,
  );
  if (
    !definition?.revision
    || !definition.packageRootSha256
    || !definition.serverBundleSha256
    || !definition.appSetSourceSha256
  ) return null;
  const environment = "candidate-preview" as const;
  const scope = sdkPreviewPackageRuntimeId(
    hint.sourceCreatorSlug,
    hint.sourceGameId,
  );
  const room = await createRedisGameSdkPlatformRoomStore<GameSdkStoredRoom>(
    scope,
    environment,
  ).load(hint.displayCode);
  if (
    !room
    || (actorId && !actorCanInvite({
      ...room,
      hostId: room.hostPlayerId,
      players: (room.room as { players?: Array<{ id?: string }> }).players,
    }, actorId))
    || room.runtimeContract.packageRevision !== definition.revision
    || room.runtimeContract.packageRootSha256 !== definition.packageRootSha256
  ) return null;
  return {
    environment,
    providerKind: "sdk-preview" as const,
    gameNamespace: scope,
    displayCode: room.code,
    roomInstanceId: room.creationRequestId,
    expiresAt: Math.min(
      roomExpiry(room.updatedAt),
      definition.serverRuntimeExpiresAt ?? Number.MAX_SAFE_INTEGER,
    ),
    sdk: {
      publicGameId: hint.sourceGameId,
      sourceCreatorSlug: hint.sourceCreatorSlug,
      sourceGameId: hint.sourceGameId,
      packageRevision: definition.revision,
      packageRootSha256: definition.packageRootSha256,
      serverBundleSha256: definition.serverBundleSha256,
      appSetSourceSha256: definition.appSetSourceSha256,
    },
  };
}

export async function resolveCanonicalRoomInviteTarget(
  hint: RoomInviteTargetHint,
  actorId?: string,
) {
  if (hint.providerKind === "built-in" || hint.providerKind === "canvas") {
    return resolveBuiltInOrCanvas(hint, actorId);
  }
  if (hint.providerKind === "sdk-approved") {
    return resolveApprovedSdk(hint, actorId);
  }
  return resolvePreviewSdk(hint, actorId);
}

export async function revalidateCanonicalRoomInviteTarget(
  expected: CanonicalRoomInviteTarget,
) {
  const resolved = await resolveCanonicalRoomInviteTarget({
    providerKind: expected.providerKind,
    gameNamespace: expected.providerKind === "sdk-preview"
      ? expected.sdk?.sourceGameId ?? ""
      : expected.gameNamespace,
    displayCode: expected.displayCode,
    sourceCreatorSlug: expected.sdk?.sourceCreatorSlug,
    sourceGameId: expected.sdk?.sourceGameId,
    packageRevision: expected.sdk?.packageRevision,
  });
  if (!resolved) return false;
  return canonicalRoomInviteTargetsEqual(
    expected,
    { ...expected, ...resolved },
  );
}

export function canonicalRoomInviteEndpoint(target: CanonicalRoomInviteTarget) {
  if (target.providerKind === "built-in") {
    return `/api/${target.gameNamespace}/rooms`;
  }
  if (target.providerKind === "canvas") return "/api/canvas/rooms";
  if (target.providerKind === "sdk-approved") {
    return `/api/game-sdk/${encodeURIComponent(target.sdk!.publicGameId)}/rooms?revision=${encodeURIComponent(target.sdk!.packageRevision)}`;
  }
  return `/api/sdk-preview/${encodeURIComponent(target.sdk!.sourceCreatorSlug)}/games/${encodeURIComponent(target.sdk!.sourceGameId)}/rooms?revision=${encodeURIComponent(target.sdk!.packageRevision)}`;
}

export function canonicalRoomInviteHref(target: CanonicalRoomInviteTarget) {
  if (target.providerKind === "built-in") {
    return gamePlayHref(target.gameNamespace, target.displayCode);
  }
  if (target.providerKind === "canvas") {
    return gamePlayHref("canvas", target.displayCode);
  }
  if (target.providerKind === "sdk-approved") {
    return `/sdk-games/${encodeURIComponent(target.sdk!.publicGameId)}?revision=${encodeURIComponent(target.sdk!.packageRevision)}&room=${encodeURIComponent(target.displayCode)}`;
  }
  return `/sdk-preview/${encodeURIComponent(target.sdk!.sourceCreatorSlug)}/games/${encodeURIComponent(target.sdk!.sourceGameId)}?revision=${encodeURIComponent(target.sdk!.packageRevision)}&room=${encodeURIComponent(target.displayCode)}`;
}
