"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  floodFillPixels,
  hexToRgba,
  type DrawingPoint,
  type DrawingFeatureFlags,
  type DrawingLayer,
  type DrawingStroke,
  type DrawingTool,
} from "./drawing.js";

export type DrawingCanvasProps = {
  strokes: readonly DrawingStroke[];
  color: string;
  width: number;
  opacity: number;
  tool: DrawingTool;
  disabled?: boolean;
  keyboardCursor?: DrawingPoint;
  layerIds?: readonly string[];
  activeLayerId?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  backgroundColor?: string;
  progressIntervalMs?: number;
  maximumPixelRatio?: number;
  createStrokeId?: () => string;
  onColorPick?: (color: string) => void;
  onPointerInteraction?: () => void;
  onPointerPosition?: (point: DrawingPoint) => void;
  onStrokeProgress?: (stroke: DrawingStroke) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  onStrokeComplete: (stroke: DrawingStroke) => void;
};

export type DrawingToolbarProps = {
  tool: DrawingTool;
  color: string;
  width: number;
  opacity: number;
  colors?: readonly string[];
  features?: Partial<
    Pick<DrawingFeatureFlags, "fill" | "eyedropper" | "zoom" | "fullscreen">
  >;
  locale?: "ja" | "en";
  disabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  zoom?: number;
  minimumZoom?: number;
  maximumZoom?: number;
  className?: string;
  style?: CSSProperties;
  onToolChange(tool: DrawingTool): void;
  onColorChange(color: string): void;
  onWidthChange(width: number): void;
  onOpacityChange(opacity: number): void;
  onUndo?(): void;
  onRedo?(): void;
  onZoomChange?(zoom: number): void;
  onFullscreen?(): void;
};

export type DrawingLayerPanelProps = {
  layers: readonly DrawingLayer[];
  activeLayerId: string;
  hiddenLayerIds?: ReadonlySet<string> | readonly string[];
  locale?: "ja" | "en";
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onActiveLayerChange(layerId: string): void;
  onLayerVisibilityChange?(layerId: string, visible: boolean): void;
};

function defaultStrokeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  canvasWidth: number,
  canvasHeight: number,
  pixelRatio: number,
) {
  if (stroke.points.length === 0) return;
  if (stroke.tool === "fill") {
    const point = stroke.points[0]!;
    const image = context.getImageData(0, 0, canvasWidth, canvasHeight);
    floodFillPixels(
      image.data,
      canvasWidth,
      canvasHeight,
      point.x * canvasWidth,
      point.y * canvasHeight,
      hexToRgba(stroke.color, stroke.opacity),
    );
    context.putImageData(image, 0, 0);
    return;
  }
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.globalAlpha = stroke.tool === "eraser" ? 1 : stroke.opacity;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width * pixelRatio;
  context.lineCap = "round";
  context.lineJoin = "round";
  const first = stroke.points[0]!;
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(
      first.x * canvasWidth,
      first.y * canvasHeight,
      stroke.width * pixelRatio / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(first.x * canvasWidth, first.y * canvasHeight);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    }
    context.stroke();
  }
  context.restore();
}

export function DrawingCanvas({
  strokes,
  color,
  width,
  opacity,
  tool,
  disabled = false,
  keyboardCursor,
  layerIds = ["base"],
  activeLayerId = "base",
  className = "",
  style,
  ariaLabel = "Drawing canvas",
  backgroundColor = "#ffffff",
  progressIntervalMs = 400,
  maximumPixelRatio = 2,
  createStrokeId = defaultStrokeId,
  onColorPick,
  onPointerInteraction,
  onPointerPosition,
  onStrokeProgress,
  onPan,
  onStrokeComplete,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);
  const lastProgressAtRef = useRef(0);
  const panPointRef = useRef<{ x: number; y: number } | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = rect.width > 0 ? canvas.width / rect.width : 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const layerId of layerIds) {
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = canvas.width;
      layerCanvas.height = canvas.height;
      const layerContext = layerCanvas.getContext("2d");
      if (!layerContext) continue;
      for (const stroke of strokes) {
        if ((stroke.layerId || "base") === layerId) {
          drawStroke(
            layerContext,
            stroke,
            canvas.width,
            canvas.height,
            pixelRatio,
          );
        }
      }
      if (
        activeStrokeRef.current
        && (activeStrokeRef.current.layerId || "base") === layerId
      ) {
        drawStroke(
          layerContext,
          activeStrokeRef.current,
          canvas.width,
          canvas.height,
          pixelRatio,
        );
      }
      context.drawImage(layerCanvas, 0, 0);
    }
  }, [layerIds, strokes]);

  useEffect(() => {
    redrawRef.current = redraw;
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        Math.max(1, maximumPixelRatio),
      );
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      redrawRef.current();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [maximumPixelRatio]);

  useEffect(() => redraw(), [redraw]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): DrawingPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(rect.width, 1),
      y: (event.clientY - rect.top) / Math.max(rect.height, 1),
    };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || event.button > 0) return;
    onPointerInteraction?.();
    const point = pointFromEvent(event);
    onPointerPosition?.(point);
    if (tool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      panPointRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    if (tool === "eyedropper") {
      const context = canvasRef.current?.getContext("2d");
      if (context) {
        const pixel = context.getImageData(
          Math.floor(point.x * context.canvas.width),
          Math.floor(point.y * context.canvas.height),
          1,
          1,
        ).data;
        onColorPick?.(
          pixel[3] === 0
            ? backgroundColor
            : `#${[pixel[0], pixel[1], pixel[2]]
              .map((value) => value!.toString(16).padStart(2, "0"))
              .join("")}`,
        );
      }
      return;
    }
    if (tool === "fill") {
      onStrokeComplete({
        id: createStrokeId(),
        layerId: activeLayerId,
        color,
        width,
        opacity,
        tool: "fill",
        points: [point],
      });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = {
      id: createStrokeId(),
      layerId: activeLayerId,
      color,
      width,
      opacity,
      tool,
      points: [point],
    };
    lastProgressAtRef.current = 0;
    redraw();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    onPointerPosition?.(pointFromEvent(event));
    if (
      panPointRef.current
      && event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      const previous = panPointRef.current;
      onPan?.(previous.x - event.clientX, previous.y - event.clientY);
      panPointRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const stroke = activeStrokeRef.current;
    if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    stroke.points.push(pointFromEvent(event));
    const now = performance.now();
    if (
      onStrokeProgress
      && now - lastProgressAtRef.current >= progressIntervalMs
    ) {
      lastProgressAtRef.current = now;
      onStrokeProgress({ ...stroke, points: [...stroke.points] });
    }
    redraw();
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panPointRef.current) {
      panPointRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeStrokeRef.current = null;
    onStrokeComplete(stroke);
  };

  const cursor =
    disabled
      ? "not-allowed"
      : tool === "pan"
        ? "grab"
        : tool === "eraser" || tool === "eyedropper"
          ? "cell"
          : "crosshair";
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label={ariaLabel}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
          backgroundColor,
          cursor,
          opacity: disabled ? 0.7 : 1,
        }}
      />
      {keyboardCursor && (
        <span
          aria-hidden="true"
          style={{
            pointerEvents: "none",
            position: "absolute",
            zIndex: 10,
            left: `${keyboardCursor.x * 100}%`,
            top: `${keyboardCursor.y * 100}%`,
            width: Math.max(10, width),
            height: Math.max(10, width),
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
            border: "2px solid #06b6d4",
            background: "rgba(255, 255, 255, 0.4)",
            boxShadow: "0 0 0 1px white",
          }}
        />
      )}
    </div>
  );
}

const defaultDrawingColors = [
  "#0f172a",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

const toolbarLabels = {
  ja: {
    pen: "ペン",
    eraser: "消しゴム",
    eyedropper: "スポイト",
    fill: "塗りつぶし",
    pan: "移動",
    undo: "戻す",
    redo: "やり直す",
    width: "太さ",
    opacity: "透明度",
    zoomOut: "縮小",
    zoomReset: "等倍",
    zoomIn: "拡大",
    fullscreen: "全画面",
    color: "色",
  },
  en: {
    pen: "Pen",
    eraser: "Eraser",
    eyedropper: "Eyedropper",
    fill: "Fill",
    pan: "Pan",
    undo: "Undo",
    redo: "Redo",
    width: "Width",
    opacity: "Opacity",
    zoomOut: "Zoom out",
    zoomReset: "Reset zoom",
    zoomIn: "Zoom in",
    fullscreen: "Fullscreen",
    color: "Color",
  },
} as const;

function toolbarButtonStyle(
  active: boolean,
  disabled: boolean,
): CSSProperties {
  return {
    minHeight: 36,
    borderRadius: 8,
    border: active ? "2px solid #0891b2" : "1px solid #cbd5e1",
    background: active ? "#cffafe" : "#ffffff",
    color: "#0f172a",
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}

export function DrawingToolbar({
  tool,
  color,
  width,
  opacity,
  colors = defaultDrawingColors,
  features = {},
  locale = "ja",
  disabled = false,
  canUndo = false,
  canRedo = false,
  zoom = 1,
  minimumZoom = 0.5,
  maximumZoom = 2,
  className = "",
  style,
  onToolChange,
  onColorChange,
  onWidthChange,
  onOpacityChange,
  onUndo,
  onRedo,
  onZoomChange,
  onFullscreen,
}: DrawingToolbarProps) {
  const labels = toolbarLabels[locale];
  const tools: Array<{ id: DrawingTool; label: string; visible: boolean }> = [
    { id: "pen", label: labels.pen, visible: true },
    { id: "eraser", label: labels.eraser, visible: true },
    {
      id: "eyedropper",
      label: labels.eyedropper,
      visible: features.eyedropper !== false,
    },
    {
      id: "fill",
      label: labels.fill,
      visible: features.fill !== false,
    },
    { id: "pan", label: labels.pan, visible: true },
  ];
  const zoomStep = 0.1;
  const setZoom = (next: number) => {
    onZoomChange?.(
      Math.min(maximumZoom, Math.max(minimumZoom, Math.round(next * 10) / 10)),
    );
  };
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#f8fafc",
        padding: 10,
        ...style,
      }}
      aria-label={locale === "ja" ? "描画ツール" : "Drawing tools"}
    >
      {tools.filter((item) => item.visible).map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={tool === item.id}
          disabled={disabled}
          onClick={() => onToolChange(item.id)}
          style={toolbarButtonStyle(tool === item.id, disabled)}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled || !canUndo || !onUndo}
        onClick={onUndo}
        style={toolbarButtonStyle(false, disabled || !canUndo || !onUndo)}
      >
        ↶ {labels.undo}
      </button>
      <button
        type="button"
        disabled={disabled || !canRedo || !onRedo}
        onClick={onRedo}
        style={toolbarButtonStyle(false, disabled || !canRedo || !onRedo)}
      >
        ↷ {labels.redo}
      </button>
      <div
        role="group"
        aria-label={labels.color}
        style={{ display: "flex", alignItems: "center", gap: 5 }}
      >
        {colors.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-label={`${labels.color} ${candidate}`}
            aria-pressed={color.toLowerCase() === candidate.toLowerCase()}
            disabled={disabled}
            onClick={() => onColorChange(candidate)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border:
                color.toLowerCase() === candidate.toLowerCase()
                  ? "3px solid #0891b2"
                  : "2px solid white",
              background: candidate,
              boxShadow: "0 0 0 1px #94a3b8",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.45 : 1,
            }}
          />
        ))}
        <input
          type="color"
          value={color}
          aria-label={labels.color}
          disabled={disabled}
          onChange={(event) => onColorChange(event.currentTarget.value)}
          style={{ width: 34, height: 30 }}
        />
      </div>
      <label style={{ display: "grid", gap: 2, fontSize: 12, fontWeight: 700 }}>
        {labels.width}: {Math.round(width)}
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={width}
          disabled={disabled}
          onChange={(event) => onWidthChange(Number(event.currentTarget.value))}
        />
      </label>
      <label style={{ display: "grid", gap: 2, fontSize: 12, fontWeight: 700 }}>
        {labels.opacity}: {Math.round(opacity * 100)}%
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          disabled={disabled}
          onChange={(event) =>
            onOpacityChange(Number(event.currentTarget.value))}
        />
      </label>
      {features.zoom !== false && onZoomChange && (
        <div
          role="group"
          aria-label={locale === "ja" ? "拡大縮小" : "Zoom"}
          style={{ display: "flex", gap: 4 }}
        >
          <button
            type="button"
            aria-label={labels.zoomOut}
            disabled={disabled || zoom <= minimumZoom}
            onClick={() => setZoom(zoom - zoomStep)}
            style={toolbarButtonStyle(false, disabled || zoom <= minimumZoom)}
          >
            −
          </button>
          <button
            type="button"
            aria-label={labels.zoomReset}
            disabled={disabled}
            onClick={() => setZoom(1)}
            style={toolbarButtonStyle(false, disabled)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label={labels.zoomIn}
            disabled={disabled || zoom >= maximumZoom}
            onClick={() => setZoom(zoom + zoomStep)}
            style={toolbarButtonStyle(false, disabled || zoom >= maximumZoom)}
          >
            ＋
          </button>
        </div>
      )}
      {features.fullscreen !== false && onFullscreen && (
        <button
          type="button"
          disabled={disabled}
          onClick={onFullscreen}
          style={toolbarButtonStyle(false, disabled)}
        >
          ⛶ {labels.fullscreen}
        </button>
      )}
    </div>
  );
}

export function DrawingLayerPanel({
  layers,
  activeLayerId,
  hiddenLayerIds,
  locale = "ja",
  disabled = false,
  className = "",
  style,
  onActiveLayerChange,
  onLayerVisibilityChange,
}: DrawingLayerPanelProps) {
  const hidden = new Set(hiddenLayerIds ?? []);
  return (
    <ul
      className={className}
      style={{
        display: "grid",
        gap: 6,
        margin: 0,
        padding: 8,
        listStyle: "none",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        background: "#f8fafc",
        ...style,
      }}
      aria-label={locale === "ja" ? "レイヤー" : "Layers"}
    >
      {layers.map((layer) => {
        const visible = !hidden.has(layer.id);
        return (
          <li
            key={layer.id}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {onLayerVisibilityChange && (
              <input
                type="checkbox"
                checked={visible}
                disabled={disabled}
                aria-label={
                  locale === "ja"
                    ? `${layer.name}を表示`
                    : `Show ${layer.name}`
                }
                onChange={(event) =>
                  onLayerVisibilityChange(layer.id, event.currentTarget.checked)}
              />
            )}
            <button
              type="button"
              aria-pressed={activeLayerId === layer.id}
              disabled={disabled}
              onClick={() => onActiveLayerChange(layer.id)}
              style={{
                ...toolbarButtonStyle(activeLayerId === layer.id, disabled),
                flex: 1,
                textAlign: "left",
              }}
            >
              {layer.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
