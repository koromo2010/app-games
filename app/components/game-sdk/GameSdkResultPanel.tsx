"use client";

import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import { AppLink as Link } from "@/app/components/AppLink";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameSdkFeedbackPanel } from "@/app/components/GameSdkFeedbackPanel";
import { panel, secondary } from "./game-sdk-frame-shared";
import type { PackageRoom } from "./game-sdk-frame-types";

type Props = {
  room: PackageRoom;
  title: string;
  gameId: string;
  creatorSlug?: string;
  backHref: string;
  supportsReplay: boolean;
  usesLlm: boolean;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  resultShareText: string;
  resultReason: string;
  feedbackEndpoint: string;
};

/**
 * The three result-only sibling blocks extracted out of GameSdkFrame.tsx's
 * aside: the "プレイバック" replay link, `GameResultShareButton`, and
 * `GameSdkFeedbackPanel`. Each keeps its exact original gating
 * (`room.phase === "result" && ...moduleRequired(...)`) and markup — this
 * component only groups them so they can be rendered/tested per module
 * profile in isolation. The standard-result ranking summary + play log stay
 * inline in GameSdkFrameView because they are nested inside the shared
 * players card, not a sibling panel.
 */
export function GameSdkResultPanel({
  room,
  title,
  gameId,
  creatorSlug,
  backHref,
  supportsReplay,
  usesLlm,
  moduleRequired,
  resultShareText,
  resultReason,
  feedbackEndpoint,
}: Props) {
  if (room.phase !== "result") return null;

  return (
    <>
      {supportsReplay && moduleRequired("replay") && (
        <div className={panel}>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">
            プレイバック
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            この結果は参加者本人の履歴へ保存され、マイページから確認できます。
          </p>
          <Link
            href="/users/me"
            className={`${secondary} mt-4 block text-center`}
          >
            履歴を確認
          </Link>
        </div>
      )}
      {moduleRequired("result-share") && (
        <GameResultShareButton
          title={`${title}の結果`}
          text={resultShareText}
          url={creatorSlug ? backHref : `/sdk-games/${gameId}`}
        />
      )}
      {usesLlm && moduleRequired("llm") && moduleRequired("feedback") && (
        <GameSdkFeedbackPanel
          endpoint={feedbackEndpoint}
          roomCode={room.code}
          resultReason={resultReason || "result"}
        />
      )}
    </>
  );
}
