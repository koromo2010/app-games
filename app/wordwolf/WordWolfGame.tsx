"use client";

import { WordWolfDesktopLayout } from "./WordWolfDesktopLayout";
import { useWordWolfController } from "./use-wordwolf-controller";

export function WordWolfGame() {
  const controller = useWordWolfController();
  return <WordWolfDesktopLayout controller={controller} />;
}
