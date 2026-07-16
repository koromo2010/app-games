import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";
export const metadata: Metadata = { title: "お問い合わせ", description: "GAME FIELDSへのお問い合わせ、個人情報に関する申請、不具合報告を受け付けます。" };
export default function ContactPage() { return <main className="flex-1 bg-slate-100 px-4 py-10"><section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10"><Link href="/games" className="text-sm font-bold text-cyan-700">← 広場へ戻る</Link><p className="mt-7 text-xs font-black tracking-[0.18em] text-cyan-700">CONTACT</p><h1 className="mt-2 text-3xl font-black">お問い合わせ</h1><p className="mt-3 text-sm leading-7 text-slate-600">サービスに関する質問、アカウント・個人情報に関する申請、不具合の連絡を受け付けます。返信には時間がかかる場合があります。</p><ContactForm /></section></main>; }
