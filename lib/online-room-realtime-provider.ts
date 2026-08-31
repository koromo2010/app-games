import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { resolveGameFieldsEnvironment } from "./game-fields-environment.ts";
import type { OnlineRoomRealtimeAuthorizationDriver, OnlineRoomRealtimeTarget } from "./online-room-realtime-authorization.ts";
import type { OnlineRoomRealtimeRole } from "./online-room-realtime-capability.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { loadOnlineRoomForSpectator } from "./online-room-spectator-registry.ts";
import { loadOnlineRoomSpectatorPolicy } from "./online-room-spectator-store.ts";
import { onlineRoomSpectatorCookieName, parseOnlineRoomSpectatorGrant } from "./online-room-spectator-auth.ts";
import { resolveCanonicalRoomInviteTarget } from "./room-invite-provider.ts";
import { canonicalRoomInvitePrimaryBindingDigest, type CanonicalRoomInvitePrimaryBinding } from "./room-invite-target.ts";
import { loadOnlineRoomRealtimeSessionEpoch } from "./online-room-realtime-revocation.ts";

function targetDigest(target: CanonicalRoomInvitePrimaryBinding, sdk?: unknown) {
  const primary = canonicalRoomInvitePrimaryBindingDigest(target);
  return createHash("sha256").update(JSON.stringify({
    primary,
    sdk,
  })).digest("hex");
}

function sdkIdentity(target: NonNullable<Awaited<ReturnType<typeof canonical>>>) {
  return "sdk" in target ? target.sdk : undefined;
}

async function canonical(game: OnlineRoomRealtimeGame, code: string, actorId?: string) {
  return resolveCanonicalRoomInviteTarget({
    providerKind: game.startsWith("sdk:") ? "sdk-approved" : game === "canvas" ? "canvas" : "built-in",
    gameNamespace: game.startsWith("sdk:") ? game.slice(4) : game,
    displayCode: code,
  }, actorId);
}

async function participantTarget(actorId: string, game: OnlineRoomRealtimeGame, code: string) {
  const target = await canonical(game, code, actorId);
  if (!target) return null;
  const binding: CanonicalRoomInvitePrimaryBinding = {
    environment: target.environment,
    providerKind: target.providerKind,
    gameNamespace: target.gameNamespace,
    displayCode: target.displayCode,
    roomInstanceId: target.roomInstanceId,
    ...(sdkIdentity(target) ? { packageRevision: sdkIdentity(target)!.packageRevision, packageRootSha256: sdkIdentity(target)!.packageRootSha256 } : {}),
  };
  return { target, binding };
}

async function spectatorTarget(actorId: string, game: OnlineRoomRealtimeGame, code: string) {
  if (game === "canvas") return null;
  const room = await loadOnlineRoomForSpectator(game, code);
  if (!room?.roomInstanceId) return null;
  const policy = await loadOnlineRoomSpectatorPolicy(game, code, room.createdAt, room.roomInstanceId);
  if (!policy.enabled) return null;
  const store = await cookies();
  const grant = parseOnlineRoomSpectatorGrant(store.get(onlineRoomSpectatorCookieName)?.value ?? "");
  if (
    !grant || grant.version !== 2 || grant.playerId !== actorId
    || grant.game !== game || grant.code !== code
    || grant.roomCreatedAt !== room.createdAt
    || grant.roomInstanceId !== room.roomInstanceId
    || grant.grantVersion !== policy.grantVersion
  ) return null;
  const target = await canonical(game, code);
  if (!target || target.roomInstanceId !== room.roomInstanceId) return null;
  const binding: CanonicalRoomInvitePrimaryBinding = {
    environment: target.environment,
    providerKind: target.providerKind,
    gameNamespace: target.gameNamespace,
    displayCode: target.displayCode,
    roomInstanceId: target.roomInstanceId,
    ...(sdkIdentity(target) ? { packageRevision: sdkIdentity(target)!.packageRevision, packageRootSha256: sdkIdentity(target)!.packageRootSha256 } : {}),
  };
  return { target, binding };
}

export const productionOnlineRoomRealtimeAuthorizationDriver: OnlineRoomRealtimeAuthorizationDriver = {
  async resolve({ actorId, game, code, role }): Promise<OnlineRoomRealtimeTarget | null> {
    const resolved = role === "spectator"
      ? await spectatorTarget(actorId, game, code)
      : await participantTarget(actorId, game, code);
    if (!resolved) return null;
    const sessionEpoch = await loadOnlineRoomRealtimeSessionEpoch(actorId);
    return {
      environment: resolveGameFieldsEnvironment(),
      actorId,
      game,
      code: resolved.target.displayCode,
      roomInstanceId: resolved.target.roomInstanceId,
      targetDigest: targetDigest(resolved.binding, sdkIdentity(resolved.target)),
      role: (role ?? "participant") as OnlineRoomRealtimeRole,
      sessionEpoch,
    };
  },
  sessionEpoch: loadOnlineRoomRealtimeSessionEpoch,
};
