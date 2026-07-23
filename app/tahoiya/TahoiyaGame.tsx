"use client";

import { TahoiyaDesktopLayout } from "./TahoiyaDesktopLayout";
import { useTahoiyaController } from "./use-tahoiya-controller";

export function TahoiyaGame() {
  const controller = useTahoiyaController();
  return <TahoiyaDesktopLayout controller={controller} />;
}
