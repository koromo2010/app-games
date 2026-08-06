"use client";

import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import type { GameSdkPackageRevisionIssue } from "@/lib/game-sdk-package-revision";
import { panel, primary, secondary } from "./game-sdk-frame-shared";

type Props = {
  backHref: string;
  creatorSlug?: string;
  issue: GameSdkPackageRevisionIssue;
  message: string;
  onCreateRequestedRoom: () => void;
  onResumePinnedRoom: () => void;
  pending: boolean;
  rules: readonly string[];
  title: string;
};

function revisionLabel(revision: string) {
  return `${revision.slice(0, 8)}…${revision.slice(-6)}`;
}

export function GameSdkPackageRevisionPanel({
  backHref,
  creatorSlug,
  issue,
  message,
  onCreateRequestedRoom,
  onResumePinnedRoom,
  pending,
  rules,
  title,
}: Props) {
  return (
    <main className={`min-h-screen bg-slate-950 px-4 py-10 text-white ${gameTopBannerOffsetClass}`}>
      <GameSdkShellHeader
        eyebrow="SDK PACKAGE REVISION"
        title={title}
        rules={rules}
        backHref={backHref}
        backLabel={creatorSlug ? "制作環境へ戻る" : "広場へ戻る"}
        surface="lounge"
      />
      <section className="mx-auto max-w-3xl">
        <div className={`${panel} border-amber-300`}>
          <p className="text-sm font-black uppercase tracking-wide text-amber-700">
            Package revision mismatch
          </p>
          <h2 className="mt-2 text-2xl font-black">
            {issue.kind === "mismatch"
              ? "参加中の部屋と確認対象の版が異なります"
              : "参加中の部屋の固定revisionを確認できません"}
          </h2>
          <p className="mt-3 leading-7 text-slate-700">
            {issue.kind === "mismatch" ? (
              <>
                Room <strong className="font-mono">{issue.roomCode}</strong> のserver stateへ、
                別revisionのclientを接続することはできません。
              </>
            ) : (
              "固定revisionのserver packageを解決できないため、Roomとclientの読込を停止しました。"
            )}
          </p>
          <dl className="mt-5 grid gap-3 rounded-xl bg-slate-100 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-slate-500">URL指定revision</dt>
              <dd className="mt-1 font-mono font-black" title={issue.requestedRevision}>
                {revisionLabel(issue.requestedRevision)}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Room固定revision</dt>
              <dd className="mt-1 font-mono font-black" title={issue.roomRevision ?? undefined}>
                {issue.roomRevision
                  ? revisionLabel(issue.roomRevision)
                  : "取得できませんでした"}
              </dd>
            </div>
          </dl>
          {issue.kind === "mismatch" ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={secondary}
                disabled={pending}
                onClick={onResumePinnedRoom}
              >
                旧Roomへ戻る
              </button>
              <button
                type="button"
                className={primary}
                disabled={pending}
                onClick={onCreateRequestedRoom}
              >
                新revisionで新Roomを作る
              </button>
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
              Room固定revisionを確認できないため、clientを読み込んでいません。
              旧Mockや別revisionへの切替も行っていません。
            </p>
          )}
          {message && (
            <p className="mt-4 text-sm font-bold text-rose-700">{message}</p>
          )}
        </div>
      </section>
    </main>
  );
}
