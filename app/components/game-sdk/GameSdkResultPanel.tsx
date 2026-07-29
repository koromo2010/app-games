"use client";

import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import { AppLink as Link } from "@/app/components/AppLink";
import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameSdkFeedbackPanel } from "@/app/components/GameSdkFeedbackPanel";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { secondary } from "./game-sdk-frame-shared";
import type { CommonView, PackageRoom } from "./game-sdk-frame-types";

type Props = {
  room: PackageRoom;
  title: string;
  gameId: string;
  creatorSlug?: string;
  backHref: string;
  supportsReplay: boolean;
  usesLlm: boolean;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  standardResult: CommonView["standardResult"];
  resultShareText: string;
  resultReason: string;
  resultPlayLog: string[];
  feedbackEndpoint: string;
  pending: boolean;
  isHost: boolean;
  canReturnToRoom: boolean;
  isRoomDissolved: boolean;
  onReturnToRoom?: () => void;
  onDissolve?: () => void;
};

export function GameSdkResultPanel({
  room,
  title,
  gameId,
  creatorSlug,
  backHref,
  supportsReplay,
  usesLlm,
  moduleRequired,
  standardResult,
  resultShareText,
  resultReason,
  resultPlayLog,
  feedbackEndpoint,
  pending,
  isHost,
  canReturnToRoom,
  isRoomDissolved,
  onReturnToRoom,
  onDissolve,
}: Props) {
  if (room.phase !== "result") return null;

  const showHistory = supportsReplay && moduleRequired("replay");
  const showShare = moduleRequired("result-share");
  const showFeedback = usesLlm && moduleRequired("llm") && moduleRequired("feedback");
  const utilities = showHistory || showShare || showFeedback ? (
    <div className="space-y-4">
      {showHistory && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">プレイバック</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">この結果は参加者本人の履歴へ保存され、マイページから確認できます。</p>
          <Link href="/users/me" className={`${secondary} mt-4 block text-center`}>履歴を確認</Link>
        </section>
      )}
      {showShare && (
        <GameResultShareButton
          title={`${title}の結果`}
          text={resultShareText}
          url={creatorSlug ? backHref : `/sdk-games/${gameId}`}
        />
      )}
      {showFeedback && (
        <GameSdkFeedbackPanel
          endpoint={feedbackEndpoint}
          roomCode={room.code}
          resultReason={resultReason || "result"}
        />
      )}
    </div>
  ) : undefined;

  return (
    <CommonGameResultShell
      eyebrow="Standard result"
      title="結果"
      summary={resultReason || undefined}
      utilities={utilities}
      actions={
        <OnlineRoomLifecycleActions
          surface="result"
          disabled={pending}
          canReturnToRoom={isHost || canReturnToRoom}
          isHost={isHost}
          isRoomDissolved={isRoomDissolved}
          onReturnToRoom={onReturnToRoom}
          onDissolve={onDissolve}
          returnHref={backHref}
        />
      }
    >
      {standardResult && moduleRequired("result") ? (
        <>
          <ol className="space-y-2">
            {standardResult.rankings.map((ranking) => (
              <li key={ranking.seat} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                <span>{ranking.rank}位 · {ranking.displayName}{ranking.isSelf ? "（あなた）" : ""}</span>
                <strong>{ranking.score} pt</strong>
              </li>
            ))}
          </ol>
          {resultPlayLog.length > 0 && (
            <section className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-black uppercase tracking-wide text-violet-700">プレイログ</p>
              <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                {resultPlayLog.map((line, index) => (
                  <li key={`${index}:${line}`} className="rounded-lg bg-slate-100 px-3 py-2">{line}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">ゲーム固有の結果はプレイ領域に表示されます。</p>
      )}
    </CommonGameResultShell>
  );
}
