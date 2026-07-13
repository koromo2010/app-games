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

export async function removeWordWolfRoom(code: string) {
  const response = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { method: "DELETE" });
  return readJson<{ ok: boolean }>(response, "ROOM_DELETE_FAILED");
}

export async function removeHostedWordWolfRooms(ownerId: string, fallbackHostId: string) {
  const params = new URLSearchParams({ ownerId, fallbackHostId });
  const response = await fetch(`${endpoint}?${params.toString()}`, { method: "DELETE" });
  return readJson<{ ok: boolean; deleted: number }>(response, "HOSTED_ROOMS_DELETE_FAILED");
}
