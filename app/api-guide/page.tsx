import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "自分のAI APIを使う方法 | Game Fields",
  description: "Game Fieldsで自分のOpenAI、Gemini、Groq APIキーを使うための手順と注意事項。",
};

const providers = [
  {
    name: "Google Gemini",
    note: "無料枠から試しやすい選択肢です。Google AI Studioでキーを作成します。",
    href: "https://aistudio.google.com/app/apikey",
    linkLabel: "Google AI StudioでAPIキーを作る",
  },
  {
    name: "Groq",
    note: "対応モデルを高速に利用できます。Groq Consoleでキーを作成します。",
    href: "https://console.groq.com/keys",
    linkLabel: "Groq ConsoleでAPIキーを作る",
  },
  {
    name: "OpenAI",
    note: "OpenAI APIの利用料金はChatGPT Plus／Proとは別です。Platformで課金・利用上限を確認してください。",
    href: "https://platform.openai.com/api-keys",
    linkLabel: "OpenAI PlatformでAPIキーを作る",
  },
];

export default function ApiGuidePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-950">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-[linear-gradient(135deg,#082f49,#111827_60%,#3f2b12)] px-6 py-8 text-white sm:px-10">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-200">Personal AI API guide</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">自分のAI APIで快適に遊ぶ</h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-200">共有の無料APIは利用者が重なると上限に達し、生成が遅くなったりローカル候補へ切り替わったりします。自分の無料枠や契約中のAPIを設定すると、他の利用者の消費量に左右されにくくなります。</p>
        </header>

        <div className="space-y-8 px-6 py-8 sm:px-10">
          <section>
            <h2 className="text-xl font-black">設定は3ステップ</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {["下からサービスを選び、公式サイトでAPIキーを作る", "ゲーム上部の「API」ボタンを開く", "同じサービスを選び、キーを貼って接続する"].map((step, index) => <li key={step} className="rounded-xl bg-slate-100 p-4 text-sm leading-6"><span className="mb-2 block text-lg font-black text-cyan-700">{index + 1}</span>{step}</li>)}
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-black">APIキーの取得先</h2>
            <div className="mt-4 space-y-3">{providers.map((provider) => <div key={provider.name} className="rounded-xl border border-slate-200 p-4"><h3 className="font-black">{provider.name}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{provider.note}</p><a href={provider.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600">{provider.linkLabel}<span aria-hidden="true"> ↗</span></a></div>)}</div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-950">料金と安全について</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-950"><li>「無料枠」の条件や上限は各サービス側で変わります。作成前に公式の料金・制限を確認してください。</li><li>ゲーム専用のAPIキーを作り、サービス側で利用上限を設定することを推奨します。</li><li>APIキーをチャット、SNS、画面共有へ載せないでください。漏れた場合は提供元ですぐ無効化してください。</li><li>Game Fieldsではキーを暗号化したHttpOnly Cookieに8時間だけ保持し、アカウント、Redis、プレイバック、ログには保存しません。</li></ul>
          </section>

          <div className="flex flex-wrap gap-3"><Link href="/games" className="rounded-lg bg-slate-950 px-5 py-3 font-bold text-white">ゲームロビーへ戻る</Link><span className="self-center text-sm text-slate-500">接続設定は各ゲーム上部の「API」から行えます。</span></div>
        </div>
      </article>
    </main>
  );
}
