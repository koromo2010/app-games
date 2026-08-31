import {
  createOnlineRoomRealtimeCapability,
  parseOnlineRoomRealtimeCapability,
  type OnlineRoomRealtimeCapability,
  type OnlineRoomRealtimeRole,
} from "./online-room-realtime-capability.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";

export type OnlineRoomRealtimeTarget = {
  environment: GameFieldsEnvironment;
  actorId: string;
  game: OnlineRoomRealtimeGame;
  code: string;
  roomInstanceId: string;
  targetDigest: string;
  role: OnlineRoomRealtimeRole;
  sessionEpoch: number;
  roomExpiresAt?: number;
};

export type OnlineRoomRealtimeAuthorizationDriver = {
  resolve(input: { actorId: string; game: OnlineRoomRealtimeGame; code: string; role?: OnlineRoomRealtimeRole }): Promise<OnlineRoomRealtimeTarget | null>;
  sessionEpoch(actorId: string): Promise<number>;
};

export function onlineRoomRealtimeTargetsEqual(
  capability: OnlineRoomRealtimeCapability,
  target: OnlineRoomRealtimeTarget,
) {
  return capability.environment === target.environment
    && capability.actorId === target.actorId
    && capability.game === target.game
    && capability.code === target.code
    && capability.roomInstanceId === target.roomInstanceId
    && capability.targetDigest === target.targetDigest
    && capability.role === target.role
    && capability.sessionEpoch === target.sessionEpoch;
}

export function createOnlineRoomRealtimeAuthorizer(
  driver: OnlineRoomRealtimeAuthorizationDriver,
  options: { now?: () => number; env?: NodeJS.ProcessEnv } = {},
) {
  const now = options.now ?? Date.now;
  return {
    async mint(input: { actorId: string; game: OnlineRoomRealtimeGame; code: string; role?: OnlineRoomRealtimeRole; family?: "room-revision" | "chat-hint"; expectedRoomInstanceId?: string }) {
      const target = await driver.resolve(input);
      if (!target) return null;
      const family = input.family ?? "room-revision";
      if ((input.role && input.role !== target.role)
        || (family === "chat-hint" && (target.role !== "participant" || (input.expectedRoomInstanceId && input.expectedRoomInstanceId !== target.roomInstanceId)))) return null;
      const currentEpoch = await driver.sessionEpoch(input.actorId);
      if (currentEpoch !== target.sessionEpoch) return null;
      return createOnlineRoomRealtimeCapability({
        ...target,
        family,
        scope: family === "chat-hint" ? "room:chat:read" : "room:revision:read",
      }, { now: now(), env: options.env });
    },
    async authorize(token: string) {
      const capability = parseOnlineRoomRealtimeCapability(token, { now: now(), env: options.env });
      if (!capability) return null;
      if (await driver.sessionEpoch(capability.actorId) !== capability.sessionEpoch) return null;
      const target = await driver.resolve({
        actorId: capability.actorId,
        game: capability.game,
        code: capability.code,
        role: capability.role,
      });
      return target && onlineRoomRealtimeTargetsEqual(capability, target)
        ? capability
        : null;
    },
  };
}
