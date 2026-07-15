import { normalizeDrawingStroke, normalizeDrawingStrokes, type DrawingStroke } from "@/lib/drawing-canvas";
import { redisCommand } from "@/lib/redis-store";
import { activeCanvasLobbyStrokes, canvasLobbyRetentionMs } from "@/lib/canvas-lobby-board";

const boardKey = "canvas:lobby-board:v1";
const retentionSeconds = Math.ceil(canvasLobbyRetentionMs / 1000);
type LobbyBoard = { strokes: DrawingStroke[]; revision: number; updatedAt: number };

function parse(raw: string | null): LobbyBoard {
  if (!raw) return { strokes: [], revision: 0, updatedAt: Date.now() };
  const board = JSON.parse(raw) as LobbyBoard;
  return { ...board, strokes: activeCanvasLobbyStrokes(normalizeDrawingStrokes(board.strokes), Date.now(), board.updatedAt) };
}

export async function loadCanvasLobbyBoard() { return parse(await redisCommand<string | null>(["GET", boardKey])); }

export async function appendCanvasLobbyStroke(actorId: string, input: DrawingStroke) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const raw = await redisCommand<string | null>(["GET", boardKey]);
    const board = parse(raw);
    const stroke = normalizeDrawingStroke(input);
    if (!stroke) throw new Error("INVALID_CANVAS_STROKE");
    const now = Date.now();
    const nextStroke = { ...stroke, authorId: actorId, layerId: "base", inProgress: undefined, updatedAt: now };
    const index = board.strokes.findIndex((item) => item.id === stroke.id && item.authorId === actorId);
    if (index >= 0) board.strokes[index] = nextStroke;
    else board.strokes = normalizeDrawingStrokes([...board.strokes, nextStroke]);
    board.revision++; board.updatedAt = now;
    const nextRaw = JSON.stringify(board);
    const updated = raw
      ? await redisCommand<number>(["EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0", "1", boardKey, raw, nextRaw, String(retentionSeconds)])
      : await redisCommand<"OK" | null>(["SET", boardKey, nextRaw, "NX", "EX", String(retentionSeconds)]).then((value) => value ? 1 : 0);
    if (updated) return board;
  }
  throw new Error("CANVAS_BOARD_CONFLICT");
}

export async function undoCanvasLobbyStroke(actorId: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const raw = await redisCommand<string | null>(["GET", boardKey]);
    if (!raw) return parse(null);
    const board = parse(raw);
    const index = board.strokes.findLastIndex((stroke) => stroke.authorId === actorId);
    if (index < 0) return board;
    board.strokes.splice(index, 1); board.revision++; board.updatedAt = Date.now();
    const updated = await redisCommand<number>(["EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0", "1", boardKey, raw, JSON.stringify(board), String(retentionSeconds)]);
    if (updated) return board;
  }
  throw new Error("CANVAS_BOARD_CONFLICT");
}
