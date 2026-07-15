import { normalizeDrawingStroke, normalizeDrawingStrokes } from "@/lib/drawing-canvas";
import type { CanvasRoom, CanvasRoomAction, CanvasRoomPlayer } from "@/lib/canvas-room";
import { redisCommand } from "@/lib/redis-store";

const key = (code: string) => `canvas:room:${code}`;
const ttl = 60 * 60 * 6;
const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

function parse(raw: string | null): CanvasRoom | null {
  if (!raw) return null;
  const room = JSON.parse(raw) as CanvasRoom;
  room.strokes = normalizeDrawingStrokes(room.strokes);
  return room;
}

export function publicCanvasRoom(room: CanvasRoom) { const safe: Partial<CanvasRoom> = { ...room }; delete safe.passphrase; return { ...safe, passphraseProtected: Boolean(room.passphrase) }; }
export async function loadCanvasRoom(code: string) { return parse(await redisCommand<string | null>(["GET", key(normalizeCode(code))])); }
export async function createCanvasRoom(player: CanvasRoomPlayer, passphrase = "") {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const room: CanvasRoom = { code, ownerId: player.id, passphrase: passphrase.trim().slice(0, 40) || undefined, players: [player], strokes: [], revision: 1, updatedAt: Date.now() };
    if (await redisCommand<"OK" | null>(["SET", key(code), JSON.stringify(room), "NX", "EX", String(ttl)])) return room;
  }
  throw new Error("CANVAS_ROOM_CONFLICT");
}
export async function updateCanvasRoom(codeInput: string, actor: CanvasRoomPlayer, action: CanvasRoomAction) {
  const code = normalizeCode(codeInput);
  for (let attempt = 0; attempt < 6; attempt++) {
    const currentRaw = await redisCommand<string | null>(["GET", key(code)]);
    const room = parse(currentRaw);
    if (!room || !currentRaw) throw new Error("CANVAS_ROOM_NOT_FOUND");
    const member = room.players.some((player) => player.id === actor.id);
    if (action.type === "join") {
      if (room.passphrase && room.passphrase !== action.passphrase?.trim()) throw new Error("CANVAS_BAD_PASSPHRASE");
      if (!member && room.players.length >= 12) throw new Error("CANVAS_ROOM_FULL");
      if (!member) room.players.push(actor);
    } else {
      if (!member) throw new Error("CANVAS_ROOM_FORBIDDEN");
      if (action.type === "leave") room.players = room.players.filter((player) => player.id !== actor.id);
      if (action.type === "stroke") { const stroke = normalizeDrawingStroke(action.stroke); if (stroke) room.strokes = normalizeDrawingStrokes([...room.strokes, stroke]); }
      if (action.type === "undo") room.strokes.pop();
      if (action.type === "clear") { if (room.ownerId !== actor.id) throw new Error("CANVAS_ROOM_FORBIDDEN"); room.strokes = []; }
    }
    room.revision++; room.updatedAt = Date.now();
    const nextRaw = JSON.stringify(room);
    const updated = await redisCommand<number>(["EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0", "1", key(code), currentRaw, nextRaw, String(ttl)]);
    if (updated) return room;
  }
  throw new Error("CANVAS_ROOM_CONFLICT");
}
export async function deleteCanvasRoom(code: string, actorId: string) { const room = await loadCanvasRoom(code); if (!room) return; if (room.ownerId !== actorId) throw new Error("CANVAS_ROOM_FORBIDDEN"); await redisCommand<number>(["DEL", key(room.code)]); }
