"use client";

import { CodeInterceptDesktopLayout } from "./CodeInterceptDesktopLayout";
import { useCodeInterceptController } from "./use-code-intercept-controller";

export function CodeInterceptGame() {
  const controller = useCodeInterceptController();
  return <CodeInterceptDesktopLayout controller={controller} />;
}
