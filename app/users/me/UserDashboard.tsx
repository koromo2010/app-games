"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { savePersistentPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/player-session";
import type { PlayerGameResult, PlayerStatsResponse } from "@/lib/player-stats-store";
import { GameReplayPanel } from "@/app/components/GameReplayPanel";
import { PlayerAvatarEditor } from "@/app/components/PlayerAvatarEditor";
import { gamesForLocale } from "@/app/games/game-catalog";
import { defaultAvatarImage } from "@/lib/player-session";
import { appLocales, type AppLocale } from "@/lib/app-locale";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { appIntlLocale } from "@/lib/app-i18n";
import type { PlayerAccountSecuritySummary } from "@/lib/player-account-security";
import {
  playerPasswordMaximumLength,
  playerPasswordMinimumLength,
} from "@/lib/player-password-policy";

function formatDate(timestamp: number, locale: AppLocale) {
  return new Intl.DateTimeFormat(appIntlLocale(locale), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function summaryItems(stats: PlayerStatsResponse | null, labels: readonly [string, string, string]) {
  return [
    [labels[0], stats?.today],
    [labels[1], stats?.month],
    [labels[2], stats?.total],
  ] as const;
}

function gameEntry(gameType: PlayerGameResult["gameType"], locale: AppLocale) {
  return gamesForLocale(locale).find((game) => game.id === gameType);
}

function recoveryEmailErrorMessage(code: string | undefined, locale: AppLocale) {
  if (locale === "en") {
    if (code === "EMAIL_INVALID") return "Check the email address format.";
    if (code === "EMAIL_ALREADY_EXISTS") return "That email address is already used by another player account.";
    if (code === "EMAIL_NOT_REGISTERED") return "No unverified recovery email is registered. Enter an address and send a new confirmation.";
    if (code === "AUTH_REQUIRED") return "Sign in again and retry.";
    if (code === "INVALID_CREDENTIALS") return "Your current password is incorrect.";
    if (code === "EMAIL_NOT_CONFIGURED") return "Email delivery is not configured yet.";
    if (code === "EMAIL_PROVIDER_AUTH_FAILED") return "The email service credentials are not valid. An administrator must update the delivery settings.";
    if (code === "EMAIL_SENDER_NOT_VERIFIED") return "The sender domain has not been verified. An administrator must finish the email-domain setup.";
    if (code === "EMAIL_RECIPIENT_RESTRICTED") return "The email service is still limited to test recipients. An administrator must verify the sender domain.";
    if (code === "EMAIL_DELIVERY_QUOTA_EXCEEDED") return "The email delivery quota has been reached. Please try again later.";
    if (code === "EMAIL_DELIVERY_RATE_LIMITED") return "Too many emails were requested. Wait a moment and try again.";
    if (code === "EMAIL_SEND_FAILED") return "Could not send the confirmation email. Please try again later.";
    return "Could not save the recovery email address.";
  }
  if (code === "EMAIL_INVALID") return "メールアドレスの形式を確認してください。";
  if (code === "EMAIL_ALREADY_EXISTS") return "そのメールアドレスは別のプレイヤーアカウントで使われています。";
  if (code === "EMAIL_NOT_REGISTERED") return "再確認できる登録済みメールがありません。アドレスを入力して新しく確認メールを送信してください。";
  if (code === "AUTH_REQUIRED") return "ログインし直してから再度お試しください。";
  if (code === "INVALID_CREDENTIALS") return "現在のパスワードが正しくありません。";
  if (code === "EMAIL_NOT_CONFIGURED") return "メール送信機能がまだ設定されていません。";
  if (code === "EMAIL_PROVIDER_AUTH_FAILED") return "メール送信サービスの認証設定が無効です。管理者側で送信設定の更新が必要です。";
  if (code === "EMAIL_SENDER_NOT_VERIFIED") return "メールの送信元ドメインが未確認です。管理者側でドメイン認証を完了する必要があります。";
  if (code === "EMAIL_RECIPIENT_RESTRICTED") return "メール送信サービスがテスト送信先だけに制限されています。管理者側で送信元ドメインの認証が必要です。";
  if (code === "EMAIL_DELIVERY_QUOTA_EXCEEDED") return "メール送信枠の上限に達しています。時間をおいて再度お試しください。";
  if (code === "EMAIL_DELIVERY_RATE_LIMITED") return "メール送信が集中しています。少し待って再度お試しください。";
  if (code === "EMAIL_SEND_FAILED") return "確認メールを送信できませんでした。時間をおいて再度お試しください。";
  return "復旧用メールアドレスを保存できませんでした。";
}

function passwordChangeErrorMessage(code: string | undefined, locale: AppLocale) {
  if (locale === "en") {
    if (code === "INVALID_CREDENTIALS") return "Your current password is incorrect.";
    if (code === "PASSWORD_INVALID") return `Use ${playerPasswordMinimumLength} to ${playerPasswordMaximumLength} characters for the new password.`;
    if (code === "PASSWORD_UNCHANGED") return "The new password must be different from the current password.";
    if (code === "AUTH_REQUIRED") return "Sign in again and retry.";
    return "Could not change the password.";
  }
  if (code === "INVALID_CREDENTIALS") return "現在のパスワードが正しくありません。";
  if (code === "PASSWORD_INVALID") return `新しいパスワードは${playerPasswordMinimumLength}文字以上${playerPasswordMaximumLength}文字以内で入力してください。`;
  if (code === "PASSWORD_UNCHANGED") return "現在とは異なるパスワードを入力してください。";
  if (code === "AUTH_REQUIRED") return "ログインし直してから再度お試しください。";
  return "パスワードを変更できませんでした。";
}

const dashboardCopy = {
  ja: { shareSaved: "共有時の名前表示設定を保存しました。", shareLocal: "この端末にだけ設定を保存しました。ログインし直してからお試しください。", shareFailed: "共有時の名前表示設定を保存できませんでした。", localeActiveRoom: "言語を使うゲームの部屋に参加中は変更できません。部屋を退出・解散してから変更してください。", localeFailed: "表示言語を保存できませんでした。", localeSaved: "表示言語を保存しました。", networkFailed: "通信に失敗しました。もう一度試してください。", userLoadFailed: "ユーザー情報を読み込めませんでした。", statsLoadFailed: "戦績を読み込めませんでした。ほかのアカウント設定はそのまま利用できます。", recoverySaved: "復旧用メールアドレスを保存しました。", deleteConfirm: "アカウント、戦績、設定を削除します。この操作は取り消せません。削除しますか？", passwordIncorrect: "パスワードが正しくありません。", deleteFailed: "アカウントを削除できませんでした。", loading: "マイページを読み込み中...", loginRequired: "ログインが必要です", privatePage: "マイページは本人だけが閲覧できます。", back: "戻る", avatarEditor: "アイコンの模様替えを開く", player: "プレイヤー", pageSummary: "戦績・プレイバック・お気に入り", languageTitle: "表示言語・ゲーム言語", languageHelp: "言葉を使うゲームでは、この設定と同じ言語の部屋だけを表示・作成・参加できます。部屋参加画面では変更できません。", accountLanguage: "アカウントの言語", languageNotice: "現在、言語依存ゲームのコンテンツは日本語版のみです。Englishを選ぶと、対応ゲームが追加されるまで日本語部屋には入れません。", recoveryTitle: "復旧用メール", registered: "登録済み", unregistered: "未登録", recoveryHelp: "パスワードを忘れた場合の再設定に使用します。管理者と同じメールの場合はデバッグ権限も自動付与されます。変更には現在のパスワードが必要です。", email: "メールアドレス", currentPassword: "現在のパスワード", saving: "保存中…", saveRecovery: "登録・変更", shareTitle: "共有ログの表示名", shareConsent: "ほかの参加者が共有するワードスケールのプレイログに、自分の表示名を載せてもよい", shareHelp: "ゲーム画面の参加者名はこの設定に関係なく表示されます。OFFのとき外部共有では入室順の PLAYER1 などに置き換わります。設定は次に入室する部屋から反映されます。", stats: "戦績", today: "当日", month: "月間", total: "通算", loadingShort: "読み込み中", ratingLoading: "レーティングを読み込み中...", ratingEmpty: "ゲームを1回以上遊ぶとレーティングが表示されます。", recent: "最近の結果", statsLoading: "戦績を読み込み中...", replayHelp: "共有は、右側のプレイバックに見どころを添えて行えます。", statsEmpty: "まだ戦績はありません。", deleteAccount: "アカウントを削除", deleteHelp: "アカウント、戦績、設定を削除します。この操作は取り消せません。本人確認のため現在のパスワードを入力してください。", deleting: "削除中...", deletePermanently: "完全に削除する" },
  en: { shareSaved: "The shared-log name setting was saved.", shareLocal: "The setting was saved on this device only. Sign in again and retry.", shareFailed: "Could not save the shared-log name setting.", localeActiveRoom: "You cannot change language while you are in a language-based game room. Leave or dissolve the room first.", localeFailed: "Could not save the language.", localeSaved: "Language saved.", networkFailed: "Connection failed. Please try again.", userLoadFailed: "Could not load your account.", statsLoadFailed: "Could not load stats. Other account settings remain available.", recoverySaved: "Recovery email saved.", deleteConfirm: "Delete the account, stats, and settings? This cannot be undone.", passwordIncorrect: "The password is incorrect.", deleteFailed: "Could not delete the account.", loading: "Loading My Page...", loginRequired: "Sign-in required", privatePage: "Only you can view your My Page.", back: "Back", avatarEditor: "Open avatar editor", player: "Player", pageSummary: "Stats, replays, and favorites", languageTitle: "Display and game language", languageHelp: "Language-based games only show, create, and join rooms matching this setting. It cannot be changed from a room screen.", accountLanguage: "Account language", languageNotice: "Language-based game content is currently available in Japanese only. With English selected, you cannot enter Japanese rooms until English content is added.", recoveryTitle: "Recovery email", registered: "Registered", unregistered: "Not registered", recoveryHelp: "Used to reset your password. If it matches an administrator email, debug access is also granted automatically. Your current password is required to change it.", email: "Email address", currentPassword: "Current password", saving: "Saving…", saveRecovery: "Save or change", shareTitle: "Name in shared logs", shareConsent: "Allow my display name to appear in Word Scale play logs shared by other participants", shareHelp: "Player names in the game are always visible. When this is off, external shares use labels such as PLAYER1 in join order. The setting applies from the next room you join.", stats: "Stats", today: "Today", month: "This month", total: "All time", loadingShort: "Loading", ratingLoading: "Loading ratings...", ratingEmpty: "Ratings appear after you play a game at least once.", recent: "Recent results", statsLoading: "Loading stats...", replayHelp: "Use the replay panel on the right to add highlights before sharing.", statsEmpty: "No stats yet.", deleteAccount: "Delete account", deleteHelp: "This deletes the account, stats, and settings and cannot be undone. Enter your current password to confirm.", deleting: "Deleting...", deletePermanently: "Delete permanently" },
} as const;

export function UserDashboard() {
  const { locale, t } = useAppLocale();
  const copy = dashboardCopy[locale];
  const localizedGames = gamesForLocale(locale);
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
  const [recoveryEmailResendPassword, setRecoveryEmailResendPassword] = useState("");
  const [isRecoveryEmailSaving, setIsRecoveryEmailSaving] = useState(false);
  const [recoveryEmailUpdateMessage, setRecoveryEmailUpdateMessage] = useState("");
  const [recoveryEmailResendMessage, setRecoveryEmailResendMessage] = useState("");
  const [accountSecurity, setAccountSecurity] = useState<PlayerAccountSecuritySummary | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [isPasswordChanging, setIsPasswordChanging] = useState(false);
  const [passwordChangeMessage, setPasswordChangeMessage] = useState("");
  const [passwordChangeSucceeded, setPasswordChangeSucceeded] = useState(false);
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
      setShareNameMessage(result.persistent ? copy.shareSaved : copy.shareLocal);
    } catch {
      setShareNameMessage(copy.shareFailed);
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
          ? copy.localeActiveRoom
          : copy.localeFailed);
        return;
      }
      savePlayerSession(data.session);
      applyPlayerSession(data.session);
      setLocaleMessage(dashboardCopy[locale].localeSaved);
    } catch {
      setLocaleMessage(copy.networkFailed);
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
        const sessionResponse = await fetch("/api/player-account", { cache: "no-store", signal: controller.signal });
        if (sessionResponse.status === 401) {
          setRequiresLogin(true);
          return;
        }
        const sessionBody = (await sessionResponse.json()) as {
          session?: PlayerSession;
          accountSecurity?: PlayerAccountSecuritySummary;
        };
        if (!sessionResponse.ok || !sessionBody.session?.id) throw new Error("SESSION_LOAD_FAILED");
        setSession(sessionBody.session);
        setAccountSecurity(sessionBody.accountSecurity ?? null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage(copy.userLoadFailed);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [copy.userLoadFailed]);

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
        setMessage(copy.statsLoadFailed);
      } finally {
        if (!controller.signal.aborted) setIsStatsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [copy.statsLoadFailed, session?.id]);

  const updateRecoveryEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || isRecoveryEmailSaving) return;
    setIsRecoveryEmailSaving(true);
    setRecoveryEmailUpdateMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "update-email", name: session.name, password: recoveryEmailPassword, email: recoveryEmail }),
      });
      const data = await response.json().catch(() => null) as {
        session?: PlayerSession;
        accountSecurity?: PlayerAccountSecuritySummary;
        error?: string;
        emailVerificationPending?: boolean;
      } | null;
      if (!response.ok || !data?.session) {
        setRecoveryEmailUpdateMessage(recoveryEmailErrorMessage(data?.error, locale));
        return;
      }
      applyPlayerSession(data.session);
      setAccountSecurity(data.accountSecurity ?? null);
      setRecoveryEmail("");
      setRecoveryEmailPassword("");
      setRecoveryEmailUpdateMessage(data.emailVerificationPending
        ? (locale === "en" ? "A confirmation email was sent. Approve it to finish registration." : "確認メールを送信しました。メール内で承認すると登録が完了します。")
        : (locale === "en" ? "This email address is already verified." : "このメールアドレスは確認済みです。"));
    } catch {
      setRecoveryEmailUpdateMessage(copy.networkFailed);
    } finally {
      setIsRecoveryEmailSaving(false);
    }
  };

  const resendRecoveryEmail = async () => {
    if (!session || isRecoveryEmailSaving || !recoveryEmailResendPassword) return;
    setIsRecoveryEmailSaving(true);
    setRecoveryEmailResendMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "resend-email-verification",
          name: session.name,
          password: recoveryEmailResendPassword,
        }),
      });
      const data = await response.json().catch(() => null) as {
        session?: PlayerSession;
        accountSecurity?: PlayerAccountSecuritySummary;
        error?: string;
        emailVerificationPending?: boolean;
      } | null;
      if (!response.ok || !data?.session) {
        setRecoveryEmailResendMessage(recoveryEmailErrorMessage(data?.error, locale));
        return;
      }
      applyPlayerSession(data.session);
      setAccountSecurity(data.accountSecurity ?? null);
      setRecoveryEmailResendPassword("");
      setRecoveryEmailResendMessage(data.emailVerificationPending
        ? (locale === "en"
          ? "A new confirmation email was sent to the registered address. The previous link is no longer valid."
          : "登録済みアドレスへ確認メールを再送しました。以前の確認リンクは無効になりました。")
        : (locale === "en"
          ? "The registered recovery email is already verified."
          : "登録済みの復旧用メールはすでに確認済みです。"));
    } catch {
      setRecoveryEmailResendMessage(copy.networkFailed);
    } finally {
      setIsRecoveryEmailSaving(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || isPasswordChanging) return;
    setPasswordChangeSucceeded(false);
    if (newPassword !== newPasswordConfirmation) {
      setPasswordChangeMessage(locale === "en"
        ? "The new-password entries do not match."
        : "新しいパスワードと確認入力が一致しません。");
      return;
    }

    setIsPasswordChanging(true);
    setPasswordChangeMessage("");
    try {
      const response = await fetch("/api/player-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "change-password",
          name: session.name,
          password: currentPassword,
          newPassword,
        }),
      });
      const data = await response.json().catch(() => null) as {
        session?: PlayerSession;
        accountSecurity?: PlayerAccountSecuritySummary;
        error?: string;
      } | null;
      if (!response.ok || !data?.session) {
        setPasswordChangeMessage(passwordChangeErrorMessage(data?.error, locale));
        return;
      }
      applyPlayerSession(data.session);
      setAccountSecurity(data.accountSecurity ?? accountSecurity);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      setPasswordChangeSucceeded(true);
      setPasswordChangeMessage(locale === "en"
        ? "Password changed."
        : "パスワードを変更しました。");
    } catch {
      setPasswordChangeMessage(copy.networkFailed);
    } finally {
      setIsPasswordChanging(false);
    }
  };

  const deleteAccount = async () => {
    if (!session || !window.confirm(copy.deleteConfirm)) return;
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
        setDeleteAccountMessage(data.error === "INVALID_CREDENTIALS" ? copy.passwordIncorrect : copy.deleteFailed);
        return;
      }
      localStorage.removeItem("game-fields-player");
      localStorage.removeItem("wordwolf-last-room");
      localStorage.removeItem("wordwolf-last-player");
      window.parent.postMessage({ type: "game-fields:account-deleted" }, window.location.origin);
      window.location.assign("/games");
    } catch {
      setDeleteAccountMessage(copy.networkFailed);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoading) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-center text-sm text-slate-300">{copy.loading}</main>;
  }

  if (requiresLogin) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-white/10 p-6 text-center">
          <h1 className="text-2xl font-black">{copy.loginRequired}</h1>
          <p className="mt-2 text-sm text-slate-300">{copy.privatePage}</p>
          <Link href="/games" onClick={leaveDashboard} className="mt-5 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">{copy.back}</Link>
        </div>
      </main>
    );
  }

  const recoveryEmailStatus = accountSecurity?.recoveryEmailStatus
    ?? (session?.hasRecoveryEmail
      ? "verified"
      : session?.hasUnverifiedRecoveryEmail
        ? "unverified"
        : "none");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_15%_0%,rgba(139,92,246,0.28),transparent_38%),linear-gradient(135deg,#020617,#172033)] text-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIsAvatarEditorOpen((open) => !open)} aria-expanded={isAvatarEditorOpen} aria-label={copy.avatarEditor} className="h-12 w-12 shrink-0 rounded-full border border-white/30 bg-cover bg-center shadow-lg ring-offset-2 ring-offset-slate-950 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-300" style={{ backgroundColor: session?.avatarColor || "#0891b2", backgroundImage: `url(${session?.avatarImage || defaultAvatarImage})` }} />
              <div>
                <p className="text-xs font-semibold uppercase text-violet-200">My page</p>
                <h1 className="text-3xl font-black">{session?.name || copy.player}</h1>
                <p className="mt-1 text-sm text-slate-300">{copy.pageSummary}</p>
              </div>
            </div>
            <Link href="/games" onClick={leaveDashboard} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">{copy.back}</Link>
          </div>
          {session && isAvatarEditorOpen && <div className="mt-5 max-w-xl"><PlayerAvatarEditor session={session} onSaved={applyPlayerSession} /></div>}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-5 rounded-lg border border-amber-100 bg-amber-50 p-4" aria-labelledby="locale-heading">
          <p className="text-xs font-semibold uppercase text-amber-700">Language</p>
          <h2 id="locale-heading" className="text-lg font-black text-slate-950">{copy.languageTitle}</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">{copy.languageHelp}</p>
          <label className="mt-3 block max-w-xs text-sm font-bold text-slate-700">
            {copy.accountLanguage}
            <select value={session?.locale ?? "ja"} disabled={!session || isLocaleSaving} onChange={(event) => void updateLocale(event.target.value as AppLocale)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60">
              {appLocales.map((entry) => <option key={entry.id} value={entry.id}>{t(`locale.${entry.id}`)}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs text-amber-800">{copy.languageNotice}</p>
          {localeMessage && <p className="mt-2 text-xs font-semibold text-amber-800" role="status">{localeMessage}</p>}
        </section>
        <section className="mb-5 rounded-lg border border-violet-100 bg-violet-50 p-4" aria-labelledby="recovery-email-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase text-violet-700">Account</p><h2 id="recovery-email-heading" className="text-lg font-black text-slate-950">{copy.recoveryTitle}</h2></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${recoveryEmailStatus === "verified" ? "bg-emerald-100 text-emerald-700" : recoveryEmailStatus === "unverified" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
              {recoveryEmailStatus === "verified"
                ? (locale === "en" ? "Verified" : "確認済み")
                : recoveryEmailStatus === "unverified"
                  ? (locale === "en" ? "Unverified" : "未確認")
                  : (locale === "en" ? "Not registered" : "未登録")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {locale === "en"
              ? "Used for password recovery. The address is not registered, and grants no access, until you approve the confirmation email. A verified address matching an administrator email receives debug access automatically. Your current password is required."
              : "パスワード再設定に使用します。確認メール内で承認するまでは復旧先として利用できず、デバッグ権限も付与されません。確認済みメールが管理者メールと一致する場合はデバッグ権限を自動付与します。既存の登録メールも一度再確認が必要です。"}
          </p>
          {accountSecurity?.recoveryEmailHint && (
            <div className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                {locale === "en" ? "Current registered address" : "現在の登録先"}
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">{accountSecurity.recoveryEmailHint}</p>
            </div>
          )}
          {recoveryEmailStatus === "unverified" && (
            <form onSubmit={(event) => {
              event.preventDefault();
              void resendRecoveryEmail();
            }} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-black text-amber-950">
                {locale === "en" ? "Resend confirmation to the registered address" : "登録済みメールへ確認を再送"}
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                {locale === "en"
                  ? `The confirmation will be sent to ${accountSecurity?.recoveryEmailHint ?? "the registered address"}. You do not need to enter a new email address. Enter your current password below to confirm this action.`
                  : `確認メールは ${accountSecurity?.recoveryEmailHint ?? "現在の登録先"} へ送ります。新しいメールアドレス欄への入力は不要です。本人確認のため、下に現在のパスワードを入力してください。`}
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="text-sm font-bold text-slate-700">
                  {locale === "en" ? "Current password for resend" : "再送のための現在のパスワード"}
                  <input value={recoveryEmailResendPassword} onChange={(event) => setRecoveryEmailResendPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />
                </label>
                <button
                  type="submit"
                  disabled={isRecoveryEmailSaving || !recoveryEmailResendPassword}
                  className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:border-slate-200 disabled:text-slate-400"
                >
                  {isRecoveryEmailSaving
                    ? (locale === "en" ? "Sending…" : "送信中…")
                    : (locale === "en" ? "Resend confirmation" : "確認メールを再送")}
                </button>
              </div>
              {recoveryEmailResendMessage && <p className="mt-2 text-xs font-semibold text-amber-900" role="status">{recoveryEmailResendMessage}</p>}
            </form>
          )}
          <p className="mt-4 text-sm font-black text-slate-800">
            {recoveryEmailStatus === "none"
              ? (locale === "en" ? "Register a recovery email" : "復旧用メールを登録")
              : (locale === "en" ? "Change the recovery email" : "復旧用メールを変更")}
          </p>
          <form onSubmit={updateRecoveryEmail} className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-bold text-slate-700">
              {recoveryEmailStatus === "none"
                ? copy.email
                : (locale === "en" ? "New email address" : "新しいメールアドレス")}
              <input value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" placeholder="you@example.com" />
            </label>
            <label className="text-sm font-bold text-slate-700">
              {locale === "en" ? "Current password for registration/change" : "登録・変更のための現在のパスワード"}
              <input value={recoveryEmailPassword} onChange={(event) => setRecoveryEmailPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />
            </label>
            <button type="submit" disabled={isRecoveryEmailSaving || !recoveryEmail.trim() || !recoveryEmailPassword} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:bg-slate-300">{isRecoveryEmailSaving ? (locale === "en" ? "Sending…" : "送信中…") : (locale === "en" ? "Send confirmation" : "確認メールを送信")}</button>
          </form>
          {recoveryEmailUpdateMessage && <p className="mt-2 text-xs font-semibold text-violet-800" role="status">{recoveryEmailUpdateMessage}</p>}
        </section>
        <section className="mb-5 rounded-lg border border-sky-100 bg-sky-50 p-4" aria-labelledby="password-change-heading">
          <p className="text-xs font-semibold uppercase text-sky-700">Security</p>
          <h2 id="password-change-heading" className="text-lg font-black text-slate-950">
            {locale === "en" ? "Change password" : "パスワード変更"}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {locale === "en"
              ? "Your current password verifies your identity. Entering the new password twice only prevents typing mistakes."
              : "本人確認のため現在のパスワードが必要です。新しいパスワードの2回入力は、入力ミスを防ぐためのものです。"}
          </p>
          <form onSubmit={changePassword} className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">
              {copy.currentPassword}
              <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" required maxLength={playerPasswordMaximumLength} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" />
            </label>
            <label className="text-sm font-bold text-slate-700">
              {locale === "en" ? "New password" : "新しいパスワード"}
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={playerPasswordMinimumLength} maxLength={playerPasswordMaximumLength} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" />
            </label>
            <label className="text-sm font-bold text-slate-700">
              {locale === "en" ? "New password (confirm)" : "新しいパスワード（確認）"}
              <input value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} type="password" autoComplete="new-password" required minLength={playerPasswordMinimumLength} maxLength={playerPasswordMaximumLength} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" />
            </label>
            <button type="submit" disabled={isPasswordChanging || !currentPassword || !newPassword || !newPasswordConfirmation} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-500 disabled:bg-slate-300 md:col-span-3 md:justify-self-start">
              {isPasswordChanging
                ? (locale === "en" ? "Changing…" : "変更中…")
                : (locale === "en" ? "Change password" : "パスワードを変更")}
            </button>
          </form>
          {passwordChangeMessage && (
            <p className={`mt-2 text-xs font-semibold ${passwordChangeSucceeded ? "text-emerald-700" : "text-rose-700"}`} role="status">
              {passwordChangeMessage}
            </p>
          )}
        </section>
        <section className="mb-5 rounded-lg border border-cyan-100 bg-cyan-50 p-4" aria-labelledby="share-privacy-heading">
          <p className="text-xs font-semibold uppercase text-cyan-700">Privacy</p>
          <h2 id="share-privacy-heading" className="text-lg font-black text-slate-950">{copy.shareTitle}</h2>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md bg-white px-3 py-3 text-sm text-slate-800 shadow-sm">
            <input type="checkbox" checked={session?.shareNameAllowed === true} disabled={!session || isShareNameSaving} onChange={(event) => void updateShareNameAllowed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-600 disabled:opacity-50" />
            <span><span className="font-bold">{copy.shareConsent}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{copy.shareHelp}</span></span>
          </label>
          {shareNameMessage && <p className="mt-2 text-xs font-semibold text-cyan-800" role="status">{shareNameMessage}</p>}
        </section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="rounded-lg bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.22)]" aria-labelledby="user-stats-heading">
          <p className="text-xs font-semibold uppercase text-cyan-700">Stats</p>
          <h2 id="user-stats-heading" className="text-xl font-black text-slate-950">{copy.stats}</h2>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {summaryItems(stats, [copy.today, copy.month, copy.total]).map(([label, summary]) => (
              <div key={label} className="rounded-lg bg-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{isStatsLoading ? "…" : `${summary?.winRate ?? 0}%`}</p>
                <p className="text-[11px] text-slate-500">{isStatsLoading ? copy.loadingShort : t("stats.record", { wins: summary?.wins ?? 0, played: summary?.played ?? 0 })}</p>
              </div>
            ))}
          </div>

          {isStatsLoading ? (
            <p className="mt-4 text-sm text-slate-500">{copy.ratingLoading}</p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {localizedGames.filter((game) => game.stats === "account" && typeof stats?.ratings[game.id as PlayerGameResult["gameType"]] === "number").map((game) => (
                <div key={game.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-700">{game.title}</span>
                  <span className="font-black text-cyan-700">{stats?.ratings[game.id as PlayerGameResult["gameType"]]}</span>
                </div>
              ))}
              {stats && Object.keys(stats.ratings).length === 0 && <p className="text-sm text-slate-500 sm:col-span-2">{copy.ratingEmpty}</p>}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-black text-slate-800">{copy.recent}</h3>
            {isStatsLoading ? (
              <p className="mt-2 text-sm text-slate-500">{copy.statsLoading}</p>
            ) : stats?.recent.length ? (
              <div className="mt-2 space-y-2">
                {stats.recent.map((result) => (
                  <article key={result.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{gameEntry(result.gameType, locale)?.title ?? result.gameType} · {result.resultLabel}</p>
                      <p className="text-xs text-slate-500">{formatDate(result.finishedAt, locale)}</p>
                    </div>
                  </article>
                ))}
                <p className="px-1 text-xs leading-5 text-slate-500">{copy.replayHelp}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{copy.statsEmpty}</p>
            )}
          </div>
          {message && <p className="mt-4 rounded-md bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800" role="status">{message}</p>}
          </section>
          <GameReplayPanel />
        </div>

        <section className="mt-6 border-t border-rose-300/15 pt-4" aria-labelledby="delete-account-heading">
          <button type="button" id="delete-account-heading" onClick={() => { setShowAccountDeletion((value) => !value); setDeleteAccountPassword(""); setDeleteAccountMessage(""); }} className="text-xs font-bold text-rose-300/70 transition hover:text-rose-200">
            {copy.deleteAccount}
          </button>
          {showAccountDeletion && <div className="mt-3 max-w-md rounded-lg border border-rose-300/20 bg-rose-950/20 p-4">
            <p className="text-xs leading-5 text-rose-100/80">{copy.deleteHelp}</p>
            <input value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-3 w-full rounded-lg border border-rose-300/30 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-rose-400/20" placeholder={copy.currentPassword} />
            <button type="button" onClick={() => void deleteAccount()} disabled={isDeletingAccount || !deleteAccountPassword} className="mt-2 w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-400">
              {isDeletingAccount ? copy.deleting : copy.deletePermanently}
            </button>
            {deleteAccountMessage && <p className="mt-2 text-xs font-semibold text-rose-200" role="status">{deleteAccountMessage}</p>}
          </div>}
        </section>
      </div>
    </main>
  );
}
