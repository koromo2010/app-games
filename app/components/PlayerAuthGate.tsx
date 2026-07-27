"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LobbyAccountPanel, type LobbyAuthMode } from "@/app/games/LobbyAccountPanel";
import { useLobbyAuthActions } from "@/app/games/use-lobby-auth-actions";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  markPlayerAuthenticated,
  savePlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

export function PlayerAuthGate({
  onAuthenticated,
  title,
}: {
  onAuthenticated?: () => void;
  title: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [authMode, setAuthMode] = useState<LobbyAuthMode>("login");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [message, setMessage] = useState(
    "このゲームを遊ぶにはログインが必要です。",
  );
  const applySession = (session: PlayerSession) => {
    savePlayerSession(session);
    markPlayerAuthenticated();
  };
  const { isSaving, isRequestingReset, submitAccount, requestPasswordReset } =
    useLobbyAuthActions({
      name,
      password,
      email,
      resetEmail,
      authMode,
      legalAccepted,
      avatarColor: fallbackAvatarColor,
      avatarImage: defaultAvatarImage,
      applySession,
      setMessage,
      setPassword,
      setEmail,
      setResetEmail,
      setShowPasswordReset,
      onAuthenticated: () => {
        onAuthenticated?.();
        router.refresh();
      },
    });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md" data-player-auth-gate>
        <div className="mb-4 text-center">
          <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
            GAME FIELDS
          </p>
          <h1 className="mt-2 text-2xl font-black">{title}</h1>
          <p className="mt-2 text-sm text-slate-300">
            ログインすると、このままゲームラウンジを開きます。
          </p>
        </div>
        <LobbyAccountPanel
          name={name}
          password={password}
          email={email}
          resetEmail={resetEmail}
          authMode={authMode}
          isLoggedIn={false}
          legalAccepted={legalAccepted}
          showPasswordReset={showPasswordReset}
          isSaving={isSaving}
          isRequestingReset={isRequestingReset}
          message={message}
          onNameChange={setName}
          onPasswordChange={setPassword}
          onEmailChange={setEmail}
          onResetEmailChange={setResetEmail}
          onAuthModeChange={setAuthMode}
          onLegalAcceptedChange={setLegalAccepted}
          onPasswordResetVisibilityChange={setShowPasswordReset}
          onClearMessage={() => setMessage("")}
          onSubmit={() => void submitAccount()}
          onRequestReset={() => void requestPasswordReset()}
          onLogout={() => undefined}
        />
      </section>
    </main>
  );
}
