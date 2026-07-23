import Link from "next/link";

type VerificationPageProps = {
  searchParams: Promise<{ token?: string; status?: string }>;
};

const statusCopy = {
  verified: {
    title: "メール確認が完了しました",
    description: "このメールアドレスを復旧先として登録しました。管理者メールと一致する場合は、デバッグ権限も自動的に有効になります。",
  },
  invalid: {
    title: "確認リンクを使用できません",
    description: "リンクが期限切れか、すでに使用されています。マイページから確認メールを再送してください。",
  },
  conflict: {
    title: "このメールは登録できません",
    description: "別のプレイヤーアカウントですでに確認済みです。別のメールアドレスを使用してください。",
  },
  retry: {
    title: "確認処理を完了できませんでした",
    description: "時間をおいて、確認メールのリンクからもう一度お試しください。",
  },
} as const;

export default async function VerifyEmailPage({ searchParams }: VerificationPageProps) {
  const { token, status } = await searchParams;
  const result = status && status in statusCopy
    ? statusCopy[status as keyof typeof statusCopy]
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Game Fields account</p>
        {result ? (
          <>
            <h1 className="mt-3 text-2xl font-black">{result.title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">{result.description}</p>
            <Link href="/games" className="mt-6 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">
              広場へ戻る
            </Link>
          </>
        ) : token ? (
          <>
            <h1 className="mt-3 text-2xl font-black">復旧用メールアドレスの確認</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              このメールアドレスを、確認メールに記載されたプレイヤーの復旧先として登録します。心当たりがある場合だけ承認してください。
            </p>
            <form action="/api/player-email-verification" method="post" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-500">
                このメールを承認
              </button>
            </form>
            <Link href="/games" className="mt-3 inline-flex text-sm font-semibold text-slate-400 underline">
              承認せず広場へ戻る
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-black">確認リンクがありません</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">マイページから確認メールを送信してください。</p>
            <Link href="/games" className="mt-6 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">
              広場へ戻る
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
