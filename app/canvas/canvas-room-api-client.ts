import type { CanvasRoomAction, CanvasRoomPlayer, CanvasRoom } from "@/lib/canvas-room";
import { fetchConditionalJson } from "@/lib/conditional-json-client";

export type PublicCanvasRoom = Omit<CanvasRoom, "passphrase"> & { passphraseProtected: boolean };

async function readRoomResponse(response: Response) {
  const data = await response.json() as { room?: PublicCanvasRoom; error?: string };
  if (!response.ok || !data.room) throw new Error(data.error || "ルーム操作に失敗しました");
  return data.room;
}

export async function mutateCanvasRoom(method: "POST" | "PATCH", body: unknown) {
  return readRoomResponse(await fetch("/api/canvas/rooms", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export async function loadCanvasRoomView(code: string) {
  const result = await fetchConditionalJson<{ room?: PublicCanvasRoom }>(`/api/canvas/rooms?code=${encodeURIComponent(code)}`);
  if (!result.ok || !result.data?.room) throw new Error("ルームを読み込めませんでした");
  return result.data.room;
}

export async function deleteCanvasRoomView(code: string) {
  const response = await fetch(`/api/canvas/rooms?code=${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || "部屋を閉じられませんでした");
  }
}

export function sendCanvasStrokeProgress(code: string, action: CanvasRoomAction) {
  return fetch("/api/canvas/rooms", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, action }),
  });
}

export function canvasPlayerLayerId(room: PublicCanvasRoom, playerId?: CanvasRoomPlayer["id"]) {
  return room.layerMode === "per-player" ? room.players.find((player) => player.id === playerId)?.layerId : undefined;
}
