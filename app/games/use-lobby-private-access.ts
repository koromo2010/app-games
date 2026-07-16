"use client";

import { useEffect, useState } from "react";

export function useLobbyPrivateAccess(setMessage: (message: string) => void) {
  const [accessKey, setAccessKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetch("/api/private-game-access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { unlocked?: boolean }) => setIsUnlocked(data.unlocked === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isUnlocked || accessKey.length < 8) return;
    const timer = window.setTimeout(() => {
      fetch("/api/private-game-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: accessKey }),
      })
        .then((response) => response.json())
        .then((data: { unlocked?: boolean }) => {
          if (!data.unlocked) return;
          setIsUnlocked(true);
          setAccessKey("");
        })
        .catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [accessKey, isUnlocked]);

  const clearAccess = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const response = await fetch("/api/private-game-access", { method: "DELETE" });
      if (!response.ok) throw new Error("PRIVATE_ACCESS_CLEAR_FAILED");
      setIsUnlocked(false);
      setAccessKey("");
      setMessage("Privateゲームの表示を解除しました。");
    } catch {
      setMessage("Privateゲームの表示を解除できませんでした。");
    } finally {
      setIsUpdating(false);
    }
  };

  return { accessKey, setAccessKey, isUnlocked, isUpdating, clearAccess };
}
