"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { uploadSiteIcon } from "@/lib/site-icon-image-client";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import { defaultSiteSettings, siteSettingsLimits, type SiteSettings } from "@/lib/site-settings";
import { AdminAccountsPanel } from "./AdminAccountsPanel";
import { AdminDashboard } from "./AdminDashboard";
import { AdminHyperparametersPanel } from "./AdminHyperparametersPanel";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { GameOperationsPanel } from "./GameOperationsPanel";
import { VocabularyDraftsPanel } from "./VocabularyDraftsPanel";

type ScreenState = "checking" | "login" | "mfa" | "recovery-codes" | "settings";
type LoginMethod = "account" | "master";
type AdminSection = "dashboard" | "site-settings" | "games" | "vocabulary" | "hyperparameters" | "accounts" | "audit";
type AdminSession = { scope: "full" | "recovery"; method: "passkey" | "recovery-code" | "master"; email: string | null; expiresAt: number; mfaAt: number | null };
type MfaMode = "login" | "enroll";
const messages: Record<string, string> = {
  INVALID_ADMIN_PASSWORD: "管理パスワードが違います。",
  INVALID_ADMIN_CREDENTIALS: "メールアドレスまたはパスワードが違います。",
  SITE_ADMIN_PASSWORD_NOT_CONFIGURED: "サーバーにSITE_ADMIN_PASSWORDが設定されていません。",
  SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED: "管理者メールの保存先が設定されていません。マスターパスワードでログインしてください。",
  MASTER_LOGIN_DISABLED: "マスターパスワードは通常時無効です。復旧が必要な場合だけVercelで復旧モードを有効にしてください。",
  INVALID_RECOVERY_CODE: "復旧コードが違うか、すでに使用されています。",
  SITE_ADMIN_CHALLENGE_EXPIRED: "本人確認の有効期限が切れました。パスワードからもう一度ログインしてください。",
  SITE_ADMIN_PASSKEY_VERIFICATION_FAILED: "パスキーを確認できませんでした。もう一度お試しください。",
  SITE_SETTINGS_STORE_NOT_CONFIGURED: "サイト設定の保存先が設定されていません。",
  INVALID_TEXT: "未入力の項目、または文字数を超えている項目があります。",
  INVALID_ICON_URL: "アイコン画像を確認してください。",
  SITE_ICON_BLOB_NOT_CONFIGURED: "アイコン画像の保存先が設定されていません。",
  SITE_ICON_FILE_TOO_LARGE: "アイコン画像の容量が大きすぎます。",
  SITE_ICON_SOURCE_INVALID: "10MB以下の画像を選んでください。",
  SITE_ICON_UPLOAD_FAILED: "アイコン画像をアップロードできませんでした。",
};

function errorMessage(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return messages[code] ?? fallback;
}

export function SiteAdminPanel({ showPreviewVocabularyMigrations }: {
  showPreviewVocabularyMigrations: boolean;
}) {
  const [screen, setScreen] = useState<ScreenState>("checking");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [mfaMode, setMfaMode] = useState<MfaMode>("login");
  const [mfaOptions, setMfaOptions] = useState<PublicKeyCredentialRequestOptionsJSON | PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [issuedRecoveryCodes, setIssuedRecoveryCodes] = useState<string[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [section, setSection] = useState<AdminSection>("dashboard");
  const authExpired = useCallback(() => { setSession(null); setScreen("login"); setMessage("管理画面のログイン期限が切れました。もう一度ログインしてください。"); }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/site-settings", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null) as { settings?: SiteSettings; session?: AdminSession; error?: string } | null;
      if (response.ok && data?.settings && data.session) { setSettings(data.settings); setSession(data.session); setSection(data.session.scope === "recovery" ? "accounts" : "dashboard"); setScreen("settings"); return; }
      setScreen("login");
      if (response.status !== 401 && data?.error) setMessage(errorMessage(data.error, "管理画面を読み込めませんでした。"));
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setScreen("login"); setMessage("管理画面を読み込めませんでした。");
    });
    return () => controller.abort();
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || (loginMethod === "account" && !email.trim()) || isSaving) return;
    setIsSaving(true); setMessage("");
    try {
      const body = loginMethod === "account" ? { email, password } : { password };
      const response = await fetch("/api/admin/site-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null) as { settings?: SiteSettings; session?: AdminSession; mfaRequired?: boolean; passkeySetupRequired?: boolean; options?: PublicKeyCredentialRequestOptionsJSON | PublicKeyCredentialCreationOptionsJSON; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "ADMIN_LOGIN_FAILED");
      setPassword("");
      if (data?.settings && data.session) {
        setSettings(data.settings); setSession(data.session); setEmail(""); setScreen("settings"); setSection(data.session.scope === "recovery" ? "accounts" : "dashboard");
        return;
      }
      if (data?.options && (data.mfaRequired || data.passkeySetupRequired)) {
        setMfaMode(data.passkeySetupRequired ? "enroll" : "login"); setMfaOptions(data.options); setScreen("mfa");
        return;
      }
      throw new Error("ADMIN_LOGIN_FAILED");
    } catch (error) { setMessage(errorMessage(error, "管理画面へログインできませんでした。")); }
    finally { setIsSaving(false); }
  };

  const loadAuthenticatedSettings = async () => {
    const response = await fetch("/api/admin/site-settings", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { settings?: SiteSettings; session?: AdminSession; error?: string } | null;
    if (!response.ok || !data?.settings || !data.session) throw new Error(data?.error || "ADMIN_LOGIN_FAILED");
    setSettings(data.settings); setSession(data.session); setEmail(""); setRecoveryCode(""); setSection("dashboard"); setScreen("settings");
  };

  const completePasskey = async () => {
    if (!mfaOptions || isSaving) return;
    setIsSaving(true); setMessage("");
    try {
      const credential = mfaMode === "enroll"
        ? await startRegistration({ optionsJSON: mfaOptions as PublicKeyCredentialCreationOptionsJSON })
        : await startAuthentication({ optionsJSON: mfaOptions as PublicKeyCredentialRequestOptionsJSON });
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mfaMode === "enroll" ? "verify-registration" : "verify-authentication", response: credential }) });
      const data = await response.json().catch(() => null) as { verified?: boolean; recoveryCodes?: string[]; error?: string } | null;
      if (!response.ok || !data?.verified) {
        if (data?.error === "SITE_ADMIN_CHALLENGE_EXPIRED") { setMfaOptions(null); setScreen("login"); }
        throw new Error(data?.error || "SITE_ADMIN_PASSKEY_VERIFICATION_FAILED");
      }
      if (data.recoveryCodes?.length) { setIssuedRecoveryCodes(data.recoveryCodes); setScreen("recovery-codes"); return; }
      await loadAuthenticatedSettings();
    } catch (error) { setMessage(errorMessage(error, "パスキーを確認できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const useRecoveryCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!recoveryCode.trim() || isSaving) return;
    setIsSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "use-recovery-code", recoveryCode }) });
      const data = await response.json().catch(() => null) as { verified?: boolean; error?: string } | null;
      if (!response.ok || !data?.verified) throw new Error(data?.error || "INVALID_RECOVERY_CODE");
      await loadAuthenticatedSettings();
    } catch (error) { setMessage(errorMessage(error, "復旧コードでログインできませんでした。")); }
    finally { setIsSaving(false); }
  };

  const continueAfterRecoveryCodes = async () => {
    setMessage("");
    try { await loadAuthenticatedSettings(); }
    catch (error) { setMessage(errorMessage(error, "管理画面を読み込めませんでした。もう一度ログインしてください。")); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving || isUploading) return;
    setIsSaving(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/site-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
      const data = await response.json().catch(() => null) as { settings?: SiteSettings; error?: string } | null;
      if (!response.ok || !data?.settings) throw new Error(data?.error || "SITE_SETTINGS_SAVE_FAILED");
      setSettings(data.settings); setMessage("保存しました。サイトのアイコンと検索用情報へ反映されます。");
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") setScreen("login");
      setMessage(errorMessage(error, "サイト設定を保存できませんでした。"));
    } finally { setIsSaving(false); }
  };

  const selectIcon = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.currentTarget.value = "";
    if (!file || isUploading) return;
    setIsUploading(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const iconUrl = await uploadSiteIcon(file);
      setSettings((current) => ({ ...current, iconUrl }));
      setMessage("アイコンを準備しました。「変更を保存」で公開されます。");
    } catch (error) { setMessage(errorMessage(error, "アイコン画像を準備できませんでした。")); }
    finally { setIsUploading(false); }
  };

  const logout = async () => {
    await fetch("/api/admin/site-settings", { method: "DELETE" }).catch(() => undefined);
    setSession(null); setScreen("login"); setMessage("");
  };

  if (screen === "checking") return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><p className="animate-pulse text-sm font-bold text-cyan-200">管理画面を確認中…</p></main>;
  if (screen === "login") return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#164e63_0%,#020617_48%)] p-4 text-white">
      <form onSubmit={login} className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Game Fields Admin</p><h1 className="mt-2 text-3xl font-black">サイト管理</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">管理者アカウントでログインしてください。ログイン状態はこのブラウザに12時間だけ保持されます。</p>
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-black/25 p-1" role="tablist" aria-label="ログイン方法">
          <button type="button" role="tab" aria-selected={loginMethod === "account"} onClick={() => { setLoginMethod("account"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginMethod === "account" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"}`}>メールでログイン</button>
          <button type="button" role="tab" aria-selected={loginMethod === "master"} onClick={() => { setLoginMethod("master"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginMethod === "master" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"}`}>マスターパスワード</button>
        </div>
        {loginMethod === "account" ? <label className="mt-5 block text-sm font-bold text-slate-200">メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label> : <p className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">初回登録や緊急時は、環境変数に設定したマスターパスワードでログインできます。</p>}
        <label className="mt-4 block text-sm font-bold text-slate-200">パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus={loginMethod === "master"} className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label>
        {message && <p role="alert" className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{message}</p>}
        <button type="submit" disabled={!password || (loginMethod === "account" && !email.trim()) || isSaving} className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40">{isSaving ? "確認中…" : "管理画面を開く"}</button>
        <Link href="/games" className="mt-4 block text-center text-sm font-bold text-slate-400 hover:text-white">ゲームロビーへ戻る</Link>
      </form>
    </main>
  );

  if (screen === "mfa") return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#164e63_0%,#020617_48%)] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Two-factor authentication</p>
        <h1 className="mt-2 text-2xl font-black">{mfaMode === "enroll" ? "パスキーを登録" : "パスキーで本人確認"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{mfaMode === "enroll" ? "この管理者にはパスキーがありません。Windows Hello、スマートフォン、またはセキュリティキーを登録してください。" : "端末のPIN・指紋・顔認証などを使ってログインを完了します。"}</p>
        <button type="button" onClick={() => void completePasskey()} disabled={isSaving} className="mt-6 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{isSaving ? "確認中…" : mfaMode === "enroll" ? "パスキーを登録する" : "パスキーで続ける"}</button>
        {mfaMode === "login" && <form onSubmit={useRecoveryCode} className="mt-6 border-t border-white/10 pt-5"><label className="block text-sm font-bold text-slate-200">パスキーを使えない場合<input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="復旧コード" autoComplete="one-time-code" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 font-mono text-white outline-none focus:border-cyan-300" /></label><button type="submit" disabled={!recoveryCode.trim() || isSaving} className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10 disabled:opacity-40">復旧コードでログイン</button></form>}
        {message && <p role="alert" className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{message}</p>}
        <button type="button" onClick={() => { setScreen("login"); setMfaOptions(null); setMessage(""); }} className="mt-4 w-full text-sm font-bold text-slate-400 hover:text-white">ログイン方法を選び直す</button>
      </section>
    </main>
  );

  if (screen === "recovery-codes") return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white"><section className="w-full max-w-lg rounded-2xl border border-amber-300/25 bg-slate-900 p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Recovery codes</p><h1 className="mt-2 text-2xl font-black">復旧コードを保存してください</h1><p className="mt-3 text-sm leading-6 text-slate-300">パスキーを使えないときに、各コードを1回だけ使えます。この画面を閉じると再表示できません。</p><pre className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-4 text-center font-mono text-sm">{issuedRecoveryCodes.map((code) => <span key={code}>{code}</span>)}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(issuedRecoveryCodes.join("\n"))} className="mt-4 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10">すべてコピー</button>{message && <p role="alert" className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{message}</p>}<button type="button" onClick={() => void continueAfterRecoveryCodes()} className="mt-3 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 hover:bg-cyan-200">保存したので管理画面へ進む</button></section></main>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/90"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Game Fields Admin</p><h1 className="text-2xl font-black">サイト管理</h1></div><div className="flex gap-2"><Link href="/games" className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10">サイトを見る</Link><button type="button" onClick={() => void logout()} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">ログアウト</button></div></div></header>
      {session?.scope === "recovery" && <div className="border-b border-amber-300/20 bg-amber-300/10 px-4 py-3 text-center text-sm font-bold text-amber-100">復旧モード：15分間、管理者アカウントの復旧と診断だけを行えます。設定変更はできません。</div>}
      <nav className="border-b border-white/10 bg-slate-900/60" aria-label="管理画面メニュー"><div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">{([['dashboard', 'ダッシュボード'], ['site-settings', 'サイト設定'], ['games', 'ゲーム公開管理'], ['vocabulary', '単語候補'], ['hyperparameters', 'ハイパラ管理'], ['accounts', '管理者アカウント'], ['audit', '監査ログ']] as const).filter(([value]) => session?.scope === "full" || value === "dashboard" || value === "accounts" || value === "audit").map(([value, label]) => <button key={value} type="button" aria-current={section === value ? "page" : undefined} onClick={() => setSection(value)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${section === value ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>{label}</button>)}</div></nav>
      {section === "dashboard" && <AdminDashboard onAuthExpired={authExpired} />}
      {section === "games" && <GameOperationsPanel onAuthExpired={authExpired} />}
      {section === "vocabulary" && <VocabularyDraftsPanel
        onAuthExpired={authExpired}
        showPreviewMigrations={showPreviewVocabularyMigrations}
      />}
      {section === "hyperparameters" && <AdminHyperparametersPanel onAuthExpired={authExpired} />}
      {section === "accounts" && <AdminAccountsPanel onAuthExpired={authExpired} recoveryMode={session?.scope === "recovery"} currentEmail={session?.email ?? null} />}
      {section === "audit" && <AdminAuditPanel onAuthExpired={authExpired} />}
      {section === "site-settings" &&
      <form onSubmit={save} className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
          <div><h2 className="text-xl font-black">基本情報</h2><p className="mt-1 text-sm leading-6 text-slate-400">ブラウザのタブや検索結果で使うサイト情報です。</p></div>
          <TextField label="サイト名" value={settings.siteName} maxLength={siteSettingsLimits.siteName} onChange={(siteName) => setSettings((current) => ({ ...current, siteName }))} help="サービスの短い名前。サイト識別や共有情報に使います。" />
          <TextField label="検索結果のタイトル" value={settings.searchTitle} maxLength={siteSettingsLimits.searchTitle} onChange={(searchTitle) => setSettings((current) => ({ ...current, searchTitle }))} help="トップページが検索結果に表示されるときのタイトル候補です。" />
          <label className="block text-sm font-bold text-slate-200">検索結果の説明文<textarea value={settings.searchDescription} maxLength={siteSettingsLimits.searchDescription} onChange={(event) => setSettings((current) => ({ ...current, searchDescription: event.target.value }))} rows={4} className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/25 px-4 py-3 leading-6 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /><span className="mt-1 flex justify-between gap-3 text-xs font-normal text-slate-400"><span>検索サービスが検索語に合わせて別の文を表示する場合があります。</span><span>{settings.searchDescription.length}/{siteSettingsLimits.searchDescription}</span></span></label>
          <div className="border-t border-white/10 pt-5"><h2 className="text-xl font-black">サイトアイコン</h2><p className="mt-1 text-sm leading-6 text-slate-400">ブラウザのタブやブックマークに表示されます。画像は中央を正方形に切り抜き、192×192pxに整えます。</p><div className="mt-4 flex flex-wrap items-center gap-4"><span className="h-20 w-20 rounded-2xl border border-white/20 bg-slate-900 bg-cover bg-center shadow-lg" style={{ backgroundImage: `url(${settings.iconUrl || "/site-icon"})` }} aria-label="現在選択中のサイトアイコン" role="img" /><div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-200">{isUploading ? "画像を準備中…" : "画像を選ぶ"}<input type="file" accept="image/*" disabled={isUploading || isSaving} onChange={(event) => void selectIcon(event)} className="sr-only" /></label><button type="button" disabled={!settings.iconUrl || isUploading} onClick={() => setSettings((current) => ({ ...current, iconUrl: null }))} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold disabled:opacity-40">標準に戻す</button></div></div><p className="mt-3 text-xs text-slate-500">PNG・JPEG・WebPなど、元画像10MBまで。公開用にはPNGへ変換します。</p></div>
        </section>
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl"><p className="text-xs font-bold text-slate-500">検索結果のプレビュー</p><div className="mt-4 flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${settings.iconUrl || "/site-icon"})` }} aria-hidden="true" /><div><p className="text-sm text-slate-800">{settings.siteName || "サイト名"}</p><p className="text-xs text-emerald-800">https://www.game-fields.com</p></div></div><p className="mt-3 text-xl leading-7 text-blue-700">{settings.searchTitle || "検索結果のタイトル"}</p><p className="mt-2 text-sm leading-6 text-slate-600">{settings.searchDescription || "検索結果の説明文"}</p><p className="mt-3 text-[11px] leading-5 text-slate-400">表示はイメージです。検索サービスごとに見た目や文章が変わります。</p></section>
          {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">{message}</p>}
          <button type="submit" disabled={isSaving || isUploading || !settings.siteName.trim() || !settings.searchTitle.trim() || !settings.searchDescription.trim()} className="w-full rounded-xl bg-amber-300 px-4 py-3.5 font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-40">{isSaving ? "保存中…" : "変更を保存"}</button>
          {settings.updatedAt && <p className="text-center text-xs text-slate-500">最終保存：{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(settings.updatedAt))}</p>}
        </aside>
      </form>
      }
    </main>
  );
}

function TextField({ label, value, maxLength, onChange, help }: { label: string; value: string; maxLength: number; onChange: (value: string) => void; help: string }) {
  return <label className="block text-sm font-bold text-slate-200">{label}<input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /><span className="mt-1 flex justify-between gap-3 text-xs font-normal text-slate-400"><span>{help}</span><span>{value.length}/{maxLength}</span></span></label>;
}
