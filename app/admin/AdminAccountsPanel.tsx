"use client";

import { type FormEvent, useEffect, useState } from "react";
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
  unusedRecoveryCodeCount: number;
};

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
  SITE_ADMIN_MFA_RESET_FAILED: "パスキーを初期化できませんでした。",
  SITE_ADMIN_RECOVERY_REQUIRED: "他の管理者のパスキー初期化は復旧モードでのみ実行できます。",
  INVALID_RECOVERY_CODE: "復旧コードが違うか、すでに使用されています。",
  SITE_ADMIN_CHALLENGE_EXPIRED: "本人確認の有効期限が切れました。もう一度パスキー初期化を実行してください。",
  SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED: "メール通知の設定を保存できませんでした。",
  SITE_ADMIN_ACCOUNT_NOT_FOUND: "対象の管理者アカウントが見つかりません。",
};

function messageFor(code: string | undefined, fallback: string) {
  return code ? accountMessages[code] ?? fallback : fallback;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function AdminAccountsPanel({ onAuthExpired, onRecoveryCodeSessionEstablished, recoveryMode, currentEmail }: {
  onAuthExpired: () => void;
  onRecoveryCodeSessionEstablished: () => void;
  recoveryMode: boolean;
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
  const [resettingMfaEmail, setResettingMfaEmail] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

  const reloadAccounts = async () => {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNTS_LOAD_FAILED");
    setAccounts(data.accounts);
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/accounts", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNTS_LOAD_FAILED");
      setAccounts(data.accounts);
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage(messageFor(error instanceof Error ? error.message : undefined, "管理者アカウントを読み込めませんでした。"));
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
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, receiveAlerts, receiveContacts }) });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNT_SAVE_FAILED");
      setAccounts(data.accounts); setEmail(""); setPassword(""); setPasswordConfirmation(""); setReceiveAlerts(false); setReceiveContacts(false);
      setMessage("管理者アカウントを保存しました。");
    } catch (error) { setMessage(messageFor(error instanceof Error ? error.message : undefined, "管理者アカウントを保存できませんでした。")); }
    finally { setSaving(false); }
  };

  const updateSubscriptions = async (account: SiteAdminAccount, changes: Partial<Pick<SiteAdminAccount, "receiveAlerts" | "receiveContacts">>) => {
    if (updatingEmail || recoveryMode) return;
    setUpdatingEmail(account.email); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, receiveAlerts: changes.receiveAlerts ?? account.receiveAlerts, receiveContacts: changes.receiveContacts ?? account.receiveContacts }) });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED");
      setAccounts(data.accounts); setMessage("メール通知の設定を保存しました。");
    } catch (error) { setMessage(messageFor(error instanceof Error ? error.message : undefined, "メール通知の設定を保存できませんでした。")); }
    finally { setUpdatingEmail(null); }
  };

  const remove = async (targetEmail: string) => {
    if (deletingEmail || !window.confirm(`${targetEmail} を管理者から削除しますか？`)) return;
    setDeletingEmail(targetEmail); setMessage("");
    try {
      if (!recoveryMode) await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: targetEmail }) });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_ACCOUNT_DELETE_FAILED");
      setAccounts(data.accounts); setMessage("管理者アカウントを削除しました。");
    } catch (error) { setMessage(messageFor(error instanceof Error ? error.message : undefined, "管理者アカウントを削除できませんでした。")); }
    finally { setDeletingEmail(null); }
  };

  const addPasskey = async () => {
    if (addingPasskey) return;
    setAddingPasskey(true); setMessage("");
    try { await addSiteAdminPasskey(); await reloadAccounts(); setMessage("パスキーを追加しました。"); }
    catch (error) { setMessage(messageFor(error instanceof Error ? error.message : undefined, "パスキーを追加できませんでした。")); }
    finally { setAddingPasskey(false); }
  };

  const resetMfa = async (targetEmail: string) => {
    if (resettingMfaEmail || !window.confirm(`${targetEmail} のパスキーと復旧コードをすべて削除します。\n管理者アカウント・パスワード・通知設定は保持されます。続行しますか？`)) return;
    setResettingMfaEmail(targetEmail); setMessage("");
    try {
      const stepUpSession = !recoveryMode ? await ensureSiteAdminStepUp() : null;
      if (stepUpSession?.method === "recovery-code") onRecoveryCodeSessionEstablished();
      const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset-mfa", email: targetEmail }) });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_MFA_RESET_FAILED");
      setAccounts(data.accounts);
      setMessage(recoveryMode
        ? "MFAをリセットしました。復旧モードを無効化した後、メールとパスワードでログインし、新しいパスキーを登録してください。"
        : stepUpSession?.method === "recovery-code"
          ? "パスキーを初期化しました。続けて、このPCのWindows Helloを登録して復旧を完了してください。"
          : "パスキーを初期化しました。一度ログアウトし、メールとパスワードでログインし直して新しいパスキーを登録してください。");
    } catch (error) { setMessage(messageFor(error instanceof Error ? error.message : undefined, "パスキーを初期化できませんでした。")); }
    finally { setResettingMfaEmail(null); }
  };

  const regenerateRecoveryCodes = async () => {
    if (saving || !window.confirm("現在の未使用復旧コードをすべて無効にして、新しいコードを発行しますか？")) return;
    setSaving(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "regenerate-recovery-codes" }) });
      const data = await response.json().catch(() => null) as { recoveryCodes?: string[]; error?: string } | null;
      if (!response.ok || !data?.recoveryCodes) throw new Error(data?.error || "SITE_ADMIN_RECOVERY_CODES_FAILED");
      setRecoveryCodes(data.recoveryCodes); setMessage("新しい復旧コードを発行しました。");
    } catch { setMessage("復旧コードを再発行できませんでした。"); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <h2 className="text-xl font-black">登録済みの管理者</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">管理者アカウントは最大{siteAdminAccountMaximumCount}件まで登録できます。</p>
        {loading ? <p className="mt-6 text-sm text-cyan-200">読み込み中…</p> : <ul className="mt-6 space-y-3">{accounts.map((account) => {
          const canReset = recoveryMode || currentEmail === account.email;
          return <li key={account.email} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><p className="truncate font-bold">{account.email}</p><p className="mt-1 text-xs text-slate-400">パスキー {account.passkeyCount}件 ・ 未使用復旧コード {account.unusedRecoveryCodeCount}件</p><p className="mt-1 text-xs text-slate-500">登録 {formatDate(account.createdAt)} ・ 更新 {formatDate(account.updatedAt)}</p><p className={`mt-2 text-xs font-bold ${account.debugAccessEnabled ? "text-emerald-300" : "text-amber-200"}`}>{account.debugAccessEnabled ? `デバッグ権限：${account.matchingPlayerName} に付与中` : "デバッグ権限：同じメールのプレイヤーは未登録"}</p></div>
              <div className="flex flex-wrap gap-2">
                {!recoveryMode && currentEmail === account.email && <button type="button" onClick={() => void addPasskey()} disabled={addingPasskey || Boolean(resettingMfaEmail)} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm font-bold text-cyan-200 disabled:opacity-40">{addingPasskey ? "追加中…" : "パスキー追加"}</button>}
                {canReset && account.passkeyCount > 0 && <button type="button" onClick={() => void resetMfa(account.email)} disabled={Boolean(resettingMfaEmail)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm font-bold text-amber-200 disabled:opacity-40">{resettingMfaEmail === account.email ? "初期化中…" : "パスキー初期化"}</button>}
                <button type="button" onClick={() => void remove(account.email)} disabled={Boolean(deletingEmail) || Boolean(resettingMfaEmail)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-200 disabled:opacity-40">{deletingEmail === account.email ? "削除中…" : "削除"}</button>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-sm sm:flex-row sm:gap-5"><label className="flex items-center gap-2"><input type="checkbox" checked={account.receiveAlerts} disabled={recoveryMode || Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveAlerts: event.target.checked })} />運用アラートを受け取る</label><label className="flex items-center gap-2"><input type="checkbox" checked={account.receiveContacts} disabled={recoveryMode || Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveContacts: event.target.checked })} />問い合わせ内容を受け取る</label></div>
          </li>;
        })}</ul>}
        <PlayerDebugAccessPanel onAuthExpired={onAuthExpired} recoveryMode={recoveryMode} />
      </section>
      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-lg font-black">管理者を追加・更新</h2><label className="mt-5 block text-sm font-bold">メールアドレス<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3" /></label><label className="mt-4 block text-sm font-bold">パスワード<input type="password" required minLength={siteAdminPasswordMinimumLength} maxLength={siteAdminPasswordMaximumLength} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3" /></label><label className="mt-4 block text-sm font-bold">パスワード（確認）<input type="password" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3" /></label><div className="mt-5 space-y-3"><label className="flex gap-2"><input type="checkbox" checked={receiveAlerts} onChange={(event) => setReceiveAlerts(event.target.checked)} />運用アラート</label><label className="flex gap-2"><input type="checkbox" checked={receiveContacts} onChange={(event) => setReceiveContacts(event.target.checked)} />問い合わせ内容</label></div><button type="submit" disabled={saving || !email.trim() || !password || !passwordConfirmation} className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{saving ? "保存中…" : "管理者を保存"}</button></form>
        {!recoveryMode && currentEmail && <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="font-black">復旧コード</h2><button type="button" onClick={() => void regenerateRecoveryCodes()} disabled={saving} className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold">復旧コードを再発行</button>{recoveryCodes.length > 0 && <pre className="mt-4 whitespace-pre-wrap text-xs">{recoveryCodes.join("\n")}</pre>}</section>}
        {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">{message}</p>}
      </aside>
    </div>
  );
}
