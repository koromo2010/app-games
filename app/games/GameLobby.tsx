"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PlayerStatsGameFilter } from "@/lib/player-stats-store";
import type { GameDurationEstimate, GameDurationGameId } from "@/lib/game-duration-statistics";
import { GameAdSlot } from "../components/GameAdSlot";
import { FullScreenPageOverlay } from "../components/FullScreenPageOverlay";
import { gamesForLocale } from "./game-catalog";
import { gameOperationFor, type GameOperation } from "@/lib/game-operations";
import { LobbyGameGrid } from "./LobbyGameGrid";
import { LobbyStatsPanel } from "./LobbyStatsPanel";

import { LobbyAccountPanel, type LobbyAuthMode } from "./LobbyAccountPanel";
import { useLobbyAvatarActions } from "./use-lobby-avatar-actions";
import { useLobbyAuthActions } from "./use-lobby-auth-actions";
import { useLobbyRoomData } from "./use-lobby-room-data";
import { useLobbyPrivateAccess } from "./use-lobby-private-access";
import { LobbyResumePanel } from "./LobbyResumePanel";
import { useLobbySession } from "./use-lobby-session";
import { LobbyHeader } from "./LobbyHeader";
import { LobbyInfoDrawer } from "./LobbyInfoDrawer";
import { LobbyPrivateAccessControl } from "./LobbyPrivateAccessControl";
import { useAppLocale } from "@/app/components/AppLocaleProvider";


export function GameLobby({ siteName = "GAME FIELDS", gameOperations, durationEstimates = {} }: { siteName?: string; gameOperations: GameOperation[]; durationEstimates?: Partial<Record<GameDurationGameId, GameDurationEstimate>> }) {
  const { locale, t } = useAppLocale();
  const sdkLoginRequired = useSearchParams().get("sdkLoginRequired") === "1";
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [message, setMessage] = useState(sdkLoginRequired ? "SDKへ接続するため、Game Fieldsアカウントへログインしてください。ログイン後は自動的にSDKへ戻ります。" : "");
  const [authMode, setAuthMode] = useState<LobbyAuthMode>("login");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(sdkLoginRequired);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const { name, setName, playerId, avatarColor, setAvatarColor, avatarImage, setAvatarImage, isLoggedIn,
    hasRecoveryEmail, applySession, logout } = useLobbySession(setMessage);
  const { accessKey: privateAccessKey, setAccessKey: setPrivateAccessKey, isUnlocked: privateUnlocked,
    isUpdating: isPrivateAccessUpdating, clearAccess: clearPrivateAccess } = useLobbyPrivateAccess(setMessage);
  const { stats, isStatsLoading, selectedStatsGame, activeRoom, activeGameRooms, isActiveRoomLoading,
    loadStats, changeStatsGame, rememberActiveRoom, clearRoomData } = useLobbyRoomData(playerId, isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn || !playerId || stats || isStatsLoading) return;
    if (!isMobileInfoOpen && !window.matchMedia("(min-width: 1024px)").matches) return;
    const timer = window.setTimeout(() => void loadStats(playerId, "all"), 250);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, isMobileInfoOpen, isStatsLoading, loadStats, playerId, stats]);

  const { isSaving, isRequestingReset, submitAccount, requestPasswordReset } = useLobbyAuthActions({
    name, password, email, resetEmail, authMode, legalAccepted, avatarColor, avatarImage,
    applySession, setMessage, setPassword, setEmail, setResetEmail, setShowPasswordReset,
    onAuthenticated: () => {
      const candidate = new URLSearchParams(window.location.search).get("sdkReturn");
      if (!candidate) return;
      try {
        const target = new URL(candidate);
        if (target.origin === window.location.origin && target.pathname === "/api/sdk-account-link") window.location.assign(target);
      } catch { /* Invalid return URL is ignored. */ }
    },
  });
  const { isAvatarSaving, isAvatarDragging, setIsAvatarDragging, updateAvatar, uploadAvatar, dropAvatar } = useLobbyAvatarActions({
    name, playerId, avatarColor, hasRecoveryEmail, setAvatarColor, setAvatarImage, setMessage,
  });
  const localizedGames = gamesForLocale(locale);
  const statsGameOptions = [
    { value: "all" as const, label: t("stats.allGames") },
    ...localizedGames.filter((game) => game.stats === "account").map((game) => ({ value: game.id as PlayerStatsGameFilter, label: game.title })),
  ];
  const gamesWithDurationEstimates = localizedGames.map((game) => {
    const estimate = durationEstimates[game.id as GameDurationGameId];
    return estimate ? { ...game, time: estimate.label, timeSampleCount: estimate.sampleCount } : game;
  });
  const visibleGames = gamesWithDurationEstimates.filter((game) => {
    const operation = gameOperationFor(gameOperations, game.id);
    return operation.publication !== "hidden" && (operation.publication === "public" || privateUnlocked);
  });
  const orderedGames = [...visibleGames].sort((left, right) =>
    Number(Boolean(activeGameRooms[right.id])) - Number(Boolean(activeGameRooms[left.id])),
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <LobbyHeader siteName={siteName} name={name} avatarColor={avatarColor} avatarImage={avatarImage} isLoggedIn={isLoggedIn}
        isInfoOpen={isMobileInfoOpen} isAvatarSaving={isAvatarSaving} isAvatarDragging={isAvatarDragging}
        onOpenInfo={() => setIsMobileInfoOpen(true)} onOpenMyPage={() => setIsMyPageOpen(true)}
        onColorChange={(color) => void updateAvatar(color, avatarImage)} onImageChange={(image) => void updateAvatar(avatarColor, image)}
        onFile={(file) => void uploadAvatar(file)} onDrop={dropAvatar} onDraggingChange={setIsAvatarDragging}
      />

      <GameAdSlot gameId="game-fields" surface="catalog" />

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <LobbyInfoDrawer isLoggedIn={isLoggedIn} isOpen={isMobileInfoOpen} onOpen={() => setIsMobileInfoOpen(true)} onClose={() => setIsMobileInfoOpen(false)}>
          <LobbyAccountPanel name={name} password={password} email={email} resetEmail={resetEmail}
            authMode={authMode} isLoggedIn={isLoggedIn} legalAccepted={legalAccepted} showPasswordReset={showPasswordReset}
            isSaving={isSaving} isRequestingReset={isRequestingReset} message={message}
            onNameChange={setName} onPasswordChange={setPassword} onEmailChange={setEmail} onResetEmailChange={setResetEmail}
            onAuthModeChange={setAuthMode} onLegalAcceptedChange={setLegalAccepted}
            onPasswordResetVisibilityChange={setShowPasswordReset} onClearMessage={() => setMessage("")}
            onSubmit={() => void submitAccount()} onRequestReset={() => void requestPasswordReset()} onLogout={() => void logout(() => {
              setPassword(""); setEmail(""); setResetEmail(""); setShowPasswordReset(false);
              setIsMobileInfoOpen(false); clearRoomData();
            })}
          />

          {isLoggedIn && <LobbyResumePanel room={activeRoom} isLoading={isActiveRoomLoading} onResume={rememberActiveRoom} />}

          {isLoggedIn && <LobbyStatsPanel stats={stats} options={statsGameOptions} selectedGame={selectedStatsGame} isLoading={isStatsLoading}
            onGameChange={changeStatsGame} onRefresh={() => void loadStats(playerId, selectedStatsGame)}
          />}
        </LobbyInfoDrawer>

        <LobbyGameGrid games={orderedGames} operations={gameOperations} activeRooms={activeGameRooms} isLoggedIn={isLoggedIn}
          locale={locale} onLoginRequired={() => setMessage(t("account.loginRequired"))}
          onRememberWordWolf={rememberActiveRoom}
        />
      </section>
      <LobbyPrivateAccessControl accessKey={privateAccessKey} isUnlocked={privateUnlocked} isUpdating={isPrivateAccessUpdating}
        onAccessKeyChange={setPrivateAccessKey} onClear={() => void clearPrivateAccess()} />
      <FullScreenPageOverlay open={isMyPageOpen} href="/users/me" title={t("site.myPage")} keepAlive onClose={() => setIsMyPageOpen(false)} />
    </main>
  );
}
