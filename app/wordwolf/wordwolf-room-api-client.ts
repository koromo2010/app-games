import type { Room, RoomChoice } from "@/lib/wordwolf-game-types";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

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

export async function persistWordWolfRoom(room: Room) {
  return roomApi.post<{ room: Room }, { room: Room }>({ room });
}

export async function joinWordWolfRoom(code: string, passphrase: string) {
  return roomApi.post<{ action: "join"; code: string; passphrase: string }, { room: Room }>({ action: "join", code, passphrase }, "ROOM_JOIN_FAILED");
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

async function sendWordWolfCommand(input: Record<string, string>) {
  const response = await fetch("/api/wordwolf/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return readJson<{ room: Room; applied: boolean }>(response, "ROOM_COMMAND_FAILED");
}

export function submitWordWolfClue(code: string, playerId: string, text: string, commandId: string) {
  return sendWordWolfCommand({ code, playerId, text, commandId, type: "submit-clue" });
}

export function castWordWolfVote(code: string, playerId: string, targetId: string, commandId: string) {
  return sendWordWolfCommand({ code, playerId, targetId, commandId, type: "cast-vote" });
}

export function startWordWolfGame(code: string, commandId: string) {
  return sendWordWolfCommand({ code, commandId, type: "start-game" });
}

export function submitWordWolfGuessCommand(code: string, guess: string, commandId: string) {
  return sendWordWolfCommand({ code, guess, commandId, type: "submit-wolf-guess" });
}
