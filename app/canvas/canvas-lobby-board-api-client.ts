import type { DrawingStroke } from "@/lib/drawing-canvas";
import { fetchConditionalJson } from "@/lib/conditional-json-client";

export type CanvasLobbyBoardView = { strokes: DrawingStroke[]; revision: number };
export type CanvasLobbyBoardAction =
  | { action: "stroke"; stroke: DrawingStroke }
  | { action: "undo" }
  | { action: "clear-own" };

async function readBoardResponse(response: Response) {
  const data = await response.json() as { board?: CanvasLobbyBoardView; error?: string };
  if (!response.ok || !data.board) throw new Error(data.error || "落書きボードを更新できませんでした");
  return data.board;
}

export async function loadCanvasLobbyBoardView() {
  const result = await fetchConditionalJson<{ board?: CanvasLobbyBoardView }>("/api/canvas/lobby-board");
  if (!result.ok || !result.data?.board) throw new Error("落書きボードを読み込めませんでした");
  return result.data.board;
}

export async function mutateCanvasLobbyBoard(action: CanvasLobbyBoardAction) {
  return readBoardResponse(await fetch("/api/canvas/lobby-board", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  }));
}
