"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { savePersistentPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/player-session";
import type { PlayerGameResult, PlayerStatsResponse } from "@/lib/player-stats-store";
import { GameReplayPanel } from "@/app/components/GameReplayPanel";
import { PlayerAvatarEditor } from "@/app/components/PlayerAvatarEditor";
import { games } from "@/app/games/game-catalog";
import { defaultAvatarImage } from "@/lib/player-session";
import { appLocales, type AppLocale } from "@/lib/app-locale";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function summaryItems(stats: PlayerStatsResponse | null) {
  return [
    ["当日", stats?.today],
    ["月間", stats?.month],
    ["通算", stats?.total],
  ] as const;
}

function gameEntry(gameType: PlayerGameResult["gameType"]) {
  return games.find((game) => game.id === gameType);
}

function recoveryEmailErrorMessage(code: string | undefined) {
  if (code === "EMAIL_INVALID") return "メールアドレスの形式を確認してください。";
  if (code === "EMAIL_ALREADY_EXISTS") return "そのメールアドレスは別のプレイヤーアカウントで使われています。";
  if (code === "INVALID_CREDENTIALS") return "現在のパスワードが正しくありません。";
  return "復旧用メールアドレスを保存できませんでした。";
}

export function UserDashboard() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [message, setMessage] = useState("");
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isShareNameSaving, setIsShareNameSaving] = useState(false);
  const [shareNameMessage, setShareNameMessage] = useState("");
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  const [localeMessage, setLocaleMessage] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryEmailPassword, setRecoveryEmailPassword] = useState("");
  const [isRecoveryEmailSaving, setIsRecoveryEmailSaving] = useState(false);
  const [recoveryEmailMessage, setRecoveryEmailMessage] = useState("");
  const [showAccountDeletion, setShowAccountDeletion] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountMessage, setDeleteAccountMessage] = useState("");

  const applyPlayerSession = (nextSession: PlayerSession) => {
    setSession(nextSession);
    const message = { type: "game-fields:player-session-updated", session: nextSession };
    window.parent.postMessage(message, window.location.origin);
    if (window.opener && !window.opener.closed) window.opener.postMessage(message, window.location.origin);
  };

  const updateShareNameAllowed = async (shareNameAllowed: boolean) => {
    if (!session || isShareNameSaving) return;
    setIsShareNameSaving(true);
    setShareNameMessage("");
    try {
      const result = await savePersistentPlayerSession({
        id: session.id,
        name: session.name,
        avatarColor: session.avatarColor,
        avatarImage: session.avatarImage,
        hasRecoveryEmail: session.hasRecoveryEmail,
        shareNameAllowed,
        locale: session.locale,
        createdAt: session.createdAt,
      });
      applyPlayerSession(result.session);
      setShareNameMessage(result.persistent ? "共有時の名前表示設定を保存しました。" : "この端末にだけ設定を保存しました。ログインし直してからお試しください。");
    } catch {
      setShareNameMessage("共有時の名前表示設定を保存できませんでした。");
    } finally {
      setIsShareNameSaving(false);
    }
  };

  const updateLocale = async (locale: AppLocale) => {
    if (!session || isLocaleSaving || locale === session.locale) return;
    setIsLocaleSaving(true);
    setLocaleMessage("");
    try {
      const response = await fetch("/api/player-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: session.name,
          avatarColor: session.avatarColor,
          avatarImage: session.avatarImage,
          createdAt: session.createdAt,
          shareNameAllowed: session.shareNameAllowed,
          locale,
        }),
      });
      const data = await response.json().catch(() => null) as { session?: PlayerSession; error?: string } | null;
      if (!response.ok || !data?.session) {
        setLocaleMessage(data?.error === "PLAYER_LOCALE_ACTIVE_ROOM"
          ? "言語を使うゲームの部屋に参加中は変更できません。部屋を退出・解散してから変更してください。"
          : "表示言語を保存できませんでした。");
        return;
      }
      savePlayerSession(data.session);
      applyPlayerSession(data.session);
      setLocaleMessage("表示言語を保存しました。");
    } catch {
      setLocaleMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsLocaleSaving(false);
    }
  };

  const leaveDashboard = (event: MouseEvent<HTMLAnchorElement>) => {
    if (new URLSearchParams(window.location.search).get("embedded") === "1") {
      event.preventDefault();
      window.parent.postMessage({ type: "game-fields:close-overlay" }, window.location.origin);
      return;
    }
    if (new URLSearchParams(window.location.search).get("popup") !== "1") return;
    event.preventDefault();
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign("/games");
    }, 100);
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/player-session", { cache: "no-store", signal: controller.signal });
        if (sessionResponse.status === 401) {
          setRequiresLogin(true);
          return;
        }
        const sessionBody = (await sessionResponse.json()) as { session?: PlayerSession };
        if (!sessionResponse.ok || !sessionBody.session?.id) throw new Error("SESSION_LOAD_FAILED");
        setSession(sessionBody.session);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage("ユーザー情報を読み込めませんでした。");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    const playerId = session.id;
    const controller = new AbortController();
    void (async () => {
      try {
        const params = new URLSearchParams({ playerId, gameType: "all" });
        const response = await fetch(`/api/player-stats?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as { stats?: PlayerStatsResponse };
        if (!response.ok || !body.stats) throw new Error("STATS_LOAD_FAILED");
        setStats(body.stats);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setStats(null);
        setMessage("戦績を読み込めませんでした。ほかのアカウント設定はそのまま利用できます。");
      } finally {
        if (!controller.signal.aborted) setIsStatsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [session?.id]);

  const updateRecoveryEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || isRecoveryEmailSaving) return;
    setIsRecoveryEmailSaving(true);
    setRecoveryEmailMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "update-email", name: session.name, password: recoveryEmailPassword, email: recoveryEmail }),
      });
      const data = await response.json().catch(() => null) as { session?: PlayerSession; error?: string } | null;
      if (!response.ok || !data?.session) {
        setRecoveryEmailMessage(recoveryEmailErrorMessage(data?.error));
        return;
      }
      applyPlayerSession(data.session);
      setRecoveryEmail("");
      setRecoveryEmailPassword("");
      setRecoveryEmailMessage("復旧用メールアドレスを保存しました。");
    } catch {
      setRecoveryEmailMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsRecoveryEmailSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!session || !window.confirm("アカウント、戦績、設定を削除します。この操作は取り消せません。削除しますか？")) return;
    setIsDeletingAccount(true);
    setDeleteAccountMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", name: session.name, password: deleteAccountPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDeleteAccountMessage(data.error === "INVALID_CREDENTIALS" ? "パスワードが正しくありません。" : "アカウントを削除できませんでした。");
        return;
      }
      localStorage.removeItem("game-fields-player");
      localStorage.removeItem("wordwolf-last-room");
      localStorage.removeItem("wordwolf-last-player");
      window.parent.postMessage({ type: "game-fields:account-deleted" }, window.location.origin);
      window.location.assign("/games");
    } catch {
      setDeleteAccountMessage("通信に失敗しました。もう一度試してください。");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoading) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-center text-sm text-slate-300">マイページを読み込み中...</main>;
  }

  if (requiresLogin) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-white/10 p-6 text-center">
          <h1 className="text-2xl font-black">ログインが必要です</h1>
          <p className="mt-2 text-sm text-slate-300">マイページは本人だけが閲覧できます。</p>
          <Link href="/games" onClick={leaveDashboard} className="mt-5 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">戻る</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_15%_0%,rgba(139,92,246,0.28),transparent_38%),linear-gradient(135deg,#020617,#172033)] text-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIsAvatarEditorOpen((open) => !open)} aria-expanded={isAvatarEditorOpen} aria-label="アイコンの模様替えを開く" className="h-12 w-12 shrink-0 rounded-full border border-white/30 bg-cover bg-center shadow-lg ring-offset-2 ring-offset-slate-950 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-300" style={{ backgroundColor: session?.avatarColor || "#0891b2", backgroundImage: `url(${session?.avatarImage || defaultAvatarImage})` }} />
              <div>
                <p className="text-xs font-semibold uppercase text-violet-200">My page</p>
                <h1 className="text-3xl font-black">{session?.name || "プレイヤー"}</h1>
                <p className="mt-1 text-sm text-slate-300">戦績・プレイバック・お気に入り</p>
              </div>
            </div>
            <Link href="/games" onClick={leaveDashboard} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">戻る</Link>
          </div>
          {session && isAvatarEditorOpen && <div className="mt-5 max-w-xl"><PlayerAvatarEditor session={session} onSaved={applyPlayerSession} /></div>}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-5 rounded-lg border border-amber-100 bg-amber-50 p-4" aria-labelledby="locale-heading">
          <p className="text-xs font-semibold uppercase text-amber-700">Language</p>
          <h2 id="locale-heading" className="text-lg font-black text-slate-950">表示言語・ゲーム言語</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">言葉を使うゲームでは、この設定と同じ言語の部屋だけを表示・作成・参加できます。部屋参加画面では変更できません。</p>
          <label className="mt-3 block max-w-xs text-sm font-bold text-slate-700">
            アカウントの言語
            <select value={session?.locale ?? "ja"} disabled={!session || isLocaleSaving} onChange={(event) => void updateLocale(event.target.value as AppLocale)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60">
              {appLocales.map((locale) => <option key={locale.id} value={locale.id}>{locale.label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs text-amber-800">現在、言語依存ゲームのコンテンツは日本語版のみです。Englishを選ぶと、対応ゲームが追加されるまで日本語部屋には入れません。</p>
          {localeMessage && <p className="mt-2 text-xs font-semibold text-amber-800" role="status">{localeMessage}</p>}
        </section>
        <section className="mb-5 rounded-lg border border-violet-100 bg-violet-50 p-4" aria-labelledby="recovery-email-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase text-violet-700">Account</p><h2 id="recovery-email-heading" className="text-lg font-black text-slate-950">復旧用メール</h2></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${session?.hasRecoveryEmail ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{session?.hasRecoveryEmail ? "登録済み" : "未登録"}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">パスワードを忘れた場合の再設定に使用します。管理者と同じメールの場合はデバッグ権限も自動付与されます。変更には現在のパスワードが必要です。</p>
          <form onSubmit={updateRecoveryEmail} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-bold text-slate-700">メールアドレス<input value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" placeholder="you@example.com" /></label>
            <label className="text-sm font-bold text-slate-700">現在のパスワード<input value={recoveryEmailPassword} onChange={(event) => setRecoveryEmailPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" /></label>
            <button type="submit" disabled={isRecoveryEmailSaving || !recoveryEmail.trim() || !recoveryEmailPassword} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:bg-slate-300">{isRecoveryEmailSaving ? "保存中…" : "登録・変更"}</button>
          </form>
          {recoveryEmailMessage && <p className="mt-2 text-xs font-semibold text-violet-800" role="status">{recoveryEmailMessage}</p>}
        </section>
        <section className="mb-5 rounded-lg border border-cyan-100 bg-cyan-50 p-4" aria-labelledby="share-privacy-heading">
          <p className="text-xs font-semibold uppercase text-cyan-700">Privacy</p>
          <h2 id="share-privacy-heading" className="text-lg font-black text-slate-950">共有ログの表示名</h2>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md bg-white px-3 py-3 text-sm text-slate-800 shadow-sm">
            <input type="checkbox" checked={session?.shareNameAllowed === true} disabled={!session || isShareNameSaving} onChange={(event) => void updateShareNameAllowed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-600 disabled:opacity-50" />
            <span><span className="font-bold">ほかの参加者が共有するワードスケールのプレイログに、自分の表示名を載せてもよい</span><span className="mt-1 block text-xs leading-5 text-slate-600">ゲーム画面の参加者名はこの設定に関係なく表示されます。OFFのとき外部共有では入室順の PLAYER1 などに置き換わります。設定は次に入室する部屋から反映されます。</span></span>
          </label>
          {shareNameMessage && <p className="mt-2 text-xs font-semibold text-cyan-800" role="status">{shareNameMessage}</p>}
        </section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="rounded-lg bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.22)]" aria-labelledby="user-stats-heading">
          <p className="text-xs font-semibold uppercase text-cyan-700">Stats</p>
          <h2 id="user-stats-heading" className="text-xl font-black text-slate-950">戦績</h2>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {summaryItems(stats).map(([label, summary]) => (
              <div key={label} className="rounded-lg bg-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{isStatsLoading ? "…" : `${summary?.winRate ?? 0}%`}</p>
                <p className="text-[11px] text-slate-500">{isStatsLoading ? "読み込み中" : `${summary?.wins ?? 0}勝 / ${summary?.played ?? 0}戦`}</p>
              </div>
            ))}
          </div>

          {isStatsLoading ? (
            <p className="mt-4 text-sm text-slate-500">レーティングを読み込み中...</p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {games.filter((game) => game.stats === "account" && typeof stats?.ratings[game.id as PlayerGameResult["gameType"]] === "number").map((game) => (
                <div key={game.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-700">{game.title}</span>
                  <span className="font-black text-cyan-700">{stats?.ratings[game.id as PlayerGameResult["gameType"]]}</span>
                </div>
              ))}
              {stats && Object.keys(stats.ratings).length === 0 && <p className="text-sm text-slate-500 sm:col-span-2">ゲームを1回以上遊ぶとレーティングが表示されます。</p>}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-black text-slate-800">最近の結果</h3>
            {isStatsLoading ? (
              <p className="mt-2 text-sm text-slate-500">戦績を読み込み中...</p>
            ) : stats?.recent.length ? (
              <div className="mt-2 space-y-2">
                {stats.recent.map((result) => (
                  <article key={result.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{gameEntry(result.gameType)?.title ?? result.gameType}・{result.resultLabel}</p>
                      <p className="text-xs text-slate-500">{formatDate(result.finishedAt)}</p>
                    </div>
                  </article>
                ))}
                <p className="px-1 text-xs leading-5 text-slate-500">共有は、右側のプレイバックに見どころを添えて行えます。</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">まだ戦績はありません。</p>
            )}
          </div>
          {message && <p className="mt-4 rounded-md bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800" role="status">{message}</p>}
          </section>
          <GameReplayPanel />
        </div>

        <section className="mt-6 border-t border-rose-300/15 pt-4" aria-labelledby="delete-account-heading">
          <button type="button" id="delete-account-heading" onClick={() => { setShowAccountDeletion((value) => !value); setDeleteAccountPassword(""); setDeleteAccountMessage(""); }} className="text-xs font-bold text-rose-300/70 transition hover:text-rose-200">
            アカウントを削除
          </button>
          {showAccountDeletion && <div className="mt-3 max-w-md rounded-lg border border-rose-300/20 bg-rose-950/20 p-4">
            <p className="text-xs leading-5 text-rose-100/80">アカウント、戦績、設定を削除します。この操作は取り消せません。本人確認のため現在のパスワードを入力してください。</p>
            <input value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-3 w-full rounded-lg border border-rose-300/30 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-rose-400/20" placeholder="現在のパスワード" />
            <button type="button" onClick={() => void deleteAccount()} disabled={isDeletingAccount || !deleteAccountPassword} className="mt-2 w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-400">
              {isDeletingAccount ? "削除中..." : "完全に削除する"}
            </button>
            {deleteAccountMessage && <p className="mt-2 text-xs font-semibold text-rose-200" role="status">{deleteAccountMessage}</p>}
          </div>}
        </section>
      </div>
    </main>
  );
}
