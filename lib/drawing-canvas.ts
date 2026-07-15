export type DrawingPoint = { x: number; y: number };
export type DrawingStroke = {
  id: string;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  points: DrawingPoint[];
};

export const drawingCanvasLimits = {
  maxStrokes: 500,
  maxPointsPerStroke: 2000,
  minWidth: 1,
  maxWidth: 40,
} as const;

export function clampDrawingPoint(point: DrawingPoint): DrawingPoint {
  return {
    x: Math.min(1, Math.max(0, Number.isFinite(point.x) ? point.x : 0)),
    y: Math.min(1, Math.max(0, Number.isFinite(point.y) ? point.y : 0)),
  };
}

export function normalizeDrawingStroke(value: unknown): DrawingStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<DrawingStroke>;
  const id = typeof stroke.id === "string" ? stroke.id.trim().slice(0, 100) : "";
  const color = typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : "#0f172a";
  const width = Math.min(drawingCanvasLimits.maxWidth, Math.max(drawingCanvasLimits.minWidth, Number(stroke.width) || 4));
  const tool = stroke.tool === "eraser" ? "eraser" : "pen";
  const points = Array.isArray(stroke.points)
    ? stroke.points.flatMap((point) => point && typeof point === "object" ? [clampDrawingPoint(point as DrawingPoint)] : []).slice(0, drawingCanvasLimits.maxPointsPerStroke)
    : [];
  return id && points.length > 0 ? { id, color, width, tool, points } : null;
}

export function normalizeDrawingStrokes(value: unknown): DrawingStroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stroke) => {
    const normalized = normalizeDrawingStroke(stroke);
    return normalized ? [normalized] : [];
  }).slice(-drawingCanvasLimits.maxStrokes);
}
