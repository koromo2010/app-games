import type { Metadata } from "next";
import { AppLink as Link } from "@/app/components/AppLink";
import { ContactThread } from "./ContactThread";

export const metadata: Metadata = {
  title: "お問い合わせ履歴",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ContactThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; access?: string }>;
}) {
  const { id = "", access = "" } = await searchParams;
  return <main className="flex-1 bg-slate-100 px-4 py-10">
    <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
      <Link href="/contact" className="text-sm font-bold text-cyan-700">← お問い合わせへ戻る</Link>
      <p className="mt-7 text-xs font-black tracking-[0.18em] text-cyan-700">CONTACT THREAD</p>
      <h1 className="mt-2 text-3xl font-black">お問い合わせ履歴</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">運営からの返信を確認し、このページから追加情報を送れます。専用URLは第三者へ共有しないでください。</p>
      <ContactThread contactId={id} accessToken={access} />
    </section>
  </main>;
}
