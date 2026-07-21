"use client";

import { HodoaiDesktopLayout } from "./HodoaiDesktopLayout";
import { useHodoaiController } from "./use-hodoai-controller";

export function HodoaiTalkGame() {
  const controller = useHodoaiController();
  return <HodoaiDesktopLayout controller={controller} />;
}
