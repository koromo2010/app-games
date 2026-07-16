"use client";

import { useEffect, useState } from "react";
import {
  clearPlayerSession,
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  makeRandomAvatarColor,
  markPlayerAuthenticated,
  pickRandomDefaultAvatarImage,
  savePlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

export function useLobbySession(setMessage: (message: string) => void) {
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(defaultAvatarImage);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasRecoveryEmail, setHasRecoveryEmail] = useState(false);

  useEffect(() => {
    let isMounted = true;
    loadPersistentPlayerSession().then((session) => {
      if (!isMounted) return;
      if (!session) {
        setAvatarColor(makeRandomAvatarColor());
        setAvatarImage(pickRandomDefaultAvatarImage());
        return;
      }
      setName(session.name);
      setPlayerId(session.id ?? "");
      setAvatarColor(session.avatarColor);
      setAvatarImage(session.avatarImage || defaultAvatarImage);
      setHasRecoveryEmail(session.hasRecoveryEmail === true);
      setIsLoggedIn(Boolean(session.id) && isPlayerAuthenticated());
    }).catch(() => undefined);
    return () => { isMounted = false; };
  }, []);

  const applySession = (session: PlayerSession) => {
    savePlayerSession(session);
    markPlayerAuthenticated();
    setName(session.name);
    setPlayerId(session.id ?? "");
    setAvatarColor(session.avatarColor);
    setAvatarImage(session.avatarImage || defaultAvatarImage);
    setHasRecoveryEmail(session.hasRecoveryEmail === true);
    setIsLoggedIn(true);
  };

  const logout = async (onLogout: () => void) => {
    try {
      const response = await fetch("/api/player-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "logout" }) });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
    } catch {
      setMessage("ログアウト通信に失敗しました。通信を確認してもう一度お試しください。");
      return;
    }
    clearPlayerSession();
    localStorage.removeItem("wordwolf-last-room");
    localStorage.removeItem("wordwolf-last-player");
    setName("");
    setPlayerId("");
    setHasRecoveryEmail(false);
    setAvatarColor(makeRandomAvatarColor());
    setAvatarImage(pickRandomDefaultAvatarImage());
    setIsLoggedIn(false);
    onLogout();
    setMessage("ログアウトしました。");
  };

  return { name, setName, playerId, avatarColor, setAvatarColor, avatarImage, setAvatarImage, isLoggedIn, hasRecoveryEmail, applySession, logout };
}
