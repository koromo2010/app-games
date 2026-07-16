import { normalizeDrawingStroke, normalizeDrawingStrokes } from "@/lib/drawing-canvas";
import { findCanvasUndoStrokeIndex, nextCanvasOwnerId, type CanvasLayerMode, type CanvasRoom, type CanvasRoomAction, type CanvasRoomPlayer } from "@/lib/canvas-room";
import { redisCommand } from "@/lib/redis-store";

const key = (code: string) => `canvas:room:${code}`;
const ttl = 60 * 60 * 6;
const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

function parse(raw: string | null): CanvasRoom | null {
  if (!raw) return null;
  const room = JSON.parse(raw) as CanvasRoom;
  room.layerMode = room.layerMode === "per-player" ? "per-player" : "shared";
  room.layers = Array.isArray(room.layers) && room.layers.length ? room.layers : [{ id: "base", name: "レイヤー1", createdAt: room.updatedAt || Date.now() }];
  room.strokes = normalizeDrawingStrokes(room.strokes);
  room.strokes = room.strokes.filter((stroke) => !stroke.inProgress || (stroke.updatedAt || 0) > Date.now() - 15_000);
  return room;
}

export function publicCanvasRoom(room: CanvasRoom) { const safe: Partial<CanvasRoom> = { ...room }; delete safe.passphrase; return { ...safe, passphraseProtected: Boolean(room.passphrase) }; }
export async function loadCanvasRoom(code: string) { return parse(await redisCommand<string | null>(["GET", key(normalizeCode(code))])); }
export async function createCanvasRoom(player: CanvasRoomPlayer, passphrase = "", layerMode: CanvasLayerMode = "shared") {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const layerId = crypto.randomUUID();
    const firstPlayer = layerMode === "per-player" ? { ...player, layerId } : player;
    const room: CanvasRoom = { code, ownerId: player.id, passphrase: passphrase.trim().slice(0, 40) || undefined, layerMode, layers: [{ id: layerId, name: layerMode === "per-player" ? `${player.name}のレイヤー` : "レイヤー1", ownerId: layerMode === "per-player" ? player.id : undefined, createdAt: Date.now() }], players: [firstPlayer], strokes: [], revision: 1, updatedAt: Date.now() };
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
      if (!member) {
        if (room.layerMode === "per-player") { const layerId = crypto.randomUUID(); room.layers.push({ id: layerId, name: `${actor.name}のレイヤー`, ownerId: actor.id, createdAt: Date.now() }); room.players.push({ ...actor, layerId }); }
        else room.players.push(actor);
      }
    } else {
      if (!member) throw new Error("CANVAS_ROOM_FORBIDDEN");
      if (action.type === "leave") {
        room.players = room.players.filter((player) => player.id !== actor.id);
        if (room.ownerId === actor.id) room.ownerId = nextCanvasOwnerId(room.players) ?? actor.id;
      }
      if (action.type === "stroke" || action.type === "stroke-progress") {
        const stroke = normalizeDrawingStroke(action.stroke);
        const actorLayerId = room.players.find((player) => player.id === actor.id)?.layerId;
        const requestedLayerId = room.layerMode === "per-player" ? actorLayerId : stroke?.layerId;
        const layerId = room.layers.some((layer) => layer.id === requestedLayerId) ? requestedLayerId : room.layers[0]?.id;
        if (stroke && layerId) {
          const nextStroke = { ...stroke, layerId, authorId: actor.id, ...(action.type === "stroke-progress" ? { inProgress: true, updatedAt: Date.now() } : { inProgress: undefined, updatedAt: undefined }) };
          const existingIndex = room.strokes.findIndex((item) => item.id === stroke.id && item.authorId === actor.id);
          if (existingIndex >= 0) room.strokes[existingIndex] = nextStroke;
          else room.strokes = normalizeDrawingStrokes([...room.strokes, nextStroke]);
        }
      }
      if (action.type === "add-layer") { if (room.layerMode !== "shared") throw new Error("CANVAS_ROOM_FORBIDDEN"); room.layers.push({ id: crypto.randomUUID(), name: action.name?.trim().slice(0, 30) || `レイヤー${room.layers.length + 1}`, createdAt: Date.now() }); }
      if (action.type === "remove-layer") { if (room.ownerId !== actor.id || room.layers.length <= 1) throw new Error("CANVAS_ROOM_FORBIDDEN"); room.layers = room.layers.filter((layer) => layer.id !== action.layerId); room.strokes = room.strokes.filter((stroke) => stroke.layerId !== action.layerId); }
      if (action.type === "undo") {
        const actorLayerId = room.players.find((player) => player.id === actor.id)?.layerId;
        const layerId = room.layerMode === "per-player" ? actorLayerId : action.layerId;
        const index = findCanvasUndoStrokeIndex(room.strokes, actor.id, layerId);
        if (index >= 0) room.strokes.splice(index, 1);
      }
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
