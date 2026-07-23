"use client";

import { DaifugoDesktopLayout } from "./DaifugoDesktopLayout";
import { useDaifugoController } from "./use-daifugo-controller";

export function DaifugoGame() {
  const controller = useDaifugoController();
  return <DaifugoDesktopLayout controller={controller} />;
}
