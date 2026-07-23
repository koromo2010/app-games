"use client";

import { NorthernBranchDesktopLayout } from "./NorthernBranchDesktopLayout";
import { useNorthernBranchController } from "./use-northern-branch-controller";

export function NorthernBranchGame() {
  const controller = useNorthernBranchController();
  return <NorthernBranchDesktopLayout controller={controller} />;
}
