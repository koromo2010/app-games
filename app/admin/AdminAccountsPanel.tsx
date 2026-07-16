"use client";

import { type FormEvent, useEffect, useState } from "react";
import { siteAdminAccountMaximumCount, siteAdminPasswordMaximumLength, siteAdminPasswordMinimumLength } from "@/lib/site-admin-account-constants";

type SiteAdminAccount = {
  email: string;
  receiveAlerts: boolean;
  receiveContacts: boolean;
  createdAt: number;
  updatedAt: number;
};

const accountMessages: Record<string, string> = {
  SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED: "管理者アカウントの保存先（Postgres）が設定されていません。",
  SITE_ADMIN_EMAIL_INVALID: "正しいメールアドレスを入力してください。",
  SITE_ADMIN_ACCOUNT_PASSWORD_INVALID: `パスワードは${siteAdminPasswordMinimumLength}〜${siteAdminPasswordMaximumLength}文字で入力してください。`,
  SITE_ADMIN_ACCOUNT_LIMIT_REACHED: `管理者アカウントは最大${siteAdminAccountMaximumCount}件です。`,
  SITE_ADMIN_ACCOUNTS_LOAD_FAILED: "管理者アカウントを読み込めませんでした。",
  SITE_ADMIN_ACCOUNT_SAVE_FAILED: "管理者アカウントを保存できませんでした。",
  SITE_ADMIN_ACCOUNT_DELETE_FAILED: "管理者アカウントを削除できませんでした。",
  SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED: "メール通知の設定を保存できませんでした。",
  SITE_ADMIN_ACCOUNT_NOT_FOUND: "対象の管理者アカウントが見つかりません。",
};

function messageFor(code: string | undefined, fallback: string) {
  return code ? accountMessages[code] ?? fallback : fallback;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function AdminAccountsPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
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
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

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
    if (updatingEmail) return;
    setUpdatingEmail(account.email); setMessage("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: account.email,
          receiveAlerts: changes.receiveAlerts ?? account.receiveAlerts,
          receiveContacts: changes.receiveContacts ?? account.receiveContacts,
        }),
      });
      const data = await response.json().catch(() => null) as { accounts?: SiteAdminAccount[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.accounts) throw new Error(data?.error || "SITE_ADMIN_SUBSCRIPTIONS_SAVE_FAILED");
      setAccounts(data.accounts); setMessage("メール通知の設定を保存しました。");
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setMessage(messageFor(code, "メール通知の設定を保存できませんでした。"));
    } finally {
      setUpdatingEmail(null);
    }
  };

  const remove = async (targetEmail: string) => {
    if (deletingEmail || !window.confirm(`${targetEmail} を管理者から削除しますか？`)) return;
    setDeletingEmail(targetEmail); setMessage("");
    try {
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

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-black">登録済みの管理者</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">登録したメールアドレスとパスワードで、この管理画面へログインできます。最大{siteAdminAccountMaximumCount}件まで登録できます。</p>
        </div>
        {loading ? <p className="mt-6 animate-pulse text-sm text-cyan-200">読み込み中…</p> : accounts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">まだ管理者メールはありません。右のフォームから最初のアカウントを登録してください。</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {accounts.map((account) => (
              <li key={account.email} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><p className="truncate font-bold text-white">{account.email}</p><p className="mt-1 text-xs text-slate-400">登録 {formatDate(account.createdAt)} ・ 更新 {formatDate(account.updatedAt)}</p></div>
                  <button type="button" onClick={() => void remove(account.email)} disabled={Boolean(deletingEmail) || Boolean(updatingEmail)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-200 hover:bg-rose-300/10 disabled:opacity-40">{deletingEmail === account.email ? "削除中…" : "削除"}</button>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-sm sm:flex-row sm:gap-5">
                  <label className="flex cursor-pointer items-center gap-2 text-slate-200"><input type="checkbox" checked={account.receiveAlerts} disabled={Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveAlerts: event.target.checked })} className="h-4 w-4 accent-cyan-300" />運用アラートを受け取る</label>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-200"><input type="checkbox" checked={account.receiveContacts} disabled={Boolean(updatingEmail)} onChange={(event) => void updateSubscriptions(account, { receiveContacts: event.target.checked })} className="h-4 w-4 accent-cyan-300" />問い合わせ内容を受け取る</label>
                  {updatingEmail === account.email && <span className="text-xs text-cyan-200">保存中…</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <h2 className="text-lg font-black">管理者を追加・更新</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">登録済みのメールアドレスを入力すると、パスワードを更新します。</p>
          <label className="mt-5 block text-sm font-bold text-slate-200">メールアドレス<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label>
          <label className="mt-4 block text-sm font-bold text-slate-200">パスワード<input type="password" required minLength={siteAdminPasswordMinimumLength} maxLength={siteAdminPasswordMaximumLength} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /><span className="mt-1 block text-xs font-normal text-slate-400">{siteAdminPasswordMinimumLength}文字以上。登録後にパスワードを画面で確認することはできません。</span></label>
          <label className="mt-4 block text-sm font-bold text-slate-200">パスワード（確認）<input type="password" required minLength={siteAdminPasswordMinimumLength} maxLength={siteAdminPasswordMaximumLength} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" /></label>
          <fieldset className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4"><legend className="px-1 text-sm font-black text-slate-200">このメールで受け取るもの</legend><label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={receiveAlerts} onChange={(event) => setReceiveAlerts(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-300" /><span><b className="block">運用アラート</b><span className="mt-0.5 block text-xs leading-5 text-slate-400">ストレージ容量など、サイト運営上の警告を送ります。</span></span></label><label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={receiveContacts} onChange={(event) => setReceiveContacts(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-300" /><span><b className="block">問い合わせ内容</b><span className="mt-0.5 block text-xs leading-5 text-slate-400">問い合わせフォームの名前・返信先・本文を送ります。</span></span></label></fieldset>
          <button type="submit" disabled={saving || !email.trim() || !password || !passwordConfirmation} className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{saving ? "保存中…" : "管理者を保存"}</button>
        </form>
        <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50"><h2 className="font-black">マスターパスワードは残ります</h2><p className="mt-2">環境変数のマスターパスワードは、管理者メールを登録・削除しても使えます。緊急時の入口としてサイト上から変更せず、安全な場所で管理してください。</p></section>
        {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">{message}</p>}
      </aside>
    </div>
  );
}
