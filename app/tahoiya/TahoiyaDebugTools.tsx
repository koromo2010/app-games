"use client";

import { DebugPlayerSwitcher, DebugToolButton, DebugToolsSection } from "@/app/components/DebugGameTools";
import { DebugWordGenerationTest, type DebugWordGenerationResult } from "@/app/components/DebugWordGenerationTest";
import { tahoiyaDifficultyCriterionDescription, tahoiyaDifficultyLabel } from "@/lib/tahoiya-difficulty";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { inputClass } from "../wordwolf/styles";

type Reason = { value: string; label: string };

type GameToolsProps = {
  room: TahoiyaRoom;
  activePlayerId: string;
  writingDone: boolean;
  skipReason: string;
  skipComment: string;
  skipReasons: Reason[];
  isSkipping: boolean;
  onActivePlayerChange: (playerId: string) => void;
  onAutoFillDefinitions: () => void;
  onAdvanceToVoting: () => void;
  onAutoFillVotes: () => void;
  onAdvanceToResult: () => void;
  onSkipReasonChange: (value: string) => void;
  onSkipCommentChange: (value: string) => void;
  onSkipTopic: () => void;
};

export function TahoiyaDebugGameTools(props: GameToolsProps) {
  return (
    <>
      <DebugToolsSection title="操作プレイヤー" description="偽説明・投票を代理操作する対象を切り替えます。">
        <DebugPlayerSwitcher
          players={props.room.players}
          value={props.activePlayerId}
          onChange={props.onActivePlayerChange}
        />
      </DebugToolsSection>

      {props.room.phase !== "lobby" && <DebugToolsSection title="ゲーム操作" description="現在のフェーズで使えるデバッグ操作だけを表示します。">
        {props.room.phase === "writing" && (
          <>
            <DebugToolButton onClick={props.onAutoFillDefinitions}>未投稿の偽説明を自動入力</DebugToolButton>
            {props.writingDone && <DebugToolButton onClick={props.onAdvanceToVoting}>投票へ進む</DebugToolButton>}
          </>
        )}
        {props.room.phase === "voting" && (
          <>
            <DebugToolButton onClick={props.onAutoFillVotes}>未投票を自動入力</DebugToolButton>
            <DebugToolButton onClick={props.onAdvanceToResult}>結果へ進む</DebugToolButton>
          </>
        )}
        {props.room.phase === "result" && <p className="text-xs font-semibold text-slate-600">結果確認中です。次ラウンドは通常の結果操作から進めます。</p>}
      </DebugToolsSection>}

      {props.room.phase !== "lobby" && (
        <DebugToolsSection title="お題をスキップ" description="問題点を保存して、同じ設定の次のお題へ進みます。">
          <select
            value={props.skipReason}
            onChange={(event) => props.onSkipReasonChange(event.target.value)}
            disabled={props.isSkipping}
            className={inputClass}
          >
            <option value="">スキップ理由を選択</option>
            {props.skipReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </select>
          <textarea
            value={props.skipComment}
            onChange={(event) => props.onSkipCommentChange(event.target.value)}
            disabled={props.isSkipping}
            maxLength={800}
            placeholder="補足（任意）"
            className={`min-h-20 resize-y ${inputClass}`}
          />
          <DebugToolButton
            tone="danger"
            disabled={!props.skipReason || props.isSkipping}
            onClick={props.onSkipTopic}
          >
            {props.isSkipping ? "保存して次のお題を準備中..." : "フィードバックを保存して次のお題へ"}
          </DebugToolButton>
        </DebugToolsSection>
      )}
    </>
  );
}

type WordGenerationProps = {
  room: TahoiyaRoom;
  onTestDifficultyScreening: () => Promise<DebugWordGenerationResult>;
  onTestWordGeneration: () => Promise<DebugWordGenerationResult>;
};

export function TahoiyaDebugWordGenerationTools(props: WordGenerationProps) {
  if (props.room.phase !== "lobby" || props.room.topicGenerationProgress) return null;
  const difficulty = `${tahoiyaDifficultyLabel(props.room.topicDifficulty)}（${tahoiyaDifficultyCriterionDescription(props.room.topicDifficulty)}）`;
  return (
    <>
      <DebugWordGenerationTest
        onGenerate={props.onTestDifficultyScreening}
        heading="未判定10語を難易度審査"
        description="共通DBの未判定10語をLLMへ渡し、認知率と除外フラグを判定済みDBへ保存します。説明文と出題履歴は作りません。"
        showModeToggle={false}
        fixedButtonLabel="未判定10語を審査して保存"
        fixedRepeatLabel="次の未判定10語を審査"
      />
      <DebugWordGenerationTest
        onGenerate={props.onTestWordGeneration}
        heading={`${difficulty}正式採用フロー確認`}
        description="完成済み候補、判定済み候補、未判定10語の順に探し、使用する1語だけ説明文を生成します。デバッグ確認では出題履歴を付けません。"
        showModeToggle={false}
        fixedButtonLabel="正式採用フローを確認"
        fixedRepeatLabel="もう一度正式フローを確認"
      />
    </>
  );
}
