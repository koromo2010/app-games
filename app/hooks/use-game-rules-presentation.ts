"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getBuiltInGameRules } from "@/lib/game-rules";

function isFirstVisit(gameId: string) {
  const ruleSet = getBuiltInGameRules(gameId);
  if (!ruleSet) return false;
  try {
    const key = `game-fields:rules:${ruleSet.gameId}:${ruleSet.revision}`;
    return window.localStorage.getItem(key) !== "seen";
  } catch {
    return false;
  }
}

/**
 * Opens the non-blocking rule dialog on a first visit only. It stores no
 * acknowledgement/audit event and never participates in a Room command.
 */
export function useBuiltInGameRulesPresentation(gameId: string) {
  const firstVisit = useSyncExternalStore(
    () => () => {},
    () => isFirstVisit(gameId),
    () => false,
  );
  useEffect(() => {
    if (!firstVisit) return;
    const ruleSet = getBuiltInGameRules(gameId);
    if (!ruleSet) return;
    try {
      window.localStorage.setItem(`game-fields:rules:${ruleSet.gameId}:${ruleSet.revision}`, "seen");
    } catch { /* Presentation remains usable without storage. */ }
  }, [firstVisit, gameId]);
  const [closed, setClosed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const rulesOpen = (firstVisit && !closed) || manualOpen;
  const setRulesOpen = (open: boolean) => {
    if (open) {
      setManualOpen(true);
    } else {
      setClosed(true);
      setManualOpen(false);
    }
  };
  return [rulesOpen, setRulesOpen] as const;
}
