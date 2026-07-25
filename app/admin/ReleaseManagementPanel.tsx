"use client";

import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import { useCallback, useEffect, useState } from "react";

type SdkCandidate = {
  creatorSlug: string;
  gameId: string;
  title: string;
  status: string;
  publicGameId: string | null;
  packageRevision: string | null;
  packageRootSha256: string | null;
  packageBundleSha256: string | null;
  packageAppSetSha256: string | null;
  stableRevision: string | null;
  stableRootSha256: string | null;
  stableBundleSha256: string | null;
  stableAppSetSha256: string | null;
  updatedAt: string | null;
  reviewUrl: string | null;
};

type DevRelease = {
  repository: string;
  mainSha: string;
  developSha: string;
  compareStatus: "ahead" | "behind" | "diverged" | "identical";
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  compareUrl: string;
  canPromote: boolean;
  writeConfigured: boolean;
};

const errors: Record<string, string> = {
  ADMIN_AUTH_REQUIRED: "管理画面のログイン期限が切れました。",
  ADMIN_STEP_UP_REQUIRED: "パスキーでの再確認が必要です。",
  promotion_expected_source_changed: "提出物が更新されています。再読み込みしてから審査してください。",
  promotion_source_changed: "採用処理中に提出物が更新されました。",
  public_game_id_conflict: "その本番ゲームIDはすでに使われています。",
  SDK_PROMOTION_MAIN_ONLY: "SDK作品のmain採用はmain側の管理画面だけで利用できます。",
  GITHUB_RELEASE_TOKEN_NOT_CONFIGURED: "dev→main用のGitHub資格が本番環境にまだ設定されていません。",
  GITHUB_RELEASE_SOURCE_CHANGED: "mainまたはdevelopが更新されています。差分を再読込してください。",
  GITHUB_RELEASE_NOT_FAST_FORWARD: "developを安全にそのままmainへ進められない状態です。GitHubで分岐を解消してください。",
  GITHUB_RELEASE_AUTH_FAILED: "GitHub資格またはbranch保護設定により反映できませんでした。",
  GITHUB_RELEASE_MAIN_ONLY: "dev→main操作はmain側の管理画面だけで利用できます。",
};

function shortSha(value: string | null) {
  return value ? value.slice(0, 8) : "未採用";
}

function messageFor(code: unknown, fallback: string) {
  return typeof code === "string" ? errors[code] ?? fallback : fallback;
}

function sdkPackageIsCurrent(game: SdkCandidate) {
  return Boolean(
    game.packageRevision
    && game.packageRevision === game.stableRevision
    && game.packageRootSha256 === game.stableRootSha256
    && game.packageBundleSha256 === game.stableBundleSha256
    && game.packageAppSetSha256 === game.stableAppSetSha256,
  );
}

export function ReleaseManagementPanel({
  mode,
  onAuthExpired,
}: {
  mode: "preview" | "live";
  onAuthExpired: () => void;
}) {
  const isPreview = mode === "preview";
  const [sdkGames, setSdkGames] = useState<SdkCandidate[]>([]);
  const [publicIds, setPublicIds] = useState<Record<string, string>>({});
  const [devRelease, setDevRelease] = useState<DevRelease | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const [sdkResponse, devResponse] = await Promise.all([
        fetch("/api/admin/sdk-promotions", { cache: "no-store" }),
        fetch("/api/admin/dev-release", { cache: "no-store" }),
      ]);
      if (sdkResponse.status === 401 || devResponse.status === 401) {
        onAuthExpired();
        return;
      }
      const sdkPayload = await sdkResponse.json().catch(() => null) as {
        games?: SdkCandidate[];
        error?: string;
      } | null;
      const devPayload = await devResponse.json().catch(() => null) as (
        DevRelease & { error?: string }
      ) | null;
      if (!sdkResponse.ok || !Array.isArray(sdkPayload?.games)) {
        throw new Error(sdkPayload?.error || "SDK_PROMOTIONS_LOAD_FAILED");
      }
      if (!devResponse.ok || !devPayload?.repository) {
        throw new Error(devPayload?.error || "GITHUB_RELEASE_LOAD_FAILED");
      }
      setSdkGames(sdkPayload.games);
      setPublicIds(Object.fromEntries(sdkPayload.games.map((game) => [
        `${game.creatorSlug}/${game.gameId}`,
        game.publicGameId || game.gameId,
      ])));
      setDevRelease(devPayload);
    } catch (error) {
      setMessage(messageFor(
        error instanceof Error ? error.message : "",
        "昇格情報を読み込めませんでした。",
      ));
    } finally {
      setIsLoading(false);
    }
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const promoteSdkGame = async (game: SdkCandidate) => {
    const key = `${game.creatorSlug}/${game.gameId}`;
    const publicGameId = publicIds[key]?.trim().toLowerCase() ?? "";
    if (
      !game.packageRevision
      || !game.packageRootSha256
      || !game.packageBundleSha256
      || !game.packageAppSetSha256
      || !/^[a-z][a-z0-9-]{1,63}$/.test(publicGameId)
    ) {
      setMessage("提出物のhashまたは本番ゲームIDを確認してください。");
      return;
    }
    if (!window.confirm(`${game.title} をSDKからmainへ採用しますか？\nCandidateの同一revision・hashを本番カタログへ固定します。`)) return;
    setActiveAction(`sdk:${key}`);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/sdk-promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "main",
          creatorSlug: game.creatorSlug,
          gameId: game.gameId,
          publicGameId,
          expectedRevision: game.packageRevision,
          expectedPackageRootSha256: game.packageRootSha256,
          expectedServerBundleSha256: game.packageBundleSha256,
          expectedAppSetSourceSha256: game.packageAppSetSha256,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "SDK_PROMOTION_FAILED");
      await load();
      setMessage(`${game.title} をmain採用カタログへ反映しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
        return;
      }
      setMessage(messageFor(
        error instanceof Error ? error.message : "",
        "SDK作品をmainへ採用できませんでした。",
      ));
    } finally {
      setActiveAction("");
    }
  };

  const promoteDev = async () => {
    if (!devRelease?.canPromote || !devRelease.writeConfigured) return;
    if (!window.confirm(`developの${devRelease.aheadBy}コミットをmainへ反映しますか？\nmainはdevelopの現在commitへfast-forwardされます。`)) return;
    setActiveAction("dev:main");
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/dev-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "dev→main",
          expectedMainSha: devRelease.mainSha,
          expectedDevelopSha: devRelease.developSha,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        mainSha?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "GITHUB_RELEASE_FAILED");
      await load();
      setMessage(`developをmainへ反映しました（${shortSha(payload?.mainSha ?? null)}）。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
        return;
      }
      setMessage(messageFor(
        error instanceof Error ? error.message : "",
        "developをmainへ反映できませんでした。",
      ));
    } finally {
      setActiveAction("");
    }
  };

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-8"><p className="animate-pulse rounded-xl border border-white/10 bg-white/5 p-5 text-sm font-bold text-cyan-200">昇格経路を確認中…</p></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Release management</p>
        <h2 className="mt-2 text-2xl font-black">昇格管理</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">SDK作品の採用と、本体developの反映は互いに独立した経路です。</p>
      </header>

      {isPreview && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-bold leading-6 text-amber-100">dev試作表示です。候補・差分・画面構成は確認できますが、SDK→mainとdevelop→mainの実行はサーバー側でも無効です。</p>}

      {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">{message}</p>}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">SDK → main</p>
          <h3 className="mt-1 text-xl font-black">SDK作品採用</h3>
          <p className="mt-2 text-sm text-slate-400">運営審査後、CandidateのAppSetとhashを変更せず本番へ採用します。devは経由しません。</p>
        </div>
        {sdkGames.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400">正式提出済みのSDK作品はありません。</p>
        ) : (
          <div className="divide-y divide-white/10">
            {sdkGames.map((game) => {
              const key = `${game.creatorSlug}/${game.gameId}`;
              const current = sdkPackageIsCurrent(game);
              const complete = Boolean(
                game.packageRevision
                && game.packageRootSha256
                && game.packageBundleSha256
                && game.packageAppSetSha256,
              );
              return (
                <article key={key} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-black">{game.title}</h4>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${current ? "bg-emerald-300 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>{current ? "main採用済み" : game.stableRevision ? "更新あり" : "未採用"}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{game.creatorSlug}/{game.gameId}</p>
                    <p className="mt-2 text-xs text-slate-400">Candidate {shortSha(game.packageRevision)} / main {shortSha(game.stableRevision)}</p>
                  </div>
                  <label className="block text-xs font-bold text-slate-300">
                    mainで使うゲームID
                    <input value={publicIds[key] ?? ""} disabled={isPreview || current || activeAction === `sdk:${key}`} onChange={(event) => setPublicIds((values) => ({ ...values, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-300 disabled:opacity-50" />
                  </label>
                  <div className="flex gap-2 lg:justify-end">
                    {game.reviewUrl && <a href={game.reviewUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">レビュー</a>}
                    <button type="button" disabled={isPreview || current || !complete || activeAction === `sdk:${key}`} onClick={() => void promoteSdkGame(game)} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40">{isPreview ? "本番管理画面で実行" : activeAction === `sdk:${key}` ? "採用中…" : current ? "採用済み" : "SDK→main"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">develop → main</p>
        <h3 className="mt-1 text-xl font-black">dev反映</h3>
        <p className="mt-2 text-sm text-slate-400">本体の検証済みdevelopをmainへfast-forwardします。SDK作品の状態には触れません。</p>
        {devRelease && (
          <div className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-mono text-xs text-slate-400">main {shortSha(devRelease.mainSha)} ← develop {shortSha(devRelease.developSha)}</p>
              <p className="mt-2 font-bold">{devRelease.compareStatus === "identical" ? "差分なし" : `developが${devRelease.aheadBy}コミット先行・${devRelease.behindBy}コミット遅延`}</p>
              {!devRelease.writeConfigured && <p className="mt-2 text-xs font-bold text-amber-200">読取確認は可能ですが、反映用GitHub資格は未設定です。</p>}
              {devRelease.compareStatus === "diverged" && <p className="mt-2 text-xs font-bold text-rose-200">ブランチが分岐しているため、GitHubで解消するまで自動反映しません。</p>}
            </div>
            <div className="flex gap-2">
              <a href={devRelease.compareUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">差分</a>
              <button type="button" disabled={isPreview || !devRelease.canPromote || !devRelease.writeConfigured || activeAction === "dev:main"} onClick={() => void promoteDev()} className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-black text-violet-950 disabled:cursor-not-allowed disabled:opacity-40">{isPreview ? "本番管理画面で実行" : activeAction === "dev:main" ? "反映中…" : "dev→main"}</button>
            </div>
          </div>
        )}
      </section>

      <button type="button" onClick={() => void load()} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">状態を再読込</button>
    </div>
  );
}
