"use client";

import { KotobaSenpukuDesktopLayout } from "./KotobaSenpukuDesktopLayout";
import { useKotobaSenpukuController } from "./use-kotoba-senpuku-controller";

export function KotobaSenpukuGame() {
  const controller = useKotobaSenpukuController();
  return <KotobaSenpukuDesktopLayout controller={controller} />;
}
