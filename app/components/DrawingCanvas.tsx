"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { floodFillPixels, hexToRgba, type DrawingPoint, type DrawingStroke } from "@/lib/drawing-canvas";

type Props = {
  strokes: DrawingStroke[];
  color: string;
  width: number;
  opacity: number;
  tool: "pen" | "eraser" | "eyedropper" | "fill";
  disabled?: boolean;
  keyboardCursor?: DrawingPoint;
  layerIds?: string[];
  activeLayerId?: string;
  onColorPick?: (color: string) => void;
  onPointerInteraction?: () => void;
  onStrokeProgress?: (stroke: DrawingStroke) => void;
  onStrokeComplete: (stroke: DrawingStroke) => void;
};

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke, canvasWidth: number, canvasHeight: number) {
  if (stroke.points.length === 0) return;
  if (stroke.tool === "fill") {
    const point = stroke.points[0];
    const image = context.getImageData(0, 0, canvasWidth, canvasHeight);
    floodFillPixels(image.data, canvasWidth, canvasHeight, point.x * canvasWidth, point.y * canvasHeight, hexToRgba(stroke.color, stroke.opacity));
    context.putImageData(image, 0, 0);
    return;
  }
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.globalAlpha = stroke.tool === "eraser" ? 1 : stroke.opacity;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  const first = stroke.points[0];
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(first.x * canvasWidth, first.y * canvasHeight, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(first.x * canvasWidth, first.y * canvasHeight);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    context.stroke();
  }
  context.restore();
}

export function DrawingCanvas({ strokes, color, width, opacity, tool, disabled = false, keyboardCursor, layerIds = ["base"], activeLayerId = "base", onColorPick, onPointerInteraction, onStrokeProgress, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);
  const lastProgressAtRef = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const layerId of layerIds) {
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = canvas.width; layerCanvas.height = canvas.height;
      const layerContext = layerCanvas.getContext("2d");
      if (!layerContext) continue;
      for (const stroke of strokes) if ((stroke.layerId || "base") === layerId) drawStroke(layerContext, stroke, canvas.width, canvas.height);
      if (activeStrokeRef.current && (activeStrokeRef.current.layerId || "base") === layerId) drawStroke(layerContext, activeStrokeRef.current, canvas.width, canvas.height);
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
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      redrawRef.current();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => redraw(), [redraw]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || event.button > 0) return;
    onPointerInteraction?.();
    const point = pointFromEvent(event);
    if (tool === "eyedropper") {
      const context = canvasRef.current?.getContext("2d");
      if (context) {
        const pixel = context.getImageData(Math.floor(point.x * context.canvas.width), Math.floor(point.y * context.canvas.height), 1, 1).data;
        onColorPick?.(pixel[3] === 0 ? "#ffffff" : `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
      }
      return;
    }
    if (tool === "fill") {
      onStrokeComplete({ id: crypto.randomUUID(), color, width, opacity, tool: "fill", points: [point] });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = { id: crypto.randomUUID(), layerId: activeLayerId, color, width, opacity, tool, points: [point] };
    lastProgressAtRef.current = 0;
    redraw();
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    stroke.points.push(pointFromEvent(event));
    const now = performance.now();
    if (onStrokeProgress && now - lastProgressAtRef.current >= 400) { lastProgressAtRef.current = now; onStrokeProgress({ ...stroke, points: [...stroke.points] }); }
    redraw();
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeStrokeRef.current = null;
    onStrokeComplete(stroke);
  };

  return <div className="relative h-full w-full overflow-hidden">
    <canvas ref={canvasRef} className={`h-full w-full touch-none bg-white ${disabled ? "cursor-not-allowed opacity-70" : tool === "eraser" || tool === "eyedropper" ? "cursor-cell" : "cursor-crosshair"}`} aria-label="お絵描きキャンバス" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
    {keyboardCursor && <span className="pointer-events-none absolute z-10 block -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-500 bg-white/40 shadow-[0_0_0_1px_white]" style={{ left: `${keyboardCursor.x * 100}%`, top: `${keyboardCursor.y * 100}%`, width: Math.max(10, width), height: Math.max(10, width) }} aria-hidden="true" />}
  </div>;
}
