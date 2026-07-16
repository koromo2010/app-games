"use client";

import { useEffect, useState } from "react";
import type { PlayerStatsGameFilter } from "@/lib/player-stats-store";
import { GameAdSlot } from "../components/GameAdSlot";
import { FullScreenPageOverlay } from "../components/FullScreenPageOverlay";
import { games } from "./game-catalog";
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


const statsGameOptions = [
  { value: "all", label: "全ゲーム" },
  ...games
    .filter((game) => game.stats === "account")
    .map((game) => ({ value: game.id as PlayerStatsGameFilter, label: game.title })),
] as const satisfies readonly { value: PlayerStatsGameFilter; label: string }[];

export function GameLobby({ siteName = "GAME FIELDS", gameOperations }: { siteName?: string; gameOperations: GameOperation[] }) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [updateEmailPassword, setUpdateEmailPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<LobbyAuthMode>("login");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const { name, setName, playerId, avatarColor, setAvatarColor, avatarImage, setAvatarImage, isLoggedIn,
    hasRecoveryEmail, applySession, logout } = useLobbySession(setMessage);
  const { accessKey: privateAccessKey, setAccessKey: setPrivateAccessKey, isUnlocked: privateUnlocked,
    isUpdating: isPrivateAccessUpdating, clearAccess: clearPrivateAccess } = useLobbyPrivateAccess(setMessage);
  const { stats, isStatsLoading, selectedStatsGame, activeRoom, activeGameRooms, isActiveRoomLoading,
    loadStats, loadActiveRoom, changeStatsGame, rememberActiveRoom, clearRoomData } = useLobbyRoomData(playerId, isLoggedIn, privateUnlocked, gameOperations);
  useEffect(() => {
    if (!isLoggedIn || !playerId) return;
    void loadStats(playerId, "all");
    void loadActiveRoom(playerId);
  }, [isLoggedIn, loadActiveRoom, loadStats, playerId]);

  const { isSaving, isRequestingReset, isUpdatingEmail, submitAccount, requestPasswordReset, updateRecoveryEmail } = useLobbyAuthActions({
    name, password, email, resetEmail, updateEmailPassword, authMode, legalAccepted, avatarColor, avatarImage,
    applySession, setMessage, setPassword, setEmail, setResetEmail, setUpdateEmailPassword, setShowPasswordReset,
  });
  const { isAvatarSaving, isAvatarDragging, setIsAvatarDragging, updateAvatar, uploadAvatar, dropAvatar } = useLobbyAvatarActions({
    name, playerId, avatarColor, hasRecoveryEmail, setAvatarColor, setAvatarImage, setMessage,
  });
  const visibleGames = games.filter((game) => {
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
          <LobbyAccountPanel name={name} password={password} email={email} resetEmail={resetEmail} updateEmailPassword={updateEmailPassword}
            authMode={authMode} isLoggedIn={isLoggedIn} legalAccepted={legalAccepted} showPasswordReset={showPasswordReset} hasRecoveryEmail={hasRecoveryEmail}
            isSaving={isSaving} isRequestingReset={isRequestingReset} isUpdatingEmail={isUpdatingEmail} message={message}
            onNameChange={setName} onPasswordChange={setPassword} onEmailChange={setEmail} onResetEmailChange={setResetEmail}
            onUpdateEmailPasswordChange={setUpdateEmailPassword} onAuthModeChange={setAuthMode} onLegalAcceptedChange={setLegalAccepted}
            onPasswordResetVisibilityChange={setShowPasswordReset} onClearMessage={() => setMessage("")}
            onSubmit={() => void submitAccount()} onRequestReset={() => void requestPasswordReset()} onUpdateEmail={() => void updateRecoveryEmail()} onLogout={() => void logout(() => {
              setPassword(""); setEmail(""); setResetEmail(""); setUpdateEmailPassword(""); setShowPasswordReset(false);
              setIsMobileInfoOpen(false); clearRoomData();
            })}
          />

          {isLoggedIn && <LobbyResumePanel room={activeRoom} isLoading={isActiveRoomLoading} onResume={rememberActiveRoom} />}

          {isLoggedIn && <LobbyStatsPanel stats={stats} options={statsGameOptions} selectedGame={selectedStatsGame} isLoading={isStatsLoading}
            onGameChange={changeStatsGame} onRefresh={() => void loadStats(playerId, selectedStatsGame)}
          />}
        </LobbyInfoDrawer>

        <LobbyGameGrid games={orderedGames} operations={gameOperations} activeRooms={activeGameRooms} isLoggedIn={isLoggedIn}
          onLoginRequired={() => setMessage("先にプレイヤーアカウントでログインしてください。")}
          onRememberWordWolf={rememberActiveRoom}
        />
      </section>
      <LobbyPrivateAccessControl accessKey={privateAccessKey} isUnlocked={privateUnlocked} isUpdating={isPrivateAccessUpdating}
        onAccessKeyChange={setPrivateAccessKey} onClear={() => void clearPrivateAccess()} />
      <FullScreenPageOverlay open={isMyPageOpen} href="/users/me" title="マイページ" onClose={() => setIsMyPageOpen(false)} />
    </main>
  );
}
