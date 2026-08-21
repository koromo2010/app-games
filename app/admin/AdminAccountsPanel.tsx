"use client";

import { type FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { siteAdminAccountMaximumCount, siteAdminPasswordMaximumLength, siteAdminPasswordMinimumLength } from "@/lib/site-admin-account-constants";
import { addSiteAdminPasskey, ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import { PlayerDebugAccessPanel } from "./PlayerDebugAccessPanel";

type SiteAdminAccount = {
  email: string;
  receiveAlerts: boolean;
  receiveContacts: boolean;
  matchingPlayerName: string | null;
  debugAccessEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  passkeyCount: number;
  platformPasskeyCount: number;
  externalPasskeyCount: number;
  unknownPasskeyCount: number;
  unusedRecoveryCodeCount: number;
  totpEnabled: boolean;
  totpEnrollmentPending: boolean;
};

type TotpEnrollment = { secret: string; provisioningUri: string };

const accountMessages: Record<string, string> = {
  SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED: "管理者アカウントの保存先（Postgres）が設定されていません。",
  SITE_ADMIN_EMAIL_INVALID: "正しいメールアドレスを入力してください。",
  SITE_ADMIN_ACCOUNT_PASSWORD_INVALID: `パスワードは${siteAdminPasswordMinimumLength}〜${siteAdminPasswordMaximumLength}文字で入力してください。`,
  SITE_ADMIN_ACCOUNT_LIMIT_REACHED: `管理者アカウントは最大${siteAdminAccountMaximumCount}件です。`,
  SITE_ADMIN_ACCOUNTS_LOAD_FAILED: "管理者アカウントを読み込めませんでした。",
  SITE_ADMIN_ACCOUNT_SAVE_FAILED: "管理者アカウントを保存できませんでした。",
  SITE_ADMIN_ACCOUNT_DELETE_FAILED: "管理者アカウントを削除できませんでした。",
  SITE_ADMIN_PASSKEY_ADD_FAILED: "パスキーを追加できませんでした。",
  SITE_ADMIN_PASSKEY_LIMIT_REACHED: "登録できるパスキー数の上限に達しています。",
  SITE_ADMIN_PLATFORM_PASSKEY_REQUIRED: "Windows Helloなど、この端末内のパスキーを選んでください。USBキーや別端末は登録できません。",
  SITE_ADMIN_PASSKEY_CLEANUP_FAILED: "古い外部キー登録を削除できませんでした。",
  SITE_ADMIN_MFA_RESET_FAILED: "パスキーを初期化できませんでした。",
  SITE_ADMIN_RECOVERY_REQUIRED: "他の管理者のパスキー初期化は復旧モードでのみ実行できます。",
  INVALID_RECOVERY_CODE: "復旧コードが違うか、すでに使用されています。",
  SITE_ADMIN_CHALLENGE_EXPIRED: "本人確認の有効期限が切れました。もう一度パスキー初期化を実行してください。",
  SITE_ADMIN_TOTP_ALREADY_ENROLLED: "Authenticatorはすでに設定されています。再設定する場合は先に無効化してください。",
  SITE_ADMIN_TOTP_UNAVAILABLE: "Authenticatorの設定を利用できません。復旧コードまたはパスキーを使用してください。",
  INVALID_TOTP_CODE: "Authenticatorの6桁コードが違うか、すでに使用されています。",
  SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED: "メール通知の設定を保存できませんでした。",
  SITE_ADMIN_ACCOUNT_NOT_FOUND: "対象の管理者アカウントが見つかりません。",
};

function messageFor(code: string | undefined, fallback: string) {
  return code ? accountMessages[code] ?? fallback : fallback;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function AdminAccountsPanel({ onAuthExpired, onPasskeySessionEstablished, onRecoveryCodeSessionEstablished, recoveryMode, recoveryLogin, currentEmail }: {
  onAuthExpired: () => void;
  onPasskeySessionEstablished: () => void;
  onRecoveryCodeSessionEstablished: () => void;
  recoveryMode: boolean;
  recoveryLogin: boolean;
  currentEmail: string | null;
}) {
  const [accounts, setAccounts] = useState<SiteAdminAccount[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [receiveAlerts, setReceiveAlerts] = useState(false);
  const [receiveContacts, setReceiveContacts] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [removingIncompatiblePasskeys, setRemovingIncompatiblePasskeys] = useState(false);
  const [resettingMfaEmail, setResettingMfaEmail] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);
  const [enrollingTotp, setEnrollingTotp] = useState(false);
  const [resettingTotp, setResettingTotp] = useState(false);
  const [totpEnrollment, setTotpEnrollment] = useState<TotpEnrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/accounts", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNTS_LOAD_FAILED");
      setAccounts(data.accounts);
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "管理者アカウントを読み込めませんでした。"));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [onAuthExpired]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password !== passwordConfirmation) { setMessage("確認用パスワードが一致しません。"); return; }
    setSaving(true); setMessage("");
    try {
      if (!recoveryMode) await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, receiveAlerts, receiveContacts }),
      });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNT_SAVE_FAILED");
      const alreadyExists = accounts.some((account) => account.email === email.trim().toLocaleLowerCase("en-US"));
      setAccounts(data.accounts); setEmail(""); setPassword(""); setPasswordConfirmation(""); setReceiveAlerts(false); setReceiveContacts(false);
      setMessage(alreadyExists ? "管理者アカウントのパスワードを更新しました。" : "管理者アカウントを登録しました。次回からメールアドレスでログインできます。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "管理者アカウントを保存できませんでした。"));
    } finally {
      setSaving(false);
    }
  };

  const updateSubscriptions = async (account: SiteAdminAccount, changes: Partial<Pick<SiteAdminAccount, "receiveAlerts" | "receiveContacts">>) => {
    if (updatingEmail || recoveryMode) return;
    setUpdatingEmail(account.email); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, receiveAlerts: changes.receiveAlerts ?? account.receiveAlerts, receiveContacts: changes.receiveContacts ?? account.receiveContacts }) });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED");
      setAccounts(data.accounts); setMessage("メール通知の設定を保存しました。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "メール通知の設定を保存できませんでした。"));
    } finally { setUpdatingEmail(null); }
  };

  const remove = async (targetEmail: string) => {
    if (deletingEmail || !window.confirm(`${targetEmail} を管理者から削除しますか？`)) return;
    setDeletingEmail(targetEmail); setMessage("");
    try {
      if (!recoveryMode) await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNT_DELETE_FAILED");
      setAccounts(data.accounts); setMessage("管理者アカウントを削除しました。すでにログイン中のブラウザは、最長12時間でログアウトします。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "管理者アカウントを削除できませんでした。"));
    } finally {
      setDeletingEmail(null);
    }
  };

  const addPasskey = async () => {
    if (addingPasskey) return;
    setAddingPasskey(true); setMessage("");
    try {
      await addSiteAdminPasskey();
      if (recoveryLogin) onPasskeySessionEstablished();
      setMessage("この端末のパスキーを追加しました。次回はWindows Helloでログインできます。");
      const response = await fetch("/api/admin/accounts", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[] } | null;
      if (response.ok && data?.accounts) setAccounts(data.accounts);
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "パスキーを追加できませんでした。"));
    } finally { setAddingPasskey(false); }
  };

  const removeIncompatiblePasskeys = async () => {
    if (
      removingIncompatiblePasskeys
      || !window.confirm("この端末では使えないUSB・外部セキュリティキーの登録を削除しますか？\nWindows Helloの登録は残ります。")
    ) return;
    setRemovingIncompatiblePasskeys(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-incompatible-passkeys" }),
      });
      const data = await response.json().catch(() => null) as { removedCount?: number; error?: string } | null;
      if (!response.ok || typeof data?.removedCount !== "number") {
        throw new Error(data?.error || "SITE_ADMIN_PASSKEY_CLEANUP_FAILED");
      }
      const accountsResponse = await fetch("/api/admin/accounts", { cache: "no-store" });
      const accountsData = await accountsResponse.json().catch(() => null) as { accounts?: SiteAdminAccount[] } | null;
      if (accountsResponse.ok && accountsData?.accounts) setAccounts(accountsData.accounts);
      setMessage(`${data.removedCount}件の古い外部キー登録を削除しました。`);
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "古い外部キー登録を削除できませんでした。"));
    } finally {
      setRemovingIncompatiblePasskeys(false);
    }
  };

  const resetMfa = async (targetEmail: string) => {
    if (resettingMfaEmail || !window.confirm(`${targetEmail} のパスキー、Authenticator、復旧コードをすべて無効にしますか？\n次回のメールログイン時に、新しいパスキーの登録が必要になります。`)) return;
    setResettingMfaEmail(targetEmail); setMessage("");
    try {
      const stepUpSession = !recoveryMode ? await ensureSiteAdminStepUp() : null;
      if (stepUpSession?.method === "recovery-code") onRecoveryCodeSessionEstablished();
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-mfa", email: targetEmail }),
      });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_MFA_RESET_FAILED");
      setAccounts(data.accounts);
      setMessage(recoveryMode
        ? "MFAをリセットしました。復旧モードを無効化した後、メールとパスワードでログインし、新しいパスキーを登録してください。"
        : stepUpSession?.method === "recovery-code"
          ? "パスキーを初期化しました。続けて、このPCのWindows Helloを登録して復旧を完了してください。"
          : "パスキーを初期化しました。一度ログアウトし、メールとパスワードでログインし直して新しいパスキーを登録してください。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, recoveryMode ? "MFAをリセットできませんでした。" : "パスキーを初期化できませんでした。"));
    } finally {
      setResettingMfaEmail(null);
    }
  };

  const regenerateRecoveryCodes = async () => {
    if (saving || !window.confirm("現在の未使用復旧コードをすべて無効にして、新しいコードを発行しますか？")) return;
    setSaving(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "regenerate-recovery-codes" }) });
      const data = await response.json().catch(() => null) as { recoveryCodes?: string[]; error?: string } | null;
      if (!response.ok || !data?.recoveryCodes) throw new Error(data?.error || "SITE_ADMIN_RECOVERY_CODES_FAILED");
      setRecoveryCodes(data.recoveryCodes); setMessage("新しい復旧コードを発行しました。安全な場所へ保存してください。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "復旧コードを再発行できませんでした。"));
    } finally { setSaving(false); }
  };

  const refreshAccounts = async () => {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return false; }
    if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNTS_LOAD_FAILED");
    setAccounts(data.accounts);
    return true;
  };

  const beginTotpEnrollment = async () => {
    if (enrollingTotp || recoveryMode) return;
    setEnrollingTotp(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin-totp-enrollment" }) });
      const data = await response.json().catch(() => null) as { enrollment?: TotpEnrollment; error?: string } | null;
      if (!response.ok || !data?.enrollment?.secret || !data.enrollment.provisioningUri) throw new Error(data?.error || "SITE_ADMIN_TOTP_ENROLLMENT_FAILED");
      setTotpEnrollment(data.enrollment); setTotpCode("");
      setMessage("Authenticatorへセットアップキーを登録し、表示された6桁コードで確認してください。キーはこの画面を閉じると再表示できません。");
      await refreshAccounts();
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "Authenticatorを追加できませんでした。"));
    } finally { setEnrollingTotp(false); }
  };

  const confirmTotpEnrollment = async (event: FormEvent) => {
    event.preventDefault();
    if (!totpEnrollment || !/^\d{6}$/.test(totpCode) || enrollingTotp) return;
    setEnrollingTotp(true); setMessage("");
    try {
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-totp-enrollment", totpCode }) });
      const data = await response.json().catch(() => null) as { verified?: boolean; error?: string } | null;
      if (!response.ok || !data?.verified) throw new Error(data?.error || "INVALID_TOTP_CODE");
      setTotpEnrollment(null); setTotpCode("");
      await refreshAccounts();
      setMessage("Authenticatorを追加しました。次回からこの端末以外でも6桁コードでログインできます。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "Authenticatorを確認できませんでした。"));
    } finally { setEnrollingTotp(false); }
  };

  const cancelTotpEnrollment = async () => {
    if (!totpEnrollment || enrollingTotp) return;
    setEnrollingTotp(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel-totp-enrollment" }) });
      const data = await response.json().catch(() => null) as { cancelled?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "SITE_ADMIN_TOTP_ENROLLMENT_FAILED");
      setTotpEnrollment(null); setTotpCode("");
      await refreshAccounts();
      setMessage("Authenticatorの設定を取り消しました。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "Authenticatorの設定を取り消せませんでした。"));
    } finally { setEnrollingTotp(false); }
  };

  const resetTotp = async () => {
    if (resettingTotp || !window.confirm("Authenticatorの登録を無効にしますか？ 次回はパスキーまたは復旧コードでログインし、必要なら新しいAuthenticatorを設定します。")) return;
    setResettingTotp(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset-totp" }) });
      const data = await response.json().catch(() => null) as { reset?: boolean; error?: string } | null;
      if (!response.ok || !data?.reset) throw new Error(data?.error || "SITE_ADMIN_TOTP_RESET_FAILED");
      await refreshAccounts();
      setMessage("Authenticatorを無効にしました。必要なら「Authenticatorを追加」から新しい端末を登録してください。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "Authenticatorを再設定できませんでした。"));
    } finally { setResettingTotp(false); }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-black">登録済みの管理者</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">登録したメールアドレスとパスワードで、この管理画面へログインできます。同じメールを登録したプレイヤーにはデバッグ権限が自動付与されます。最大{siteAdminAccountMaximumCount}件まで登録できます。</p>
        </div>
        {recoveryLogin && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50"><p className="font-black">復旧コードでログインしています</p><p className="mt-1">復旧を完了するには、このPCのWindows Helloを新しいパスキーとして登録してください。登録後は、古いUSBキー登録だけを安全に削除できます。</p><button type="button" onClick={() => void addPasskey()} disabled={addingPasskey} className="mt-3 w-full rounded-lg bg-amber-300 px-3 py-2.5 font-black text-slate-950 hover:bg-amber-200 disabled:opacity-40">{addingPasskey ? "Windows Helloを確認中…" : "Windows Helloを登録して復旧を完了"}</button></div>}
        {loading ? <p className="mt-6 animate-pulse text-sm text-cyan-200">読み込み中…</p> : accounts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">まだ管理者メールはありません。右のフォームから最初のアカウントを登録してください。</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {accounts.map((account) => (
              <li key={account.email} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate font-bold text-white">{account.email}</p><p className="mt-1 text-xs text-slate-400">Windows Hello等 {account.platformPasskeyCount}件 ・ 外部キー {account.externalPasskeyCount}件{account.unknownPasskeyCount > 0 ? ` ・ 種別不明 ${account.unknownPasskeyCount}件` : ""} ・ Authenticator {account.totpEnabled ? "設定済み" : account.totpEnrollmentPending ? "設定中" : "未設定"} ・ 未使用復旧コード {account.unusedRecoveryCodeCount}件</p><p className="mt-1 text-xs text-slate-500">登録 {formatDate(account.createdAt)} ・ 更新 {formatDate(account.updatedAt)}</p><p className={`mt-2 text-xs font-bold ${account.debugAccessEnabled ? "text-emerald-300" : "text-amber-200"}`}>{account.debugAccessEnabled ? `デバッグ権限：${account.matchingPlayerName} に付与中` : "デバッグ権限：同じメールのプレイヤーは未登録"}</p></div><div className="flex flex-wrap gap-2">{!recoveryMode && currentEmail === account.email && <button type="button" onClick={() => void addPasskey()} disabled={addingPasskey || removingIncompatiblePasskeys || Boolean(deletingEmail) || Boolean(updatingEmail) || Boolean(resettingMfaEmail) || enrollingTotp || resettingTotp} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-40">{addingPasskey ? "追加中…" : "パスキー追加"}</button>}{!recoveryMode && currentEmail === account.email && <button type="button" onClick={() => void (account.totpEnabled ? resetTotp() : beginTotpEnrollment())} disabled={addingPasskey || Boolean(resettingMfaEmail) || enrollingTotp || resettingTotp} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-40">{enrollingTotp || resettingTotp ? "処理中…" : account.totpEnabled ? "Authenticatorを再設定" : account.totpEnrollmentPending ? "Authenticator設定をやり直す" : "Authenticatorを追加"}</button>}{!recoveryMode && currentEmail === account.email && account.platformPasskeyCount > 0 && account.externalPasskeyCount > 0 && <button type="button" onClick={() => void removeIncompatiblePasskeys()} disabled={removingIncompatiblePasskeys || addingPasskey || Boolean(resettingMfaEmail) || enrollingTotp || resettingTotp} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">{removingIncompatiblePasskeys ? "整理中…" : "古い外部キー登録を削除"}</button>}{!recoveryMode && currentEmail === account.email && (account.passkeyCount > 0 || account.totpEnabled) && <button type="button" onClick={() => void resetMfa(account.email)} disabled={Boolean(resettingMfaEmail) || addingPasskey || removingIncompatiblePasskeys || enrollingTotp || resettingTotp} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">{resettingMfaEmail === account.email ? "初期化中…" : "MFAを初期化"}</button>}{recoveryMode && (account.passkeyCount > 0 || account.totpEnabled) && <button type="button" onClick={() => void resetMfa(account.email)} disabled={Boolean(resettingMfaEmail)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">{resettingMfaEmail === account.email ? "リセット中…" : "MFAを再設定"}</button>}{!recoveryMode && <button type="button" onClick={() => void remove(account.email)} disabled={Boolean(deletingEmail) || Boolean(updatingEmail) || Boolean(resettingMfaEmail) || enrollingTotp || resettingTotp} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-200 hover:bg-rose-300/10 disabled:opacity-40">{deletingEmail === account.email ? "削除中…" : "削除"}</button>}</div></div>
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-sm sm:flex-row sm:gap-5"><label className="flex cursor-pointer items-center gap-2 text-slate-200"><input type="checkbox" checked={account.receiveAlerts} disabled={recoveryMode || Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveAlerts: event.target.checked })} className="h-4 w-4 accent-cyan-300" />運用アラートを受け取る</label><label className="flex cursor-pointer items-center gap-2 text-slate-200"><input type="checkbox" checked={account.receiveContacts} disabled={recoveryMode || Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveContacts: event.target.checked })} className="h-4 w-4 accent-cyan-300" />問い合わせ・報告を受け取る</label>{updatingEmail === account.email && <span className="text-xs text-cyan-200">保存中…</span>}</div>
              </li>
            ))}
          </ul>
        )}
        <PlayerDebugAccessPanel onAuthExpired={onAuthExpired} recoveryMode={recoveryMode} />
      </section>

      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        {!recoveryMode && <form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <h2 className="text-lg font-black">管理者を追加・更新</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">登録済みのメールアドレスを入力すると、パスワードを更新します。同じメールのプレイヤーアカウントがあれば、デバッグ操作も許可されます。</p>
          <label className="mt-5 block text-sm font-bold text-slate-200">メールアドレス<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label>
          <label className="mt-4 block text-sm font-bold text-slate-200">パスワード<input type="password" required minLength={siteAdminPasswordMinimumLength} maxLength={siteAdminPasswordMaximumLength} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /><span className="mt-1 block text-xs font-normal text-slate-400">{siteAdminPasswordMinimumLength}文字以上。登録後にパスワードを画面で確認することはできません。</span></label>
          <label className="mt-4 block text-sm font-bold text-slate-200">パスワード（確認）<input type="password" required minLength={siteAdminPasswordMinimumLength} maxLength={siteAdminPasswordMaximumLength} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label>
          <fieldset className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4"><legend className="px-1 text-sm font-black text-slate-200">このメールで受け取るもの</legend><label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={receiveAlerts} onChange={(event) => setReceiveAlerts(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-300" /><span><b className="block">運用アラート</b><span className="mt-0.5 block text-xs leading-5 text-slate-400">ストレージ容量など、サイト運営上の警告を送ります。</span></span></label><label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={receiveContacts} onChange={(event) => setReceiveContacts(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-300" /><span><b className="block">問い合わせ・報告</b><span className="mt-0.5 block text-xs leading-5 text-slate-400">問い合わせフォーム、改善要望、バグ報告と、その追記内容を送ります。</span></span></label></fieldset>
          <button type="submit" disabled={saving || !email.trim() || !password || !passwordConfirmation} className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{saving ? "保存中…" : "管理者を保存"}</button>
        </form>}
        {recoveryMode && <section className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-sm leading-6 text-amber-50"><h2 className="font-black">復旧モードで許可される操作</h2><p className="mt-2">管理者一覧の確認と「MFAを再設定」だけです。管理者の追加・削除、パスワード変更、通知設定変更はAPI側でも拒否されます。</p></section>}
        {!recoveryMode && currentEmail && <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="font-black">復旧コード</h2><p className="mt-2 text-xs leading-5 text-slate-400">パスキーを失った場合に使う1回限りのコードです。再発行すると以前のコードは無効になります。</p><button type="button" onClick={() => void regenerateRecoveryCodes()} disabled={saving} className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold hover:bg-white/10 disabled:opacity-40">復旧コードを再発行</button>{recoveryCodes.length > 0 && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3"><pre className="grid grid-cols-2 gap-1 text-center font-mono text-xs text-amber-50">{recoveryCodes.map((code) => <span key={code}>{code}</span>)}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\n"))} className="mt-3 w-full rounded-lg border border-amber-100/20 px-3 py-2 text-xs font-bold text-amber-50">すべてコピー</button></div>}</section>}
        {totpEnrollment && <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5"><h2 className="font-black text-cyan-50">Authenticatorを設定</h2><p className="mt-2 text-xs leading-5 text-cyan-50">AuthenticatorアプリでQRコードを読み取るか、「セットアップキーを入力」を選んでください。この値はこの画面を閉じると再表示できません。</p><div role="img" aria-label="Authenticator登録用QRコード" className="mx-auto mt-4 w-fit rounded-xl bg-white p-3"><QRCodeSVG value={totpEnrollment.provisioningUri} size={192} level="M" marginSize={4} /></div><p className="mt-2 text-center text-[11px] leading-5 text-cyan-50">QRコードはこのブラウザ内で登録用URIから生成します。外部サービスへ送信せず、画像や値を保存しません。</p><label className="mt-4 block text-xs font-bold text-cyan-50">セットアップキー（QRコードを使えない場合）<code className="mt-2 block break-all rounded-lg bg-slate-950/70 p-3 font-mono text-sm text-white select-all">{totpEnrollment.secret}</code></label><button type="button" onClick={() => void navigator.clipboard.writeText(totpEnrollment.secret)} className="mt-2 w-full rounded-lg border border-cyan-100/25 px-3 py-2 text-xs font-bold text-cyan-50">セットアップキーをコピー</button><details className="mt-3 text-xs text-cyan-50"><summary className="cursor-pointer font-bold">登録用URIを表示</summary><code className="mt-2 block break-all rounded-lg bg-slate-950/70 p-3 font-mono text-[10px] text-white select-all">{totpEnrollment.provisioningUri}</code></details><form onSubmit={confirmTotpEnrollment} className="mt-4 border-t border-cyan-100/20 pt-4"><label className="block text-xs font-bold text-cyan-50">Authenticatorの6桁コード<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="mt-2 w-full rounded-lg border border-cyan-100/25 bg-slate-950/70 px-3 py-2.5 font-mono tracking-[0.25em] text-white outline-none" /></label><button type="submit" disabled={!/^\d{6}$/.test(totpCode) || enrollingTotp} className="mt-3 w-full rounded-lg bg-cyan-300 px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40">{enrollingTotp ? "確認中…" : "Authenticatorを有効にする"}</button></form><button type="button" onClick={() => void cancelTotpEnrollment()} disabled={enrollingTotp} className="mt-3 w-full text-xs font-bold text-cyan-100 hover:text-white disabled:opacity-40">設定を取り消す</button></section>}
        <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50"><h2 className="font-black">マスターパスワードは復旧専用です</h2><p className="mt-2">最初の管理者登録後は通常ログインに使えません。緊急時だけVercelで復旧モードを有効にし、管理者アカウントを修復したら再び無効にします。</p></section>
        {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">{message}</p>}
      </aside>
    </div>
  );
}
