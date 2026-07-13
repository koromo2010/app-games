import type { Room, RoomChoice } from "@/lib/wordwolf-game-types";

const endpoint = "/api/wordwolf/rooms";

async function readJson<T>(response: Response, errorCode: string) {
  if (!response.ok) throw new Error(errorCode);
  return response.json() as Promise<T>;
}

export async function fetchWordWolfRoom(code: string) {
  const response = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  const data = await readJson<{ room?: Room }>(response, "ROOM_FETCH_FAILED");
  return data.room ?? null;
}

export async function fetchActiveWordWolfRoom(playerId: string) {
  const response = await fetch(`${endpoint}?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
  const data = await readJson<{ room?: Room | null }>(response, "ACTIVE_ROOM_FETCH_FAILED");
  return data.room ?? null;
}

export async function fetchJoinableWordWolfRooms() {
  const response = await fetch(endpoint, { cache: "no-store" });
  const data = await readJson<{ rooms?: RoomChoice[] }>(response, "ROOM_LIST_FAILED");
  return Array.isArray(data.rooms) ? data.rooms : [];
}

export async function persistWordWolfRoom(room: Room) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room }) });
  return readJson<{ room: Room }>(response, "ROOM_SAVE_FAILED");
}

export async function joinWordWolfRoom(code: string, passphrase: string) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", code, passphrase }) });
  return readJson<{ room: Room }>(response, "ROOM_JOIN_FAILED");
}

export async function removeWordWolfRoom(code: string) {
  const response = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { method: "DELETE" });
  return readJson<{ ok: boolean }>(response, "ROOM_DELETE_FAILED");
}

export async function removeHostedWordWolfRooms(ownerId: string, fallbackHostId: string) {
  const params = new URLSearchParams({ ownerId, fallbackHostId });
  const response = await fetch(`${endpoint}?${params.toString()}`, { method: "DELETE" });
  return readJson<{ ok: boolean; deleted: number }>(response, "HOSTED_ROOMS_DELETE_FAILED");
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
