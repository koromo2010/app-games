import type { CodeInterceptRoom, CodeInterceptRoomAction, CodeInterceptRoomChoice } from "@/lib/code-intercept";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const codeInterceptRoomApi = createOnlineRoomApiClient<CodeInterceptRoom, CodeInterceptRoomChoice>({ endpoint: "/api/code-intercept/rooms" });

export function createCodeInterceptRoom(room: CodeInterceptRoom, actorId: string) {
  return codeInterceptRoomApi.post<{ room: CodeInterceptRoom; actorId: string }, { room: CodeInterceptRoom }>({ room, actorId });
}

export function applyCodeInterceptRoomAction(code: string, action: CodeInterceptRoomAction) {
  return codeInterceptRoomApi.patch(code, action);
}

export async function fetchCodeInterceptDebugWords(roomCode: string) {
  const response = await fetch(`/api/code-intercept/debug-words?roomCode=${encodeURIComponent(roomCode)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as {
    words?: unknown;
    source?: unknown;
    difficulty?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "候補語を抽出できませんでした。");
  }
  const words = Array.isArray(payload?.words)
    ? payload.words.filter((word): word is string => typeof word === "string" && Boolean(word.trim()))
    : [];
  if (words.length !== 10) throw new Error("候補語を10語揃えられませんでした。");
  return { words, source: payload?.source, difficulty: payload?.difficulty };
}
