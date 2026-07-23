"use client";

import { NigoichiDesktopLayout } from "./NigoichiDesktopLayout";
import { useNigoichiController } from "./use-nigoichi-controller";

export function NigoichiGame() {
  const controller = useNigoichiController();
  return <NigoichiDesktopLayout controller={controller} />;
}
