import { Realtime } from "@upstash/realtime";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/redis-store";
import {
  codeInterceptRealtimeChannel,
  codeInterceptRealtimePilotEnabled,
  codeInterceptRealtimeSchema,
} from "@/lib/code-intercept-realtime-schema";

let cachedRealtime: Realtime<{ schema: typeof codeInterceptRealtimeSchema; redis: Redis; maxDurationSecs: number; history: { maxLength: number; expireAfterSecs: number } }> | null | undefined;

export function getCodeInterceptRealtime() {
  if (!codeInterceptRealtimePilotEnabled()) return null;
  if (cachedRealtime !== undefined) return cachedRealtime;
  const config = getRedisConfig();
  if (!config || config.transport !== "rest") {
    cachedRealtime = null;
    return cachedRealtime;
  }
  cachedRealtime = new Realtime({
    schema: codeInterceptRealtimeSchema,
    redis: new Redis({ url: config.url, token: config.token }),
    maxDurationSecs: 300,
    history: { maxLength: 64, expireAfterSecs: 3_600 },
  });
  return cachedRealtime;
}

export async function emitCodeInterceptRoomUpdated(code: string, revision: number) {
  const realtime = getCodeInterceptRealtime();
  if (!realtime) return false;
  try {
    await realtime.channel(codeInterceptRealtimeChannel(code)).emit("room.updated", {
      code: code.trim().toUpperCase(),
      revision,
    });
    return true;
  } catch {
    // Realtime is an optimization; authenticated polling remains authoritative.
    return false;
  }
}

export async function emitCodeInterceptRoomDissolved(code: string) {
  const realtime = getCodeInterceptRealtime();
  if (!realtime) return false;
  try {
    await realtime.channel(codeInterceptRealtimeChannel(code)).emit("room.dissolved", {
      code: code.trim().toUpperCase(),
    });
    return true;
  } catch {
    return false;
  }
}
