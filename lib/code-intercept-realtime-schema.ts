import { z } from "zod";

const roomCodePattern = /^[A-Z0-9]{4}$/;
const channelPrefix = "code-intercept:realtime:";

export const codeInterceptRealtimeSchema = {
  room: {
    updated: z.object({
      code: z.string().regex(roomCodePattern),
      revision: z.number().int().nonnegative(),
    }),
    dissolved: z.object({
      code: z.string().regex(roomCodePattern),
    }),
  },
};

export type CodeInterceptRealtimeSchema = typeof codeInterceptRealtimeSchema;
export type CodeInterceptRealtimeConnectionStatus = "connected" | "disconnected" | "error" | "connecting";

type RealtimeEnvironment = Record<string, string | undefined>;

/**
 * The pilot is automatic on Vercel Preview and can be enabled explicitly for
 * local development. Production stays disabled even if the flag is copied by
 * mistake.
 */
export function codeInterceptRealtimePilotEnabled(env: RealtimeEnvironment = process.env) {
  if (env.VERCEL_ENV === "production" || env.APP_ENV === "production") return false;
  if (env.CODE_INTERCEPT_REALTIME_ENABLED === "0") return false;
  if (env.VERCEL_ENV === "preview" && env.APP_ENV === "development") return true;
  return env.CODE_INTERCEPT_REALTIME_ENABLED === "1" && env.APP_ENV === "development";
}

export function codeInterceptRealtimeChannel(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!roomCodePattern.test(normalized)) throw new Error("INVALID_CODE_INTERCEPT_REALTIME_CHANNEL");
  return `${channelPrefix}${normalized}`;
}

export function codeInterceptRoomCodeFromRealtimeChannel(channel: string) {
  if (!channel.startsWith(channelPrefix)) return null;
  const code = channel.slice(channelPrefix.length);
  return roomCodePattern.test(code) ? code : null;
}

export function codeInterceptPollingInterval(input: {
  realtimeEnabled: boolean;
  realtimeStatus: CodeInterceptRealtimeConnectionStatus;
  phase: "lobby" | "game-result" | string | undefined;
}) {
  if (input.realtimeEnabled && input.realtimeStatus === "connected") return 30_000;
  return input.phase === "lobby" || input.phase === "game-result" ? 5_000 : 3_000;
}
