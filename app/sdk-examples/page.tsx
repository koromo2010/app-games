import Link from "next/link";

export const metadata = { title: "SDK公式サンプル" };

export default function SdkExamplesPage() {
  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
    <section className="mx-auto max-w-5xl">
      <p className="text-xs font-bold tracking-[0.22em] text-emerald-300">GAME FIELDS OFFICIAL</p>
      <h1 className="mt-3 text-4xl font-black">SDK公式サンプル</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">Game Fields共通機能とゲーム固有部分の境界を、実際に遊んで確認するための読み取り専用サンプルです。</p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Link href="/sdk-examples/word-wolf" className="rounded-3xl border border-emerald-300/30 bg-slate-900 p-7 transition hover:border-emerald-300">
          <span className="text-xs font-bold text-emerald-300">REFERENCE IMPLEMENTATION</span>
          <h2 className="mt-3 text-2xl font-black">ワードウルフ SDK</h2>
          <p className="mt-3 leading-6 text-slate-300">共通ルーム、参加者、設定、開始・中断・再戦と、ワードウルフ固有の秘密語・ヒント・投票を分離した基準実装。</p>
          <span className="mt-6 inline-block font-bold text-emerald-300">サンプルを開く →</span>
        </Link>
      </div>
    </section>
  </main>;
}
