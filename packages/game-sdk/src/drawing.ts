export type DrawingPoint = { x: number; y: number };
export type DrawingTool =
  | "pen"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "pan";
export type DrawingStrokeTool = "pen" | "eraser" | "fill";
export type DrawingStroke = {
  id: string;
  layerId?: string;
  authorId?: string;
  inProgress?: boolean;
  updatedAt?: number;
  color: string;
  width: number;
  opacity: number;
  tool: DrawingStrokeTool;
  points: DrawingPoint[];
};
export type DrawingLayer = {
  id: string;
  name: string;
  ownerId?: string;
  createdAt: number;
};
export type DrawingFeatureFlags = {
  layers: boolean;
  fullscreen: boolean;
  fill: boolean;
  eyedropper: boolean;
  zoom: boolean;
  roomRecruitment: boolean;
};

export const drawingLimits = {
  maxStrokes: 500,
  maxPointsPerStroke: 2_000,
  minWidth: 1,
  maxWidth: 40,
} as const;

export const drawingFeaturePresets = {
  lobbyBoard: {
    layers: false,
    fullscreen: true,
    fill: true,
    eyedropper: true,
    zoom: true,
    roomRecruitment: true,
  },
  collaborativeRoom: {
    layers: true,
    fullscreen: true,
    fill: true,
    eyedropper: true,
    zoom: true,
    roomRecruitment: true,
  },
} satisfies Record<string, DrawingFeatureFlags>;

export type DrawingFeaturePreset = keyof typeof drawingFeaturePresets;

export function drawingFeatures(
  preset: DrawingFeaturePreset,
  overrides: Partial<DrawingFeatureFlags> = {},
) {
  return { ...drawingFeaturePresets[preset], ...overrides };
}

export function clampDrawingPoint(point: DrawingPoint): DrawingPoint {
  return {
    x: Math.min(1, Math.max(0, Number.isFinite(point.x) ? point.x : 0)),
    y: Math.min(1, Math.max(0, Number.isFinite(point.y) ? point.y : 0)),
  };
}

export function normalizeDrawingStroke(value: unknown): DrawingStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<DrawingStroke>;
  const id = typeof stroke.id === "string"
    ? stroke.id.trim().slice(0, 100)
    : "";
  const layerId = typeof stroke.layerId === "string"
    ? stroke.layerId.trim().slice(0, 100) || undefined
    : undefined;
  const authorId = typeof stroke.authorId === "string"
    ? stroke.authorId.trim().slice(0, 100) || undefined
    : undefined;
  const inProgress = stroke.inProgress === true;
  const updatedAt = Number.isFinite(stroke.updatedAt)
    ? Number(stroke.updatedAt)
    : undefined;
  const color =
    typeof stroke.color === "string"
    && /^#[0-9a-f]{6}$/i.test(stroke.color)
      ? stroke.color
      : "#0f172a";
  const width = Math.min(
    drawingLimits.maxWidth,
    Math.max(drawingLimits.minWidth, Number(stroke.width) || 4),
  );
  const opacity = Math.min(
    1,
    Math.max(0.1, Number(stroke.opacity) || 1),
  );
  const tool =
    stroke.tool === "eraser" || stroke.tool === "fill"
      ? stroke.tool
      : "pen";
  const points = Array.isArray(stroke.points)
    ? stroke.points
      .flatMap((point) =>
        point && typeof point === "object"
          ? [clampDrawingPoint(point as DrawingPoint)]
          : []
      )
      .slice(0, drawingLimits.maxPointsPerStroke)
    : [];
  return id && points.length > 0
    ? {
      id,
      ...(layerId ? { layerId } : {}),
      ...(authorId ? { authorId } : {}),
      ...(inProgress ? { inProgress: true } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      color,
      width,
      opacity,
      tool,
      points,
    }
    : null;
}

export function hexToRgba(hex: string, opacity = 1) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    value >> 16,
    (value >> 8) & 255,
    value & 255,
    Math.round(opacity * 255),
  ] as const;
}

export function floodFillPixels(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
) {
  const startX = Math.max(0, Math.min(canvasWidth - 1, Math.floor(x)));
  const startY = Math.max(0, Math.min(canvasHeight - 1, Math.floor(y)));
  const start = (startY * canvasWidth + startX) * 4;
  const target = [
    data[start],
    data[start + 1],
    data[start + 2],
    data[start + 3],
  ];
  if (target.every((value, index) => value === color[index])) return false;
  const matches = (px: number, py: number) => {
    const index = (py * canvasWidth + px) * 4;
    return (
      data[index] === target[0]
      && data[index + 1] === target[1]
      && data[index + 2] === target[2]
      && data[index + 3] === target[3]
    );
  };
  const paint = (px: number, py: number) => {
    const index = (py * canvasWidth + px) * 4;
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  };
  const stack: Array<[number, number]> = [[startX, startY]];
  while (stack.length) {
    const [seedX, seedY] = stack.pop()!;
    if (!matches(seedX, seedY)) continue;
    let left = seedX;
    while (left > 0 && matches(left - 1, seedY)) left -= 1;
    let above = false;
    let below = false;
    for (
      let px = left;
      px < canvasWidth && matches(px, seedY);
      px += 1
    ) {
      paint(px, seedY);
      if (seedY > 0) {
        const match = matches(px, seedY - 1);
        if (match && !above) stack.push([px, seedY - 1]);
        above = match;
      }
      if (seedY + 1 < canvasHeight) {
        const match = matches(px, seedY + 1);
        if (match && !below) stack.push([px, seedY + 1]);
        below = match;
      }
    }
  }
  return true;
}

export function normalizeDrawingStrokes(value: unknown): DrawingStroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stroke) => {
    const normalized = normalizeDrawingStroke(stroke);
    return normalized ? [normalized] : [];
  }).slice(-drawingLimits.maxStrokes);
}
