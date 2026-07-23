import type { Room, RoomChoice, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { createWordWolfCommandScope, type WordWolfCommandType } from "@/lib/wordwolf-command-scope";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";
import { aiActivityFetch } from "@/lib/ai-activity-client";

const endpoint = "/api/wordwolf/rooms";
const roomApi = createOnlineRoomApiClient<Room, RoomChoice>({ endpoint });

async function readJson<T>(response: Response, errorCode: string) {
  if (!response.ok) throw new Error(errorCode);
  return response.json() as Promise<T>;
}

export async function fetchWordWolfRoom(code: string) {
  return roomApi.fetchRoom(code);
}

export async function fetchActiveWordWolfRoom(playerId: string) {
  return roomApi.fetchActiveRoom(playerId);
}

export async function fetchJoinableWordWolfRooms() {
  return roomApi.fetchJoinableRooms();
}

export async function createWordWolfRoom(room: Room) {
  return roomApi.post<{ room: Room }, { room: Room }>({ room });
}

export async function joinWordWolfRoom(code: string, passphrase: string) {
  return { room: await roomApi.patch(code, { type: "join-room", passphrase } satisfies WordWolfRoomAction) };
}

export function applyWordWolfRoomAction(code: string, action: WordWolfRoomAction) {
  return roomApi.patch(code, action);
}

export async function removeWordWolfRoom(code: string) {
  return roomApi.remove({ code });
}

export async function removeHostedWordWolfRooms(ownerId: string, fallbackHostId: string) {
  return roomApi.remove<{ ok: boolean; deleted: number }>({ ownerId, fallbackHostId }, "HOSTED_ROOMS_DELETE_FAILED");
}

export async function expireWordWolfPhase(code: string, commandId: string) {
  const response = await fetch("/api/game-timer/expire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: "wordwolf", roomCode: code, eventId: commandId }) });
  return readJson<{ room: Room | null; applied: boolean; retryAfterMs?: number }>(response, "ROOM_COMMAND_FAILED");
}

async function sendWordWolfCommand(
  room: Room,
  input: {
    type: WordWolfCommandType;
    commandId: string;
    playerId?: string;
    text?: string;
    targetId?: string;
    guess?: string;
  },
) {
  const requestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: room.code,
      scope: createWordWolfCommandScope(room),
      ...input,
    }),
  } satisfies RequestInit;
  const activityLabel = input.type === "start-game"
    ? "ワードウルフのお題準備"
    : input.type === "submit-wolf-guess"
      ? "ワードウルフの逆転回答判定"
      : null;
  const response = activityLabel
    ? await aiActivityFetch(activityLabel, "/api/wordwolf/commands", requestInit)
    : await fetch("/api/wordwolf/commands", requestInit);
  return readJson<{ room: Room; applied: boolean }>(response, "ROOM_COMMAND_FAILED");
}

export function submitWordWolfClue(room: Room, playerId: string, text: string, commandId: string) {
  return sendWordWolfCommand(room, { playerId, text, commandId, type: "submit-clue" });
}

export function castWordWolfVote(room: Room, playerId: string, targetId: string, commandId: string) {
  return sendWordWolfCommand(room, { playerId, targetId, commandId, type: "cast-vote" });
}

export function startWordWolfGame(room: Room, commandId: string) {
  return sendWordWolfCommand(room, { commandId, type: "start-game" });
}

export function submitWordWolfGuessCommand(room: Room, guess: string, commandId: string) {
  return sendWordWolfCommand(room, { guess, commandId, type: "submit-wolf-guess" });
}
