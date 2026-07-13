"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  avatarColorOptions,
  clearPlayerSession,
  defaultAvatarImage,
  defaultAvatarImages,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  makeRandomAvatarColor,
  markPlayerAuthenticated,
  pickRandomDefaultAvatarImage,
  loadPersistentPlayerSession,
  savePersistentPlayerSession,
  savePlayerSession,
  type PlayerSession,
} from "@/lib/player-session";
import type { PlayerStatsGameFilter, PlayerStatsResponse } from "@/lib/player-stats-store";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { games } from "./game-catalog";

type AuthMode = "login" | "register";

type ActiveWordWolfRoom = {
  code: string;
  phase: "lobby" | "clue" | "vote" | "wolfGuess" | "result";
  players: { id: string; name: string }[];
  updatedAt: number;
};

const statsGameOptions = [
  { value: "all", label: "全ゲーム" },
  ...games
    .filter((game) => game.stats === "account")
    .map((game) => ({ value: game.id as PlayerStatsGameFilter, label: game.title })),
] as const satisfies readonly { value: PlayerStatsGameFilter; label: string }[];

const errorMessages: Record<string, string> = {
  INVALID_JSON: "入力内容を読み取れませんでした。",
  STORE_NOT_CONFIGURED: "プレイヤー保存用ストレージが未設定です。",
  NAME_REQUIRED: "プレイヤー名を入力してください。",
  PASSWORD_INVALID: "パスワードは4文字以上128文字以内で入力してください。",
  ALREADY_EXISTS: "そのプレイヤー名はすでに使われています。",
  EMAIL_INVALID: "メールアドレスの形式を確認してください。",
  EMAIL_ALREADY_EXISTS: "そのメールアドレスは別のアカウントで使われています。",
  INVALID_CREDENTIALS: "プレイヤー名またはパスワードが違います。",
  UNKNOWN: "アカウント処理に失敗しました。",
  AUTH_NOT_CONFIGURED: "ログイン認証用のサーバー設定が未完了です。",
};

function authMessage(code: unknown) {
  return typeof code === "string" ? errorMessages[code] ?? errorMessages.UNKNOWN : errorMessages.UNKNOWN;
}

function statItems(stats: PlayerStatsResponse | null) {
  return [
    ["当日", stats?.today],
    ["月間", stats?.month],
    ["通算", stats?.total],
  ] as const;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function activeRoomPhaseLabel(phase: ActiveWordWolfRoom["phase"]) {
  if (phase === "lobby") return "待機中";
  if (phase === "clue") return "発言中";
  if (phase === "vote") return "投票中";
  if (phase === "wolfGuess") return "逆転回答";
  return "結果表示";
}

export function GameLobby() {
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [updateEmailPassword, setUpdateEmailPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(defaultAvatarImage);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasRecoveryEmail, setHasRecoveryEmail] = useState(false);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [selectedStatsGame, setSelectedStatsGame] = useState<PlayerStatsGameFilter>("all");
  const [activeRoom, setActiveRoom] = useState<ActiveWordWolfRoom | null>(null);
  const [isActiveRoomLoading, setIsActiveRoomLoading] = useState(false);
  const [privateAccessKey, setPrivateAccessKey] = useState("");
  const [privateUnlocked, setPrivateUnlocked] = useState(false);
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);

  const loadStats = useCallback(async (targetPlayerId: string, gameFilter: PlayerStatsGameFilter) => {
    if (!targetPlayerId) return;

    setIsStatsLoading(true);
    try {
      const params = new URLSearchParams({
        playerId: targetPlayerId,
        gameType: gameFilter,
      });
      const response = await fetch(`/api/player-stats?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { stats?: PlayerStatsResponse };
      setStats(response.ok && data.stats ? data.stats : null);
    } catch {
      setStats(null);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  const loadActiveRoom = useCallback(async (targetPlayerId: string) => {
    if (!targetPlayerId) return;

    setIsActiveRoomLoading(true);
    try {
      const response = await fetch(`/api/wordwolf/rooms?playerId=${encodeURIComponent(targetPlayerId)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { room?: ActiveWordWolfRoom | null };
      setActiveRoom(response.ok && data.room ? data.room : null);
    } catch {
      setActiveRoom(null);
    } finally {
      setIsActiveRoomLoading(false);
    }
  }, []);

  const rememberActiveRoom = () => {
    if (!activeRoom || !playerId) return;

    localStorage.setItem("wordwolf-last-room", activeRoom.code);
    localStorage.setItem("wordwolf-last-player", playerId);
  };

  const changeStatsGame = (gameFilter: PlayerStatsGameFilter) => {
    setSelectedStatsGame(gameFilter);
    if (playerId) {
      void loadStats(playerId, gameFilter);
    }
  };

  useEffect(() => {
    let isMounted = true;

    loadPersistentPlayerSession()
      .then((session) => {
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
        const authenticated = Boolean(session.id) && isPlayerAuthenticated();
        setIsLoggedIn(authenticated);
        if (authenticated && session.id) {
          void loadStats(session.id, "all");
          void loadActiveRoom(session.id);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [loadActiveRoom, loadStats]);

  useEffect(() => {
    fetch("/api/private-game-access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { unlocked?: boolean }) => setPrivateUnlocked(data.unlocked === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (privateUnlocked || privateAccessKey.length < 8) return;
    const timer = window.setTimeout(() => {
      fetch("/api/private-game-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: privateAccessKey }),
      })
        .then((response) => response.json())
        .then((data: { unlocked?: boolean }) => {
          if (data.unlocked) {
            setPrivateUnlocked(true);
            setPrivateAccessKey("");
          }
        })
        .catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [privateAccessKey, privateUnlocked]);

  const applySession = (session: PlayerSession) => {
    savePlayerSession(session);
    markPlayerAuthenticated();
    setName(session.name);
    setPlayerId(session.id ?? "");
    setAvatarColor(session.avatarColor);
    setAvatarImage(session.avatarImage || defaultAvatarImage);
    setEmail("");
    setUpdateEmailPassword("");
    setHasRecoveryEmail(session.hasRecoveryEmail === true);
    setPassword("");
    setIsLoggedIn(true);
    if (session.id) {
      void loadStats(session.id, selectedStatsGame);
      void loadActiveRoom(session.id);
    }
  };

  const submitAccount = async () => {
    const trimmedName = name.trim();
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: authMode,
          name: trimmedName,
          password,
          email: authMode === "register" ? email : undefined,
          avatarColor,
          avatarImage,
        }),
      });
      const data = (await response.json()) as { session?: PlayerSession; error?: string };

      if (!response.ok || !data.session) {
        setMessage(authMessage(data.error));
        return;
      }

      applySession(data.session);
      setMessage(authMode === "register" ? "アカウントを作成してログインしました。" : "ログインしました。");
    } catch {
      setMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const requestPasswordReset = async () => {
    setIsRequestingReset(true);
    setMessage("");
    try {
      const response = await fetch("/api/player-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email: resetEmail }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error === "EMAIL_NOT_CONFIGURED"
          ? "メール送信機能がまだ設定されていません。管理者に連絡してください。"
          : "再設定メールの送信処理に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      setMessage("登録済みのメールアドレスであれば、再設定用メールを送信しました。");
      setShowPasswordReset(false);
      setResetEmail("");
    } catch {
      setMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsRequestingReset(false);
    }
  };

  const updateRecoveryEmail = async () => {
    setIsUpdatingEmail(true);
    setMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "update-email",
          name,
          password: updateEmailPassword,
          email,
        }),
      });
      const data = (await response.json()) as { session?: PlayerSession; error?: string };
      if (!response.ok || !data.session) {
        setMessage(authMessage(data.error));
        return;
      }
      applySession(data.session);
      setMessage("復旧用メールアドレスを登録しました。");
    } catch {
      setMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const updateAvatar = async (nextColor: string, nextImage: string | null) => {
    if (!name.trim() || isAvatarSaving) return;
    setAvatarColor(nextColor);
    setAvatarImage(nextImage || defaultAvatarImage);
    setIsAvatarSaving(true);
    try {
      const result = await savePersistentPlayerSession({
        id: playerId || undefined,
        name: name.trim(),
        avatarColor: nextColor,
        avatarImage: nextImage || defaultAvatarImage,
        hasRecoveryEmail,
      });
      setAvatarColor(result.session.avatarColor);
      setAvatarImage(result.session.avatarImage || defaultAvatarImage);
      if (!result.persistent) setMessage("アイコンを端末には保存しましたが、サーバーへ保存できませんでした。");
    } catch {
      setMessage("アイコンを保存できませんでした。");
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const uploadAvatar = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 150 * 1024) {
      setMessage("アイコン画像は150KB以下の画像を選んでください。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void updateAvatar(avatarColor, reader.result);
    };
    reader.onerror = () => setMessage("アイコン画像を読み込めませんでした。");
    reader.readAsDataURL(file);
  };

  const logout = async () => {
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "logout" }),
      });
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
    setPassword("");
    setEmail("");
    setResetEmail("");
    setUpdateEmailPassword("");
    setShowPasswordReset(false);
    setHasRecoveryEmail(false);
    setAvatarColor(makeRandomAvatarColor());
    setAvatarImage(pickRandomDefaultAvatarImage());
    setIsLoggedIn(false);
    setIsMobileInfoOpen(false);
    setStats(null);
    setActiveRoom(null);
    setMessage("ログアウトしました。");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-xs font-semibold uppercase text-cyan-200">Game shelf</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-normal sm:text-4xl">ゲームロビー</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                プレイヤーアカウントでログインして、遊ぶゲームを選びます。
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isLoggedIn && (
                <button
                  type="button"
                  aria-expanded={isMobileInfoOpen}
                  aria-controls="lobby-account-panel"
                  onClick={() => setIsMobileInfoOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:border-cyan-200/60 hover:bg-white/20 lg:hidden"
                >
                  <span aria-hidden="true">☰</span>
                  情報
                </button>
              )}
              <PaidLlmAccessButton />
              {isLoggedIn ? (
                <details className="group relative">
                  <summary
                    aria-label={`${name}のアカウントメニューを開く`}
                    className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition hover:border-cyan-200/60 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 [&::-webkit-details-marker]:hidden"
                  >
                    <span
                      className="h-8 w-8 rounded-full border border-white/60 bg-cover bg-center"
                      style={{
                        backgroundColor: avatarColor,
                        backgroundImage: `url(${avatarImage || defaultAvatarImage})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="max-w-[160px] truncate text-sm font-semibold text-cyan-50">{name}</span>
                    <span className="text-xs text-slate-300 transition group-open:rotate-180" aria-hidden="true">▼</span>
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-xl">
                    <p className="truncate px-2 py-1 text-xs font-semibold text-slate-500">{name}でログイン中</p>
                    <div className="mt-2 border-t border-slate-200 pt-3">
                      <p className="text-xs font-bold text-slate-700">アイコンの色</p>
                      <div className="mt-2 grid grid-cols-8 gap-1.5">
                        {avatarColorOptions.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`アイコン色 ${color}`}
                            aria-pressed={avatarColor === color}
                            disabled={isAvatarSaving}
                            onClick={() => void updateAvatar(color, avatarImage)}
                            className={`h-7 w-7 rounded-full border-2 transition disabled:opacity-50 ${avatarColor === color ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-bold text-slate-700">アイコン画像</p>
                      <div className="mt-2 grid grid-cols-5 gap-2">
                        {defaultAvatarImages.map((image, index) => (
                          <button
                            key={image}
                            type="button"
                            aria-label={`標準アイコン ${index + 1}`}
                            aria-pressed={avatarImage === image}
                            disabled={isAvatarSaving}
                            onClick={() => void updateAvatar(avatarColor, image)}
                            className={`h-10 w-10 rounded-full border-2 bg-cover bg-center transition disabled:opacity-50 ${avatarImage === image ? "border-cyan-500 ring-2 ring-cyan-200" : "border-slate-200"}`}
                            style={{ backgroundColor: avatarColor, backgroundImage: `url(${image})` }}
                          />
                        ))}
                      </div>
                      <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                        画像を選ぶ（150KB以下）
                        <input type="file" accept="image/*" disabled={isAvatarSaving} onChange={(event) => uploadAvatar(event.target.files?.[0])} className="sr-only" />
                      </label>
                    </div>
                    <Link
                      href="/users/me"
                      className="mt-3 flex w-full items-center justify-center rounded-md bg-cyan-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                    >
                      マイページを開く
                    </Link>
                    <button
                      type="button"
                      onClick={() => setIsMobileInfoOpen(true)}
                      className="mt-2 flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 lg:hidden"
                    >
                      アカウント・戦績を開く
                    </button>
                  </div>
                </details>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
                  <span
                    className="h-8 w-8 rounded-full border border-white/60 bg-cover bg-center"
                    style={{
                      backgroundColor: avatarColor,
                      backgroundImage: `url(${avatarImage || defaultAvatarImage})`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="max-w-[160px] truncate text-sm font-semibold text-cyan-50">未ログイン</span>
                </div>
              )}
            </div>
          </div>
          <input
            type="password"
            value={privateAccessKey}
            onChange={(event) => setPrivateAccessKey(event.target.value)}
            aria-label="access key"
            autoComplete="off"
            className="mt-4 h-7 w-28 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white opacity-30 outline-none transition focus:border-white/30 focus:opacity-100"
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {isLoggedIn && isMobileInfoOpen && (
          <button
            type="button"
            aria-label="アカウント・戦績メニューを閉じる"
            onClick={() => setIsMobileInfoOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside id="lobby-account-panel" className={`space-y-4 lg:order-2 lg:static lg:col-start-2 lg:row-start-1 lg:block lg:w-auto lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none ${
          isLoggedIn
            ? isMobileInfoOpen
              ? "fixed inset-y-0 left-0 z-50 w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-r-xl bg-slate-950 p-3 shadow-2xl"
              : "hidden"
            : "order-1"
        }`}>
          {isLoggedIn && (
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white shadow-lg lg:hidden">
              <p className="text-sm font-black">アカウント・戦績</p>
              <button
                type="button"
                onClick={() => setIsMobileInfoOpen(false)}
                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold"
              >
                閉じる
              </button>
            </div>
          )}
          <div className="rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700">Account</p>
                <h2 className="text-lg font-bold text-slate-950">プレイヤーアカウント</h2>
              </div>
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  ログアウト
                </button>
              )}
            </div>

            {!isLoggedIn && (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                {([
                  ["login", "ログイン"],
                  ["register", "新規作成"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAuthMode(mode);
                      setMessage("");
                    }}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      authMode === mode
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-slate-700">
              プレイヤー名
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isLoggedIn}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-100"
                placeholder="例: yusuke"
              />
            </label>

            {!isLoggedIn && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                パスワード
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitAccount();
                  }}
                  type="password"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="4文字以上"
                />
              </label>
            )}

            {!isLoggedIn && authMode === "register" && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                メールアドレス <span className="font-normal text-slate-400">（任意）</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="you@example.com"
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                  登録しておくと、パスワードを忘れた場合にメールから再設定できます。
                </span>
              </label>
            )}

            {!isLoggedIn && (
              <button
                type="button"
                onClick={() => void submitAccount()}
                disabled={isSaving}
                className="mt-4 w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:bg-slate-300"
              >
                {isSaving ? "確認中..." : authMode === "register" ? "アカウント作成" : "ログイン"}
              </button>
            )}

            {!isLoggedIn && authMode === "login" && !showPasswordReset && (
              <button
                type="button"
                onClick={() => {
                  setShowPasswordReset(true);
                  setMessage("");
                }}
                className="mt-3 w-full text-center text-sm font-semibold text-cyan-700 underline-offset-4 hover:underline"
              >
                パスワードを忘れた方
              </button>
            )}

            {!isLoggedIn && authMode === "login" && showPasswordReset && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-800">パスワードを再設定</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">登録したメールアドレスへ、1時間有効な再設定リンクを送ります。</p>
                <input
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void requestPasswordReset();
                  }}
                  type="email"
                  autoComplete="email"
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="登録したメールアドレス"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void requestPasswordReset()}
                    disabled={isRequestingReset || !resetEmail.trim()}
                    className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-300"
                  >
                    {isRequestingReset ? "送信中..." : "再設定メールを送る"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {isLoggedIn && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">復旧用メール</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    hasRecoveryEmail ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                  }`}>
                    {hasRecoveryEmail ? "登録済み" : "未登録"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">登録すると、パスワードを忘れた場合にメールから再設定できます。変更には現在のパスワードが必要です。</p>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="you@example.com"
                />
                <input
                  value={updateEmailPassword}
                  onChange={(event) => setUpdateEmailPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="現在のパスワード"
                />
                <button
                  type="button"
                  onClick={() => void updateRecoveryEmail()}
                  disabled={isUpdatingEmail || !email.trim() || !updateEmailPassword}
                  className="mt-2 w-full rounded-lg border border-cyan-600 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:border-slate-300 disabled:text-slate-400"
                >
                  {isUpdatingEmail ? "登録中..." : "メールアドレスを登録・変更"}
                </button>
              </div>
            )}

            {message && (
              <p className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                {message}
              </p>
            )}
          </div>

          {isLoggedIn && (activeRoom || isActiveRoomLoading) && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
              <p className="text-xs font-semibold uppercase text-cyan-700">Resume</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">部屋に復帰</h2>
              {isActiveRoomLoading && !activeRoom ? (
                <p className="mt-3 text-sm text-slate-600">復帰先を確認中...</p>
              ) : activeRoom ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">ROOM</p>
                      <p className="font-bold text-slate-950">{activeRoom.code}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">状態</p>
                      <p className="font-bold text-slate-950">{activeRoomPhaseLabel(activeRoom.phase)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {activeRoom.players.length}人参加中 / {formatDate(activeRoom.updatedAt)}更新
                  </p>
                  <Link
                    href="/wordwolf"
                    onClick={rememberActiveRoom}
                    className="mt-3 inline-flex w-full justify-center rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500"
                  >
                    この部屋に復帰
                  </Link>
                </>
              ) : null}
            </div>
          )}

          {isLoggedIn && (
            <div className="rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Stats</p>
                  <h2 className="text-lg font-bold text-slate-950">戦績</h2>
                </div>
                <label className="sr-only" htmlFor="stats-game-filter">
                  戦績ゲーム
                </label>
                <select
                  id="stats-game-filter"
                  value={selectedStatsGame}
                  onChange={(event) => changeStatsGame(event.target.value as PlayerStatsGameFilter)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {statsGameOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadStats(playerId, selectedStatsGame)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  更新
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {selectedStatsGame === "all"
                  ? `レーティング　${statsGameOptions.filter((option) => option.value !== "all").map((option) => `${option.label} ${stats?.ratings[option.value as Exclude<PlayerStatsGameFilter, "all">] ?? 1000}`).join(" / ")}`
                  : `レーティング ${stats?.ratings[selectedStatsGame] ?? 1000}`}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {statItems(stats).map(([label, summary]) => (
                  <div key={label} className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{summary?.winRate ?? 0}%</p>
                    <p className="text-[11px] text-slate-500">
                      {summary?.wins ?? 0}勝 / {summary?.played ?? 0}戦
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Recent</p>
                {isStatsLoading ? (
                  <p className="mt-2 text-sm text-slate-500">読み込み中...</p>
                ) : stats?.recent.length ? (
                  <div className="mt-2 space-y-2">
                    {stats.recent.slice(0, 5).map((result) => (
                      <div key={result.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-semibold text-slate-800">{result.resultLabel}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(result.finishedAt)} / {statsGameOptions.find((option) => option.value === result.gameType)?.label ?? result.gameType}
                          </p>
                        </div>
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                          result.won ? "bg-cyan-100 text-cyan-700" : "bg-rose-100 text-rose-700"
                        }`}>
                          {result.won ? "WIN" : "LOSE"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">まだ記録はありません。</p>
                )}
              </div>
            </div>
          )}
        </aside>

        <div className={`${isLoggedIn ? "order-1" : "order-2"} min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1`}>
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-white">
            <p className="text-xs font-semibold uppercase text-cyan-200">Games</p>
            <h2 className="text-xl font-black">遊ぶゲームを選ぶ</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {games.filter((game) => !game.private || privateUnlocked).map((game) => {
            const card = (
              <article className="h-full rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
                <div className={`h-24 rounded-lg bg-gradient-to-br ${game.accent}`} />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-950">{game.title}</h2>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {game.status}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{game.summary}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">人数</p>
                    <p className="font-bold text-slate-950">{game.players}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">目安</p>
                    <p className="font-bold text-slate-950">{game.time}</p>
                  </div>
                </div>
                <div className="mt-4">
                  {game.href ? (
                    <span className={`inline-flex rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
                      isLoggedIn ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"
                    }`}>
                      {isLoggedIn ? "遊ぶ" : "ログインしてから遊ぶ"}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                      準備中
                    </span>
                  )}
                </div>
              </article>
            );

            if (!game.href) {
              return (
                <div key={`${game.title}-${game.status}`} className="block opacity-80">
                  {card}
                </div>
              );
            }

            return isLoggedIn ? (
              <Link key={game.title} href={game.href} className="block">
                {card}
              </Link>
            ) : (
              <button
                key={game.title}
                type="button"
                onClick={() => setMessage("先にプレイヤーアカウントでログインしてください。")}
                className="block text-left"
              >
                {card}
              </button>
            );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
