"use client";
import { useState, type FormEvent } from "react";

export function ContactForm() {
  const [category, setCategory] = useState("general"); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [status, setStatus] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setStatus(""); try { const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, name, email, message }) }); if (!response.ok) throw new Error(); setMessage(""); setStatus("送信しました。内容を確認のうえ対応します。"); } catch { setStatus("送信できませんでした。時間をおいてもう一度お試しください。"); } finally { setSaving(false); } };
  return <form onSubmit={submit} className="mt-7 space-y-4">
    <label className="block text-sm font-bold">お問い合わせ種別<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"><option value="general">一般</option><option value="account">アカウント</option><option value="privacy">個人情報・削除等</option><option value="bug">不具合</option></select></label>
    <label className="block text-sm font-bold">お名前 <span className="font-normal text-slate-400">（任意）</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
    <label className="block text-sm font-bold">返信先メールアドレス <span className="text-rose-600">（必須）</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
    <label className="block text-sm font-bold">内容 <span className="text-rose-600">（必須）</span><textarea required value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3000} className="mt-2 min-h-40 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-500">パスワードやAPIキーは入力しないでください。</span></label>
    {status && <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">{status}</p>}
    <button disabled={saving || !email.trim() || !message.trim()} className="rounded-lg bg-cyan-700 px-5 py-3 font-black text-white disabled:opacity-40">{saving ? "送信中…" : "送信する"}</button>
  </form>;
}
