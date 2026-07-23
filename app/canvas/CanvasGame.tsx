"use client";

import { CanvasDesktopLayout } from "./CanvasDesktopLayout";
import { useCanvasController } from "./use-canvas-controller";

export function CanvasGame() {
  const controller = useCanvasController();
  return <CanvasDesktopLayout controller={controller} />;
}
