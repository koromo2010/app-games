"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import type { DrawingPoint, DrawingStroke } from "@/lib/drawing-canvas";

type Props = {
  strokes: DrawingStroke[];
  color: string;
  width: number;
  tool: "pen" | "eraser";
  disabled?: boolean;
  onStrokeComplete: (stroke: DrawingStroke) => void;
};

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke, canvasWidth: number, canvasHeight: number) {
  if (stroke.points.length === 0) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
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

export function DrawingCanvas({ strokes, color, width, tool, disabled = false, onStrokeComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) drawStroke(context, stroke, canvas.width, canvas.height);
    if (activeStrokeRef.current) drawStroke(context, activeStrokeRef.current, canvas.width, canvas.height);
  }, [strokes]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = { id: crypto.randomUUID(), color, width, tool, points: [pointFromEvent(event)] };
    redraw();
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    stroke.points.push(pointFromEvent(event));
    redraw();
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeStrokeRef.current = null;
    onStrokeComplete(stroke);
  };

  return <canvas ref={canvasRef} className={`h-full w-full touch-none bg-white ${disabled ? "cursor-not-allowed opacity-70" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`} aria-label="お絵描きキャンバス" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />;
}
