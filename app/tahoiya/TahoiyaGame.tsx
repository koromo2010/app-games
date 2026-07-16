"use client";

import Link from "next/link";
import { useState } from "react";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
} from "@/lib/player-session";
import type { TahoiyaRoom, TahoiyaRoomChoice } from "@/lib/tahoiya-types";
import { loadRoomFromStore } from "./tahoiya-room-adapter";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { DebugModeButton } from "../components/DebugModeButton";
import { GameAdSlot } from "../components/GameAdSlot";
import { PlayerTimeoutNotice } from "../components/PlayerTimeoutNotice";
import { GameTopBanner, gameTopBannerOffsetClass } from "../components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "../components/GameTopMenu";
import { GamePlayerMenu } from "../components/GamePlayerMenu";
import { TahoiyaRulesDialog } from "./TahoiyaRulesDialog";
import { TahoiyaRoomPanel } from "./TahoiyaRoomPanel";
import { TahoiyaRoundOverview } from "./TahoiyaRoundOverview";
import { TahoiyaWritingPanel } from "./TahoiyaWritingPanel";
import { TahoiyaVotingPanel } from "./TahoiyaVotingPanel";
import { TahoiyaResultPanel } from "./TahoiyaResultPanel";
import { submittedCount, useTahoiyaViewModel, voterCount } from "./use-tahoiya-view-model";
import { useTahoiyaLobbyActions } from "./use-tahoiya-lobby-actions";
import { useTahoiyaGameActions } from "./use-tahoiya-game-actions";
import { useTahoiyaDebugActions } from "./use-tahoiya-debug-actions";
import { useTahoiyaRoomSession } from "./use-tahoiya-room-session";
import { useTahoiyaRoomActions } from "./use-tahoiya-room-actions";
import { TahoiyaEmptyState, TahoiyaScorePanel } from "./TahoiyaScorePanel";

const tahoiyaFeedbackReasons = [
  { value: "too-difficult", label: "難しすぎる", rating: "bad" as const },
  { value: "want-harder-word", label: "もっと難しい単語にしてほしい", rating: "bad" as const },
  { value: "homophone-too-easy", label: "身近な同音語があり簡単すぎる", rating: "bad" as const },
  { value: "hard-to-fake", label: "偽説明を作りにくい", rating: "bad" as const },
  { value: "definition-too-complex", label: "本物の説明が複雑", rating: "bad" as const },
  { value: "definition-questionable", label: "読み・説明が怪しい", rating: "bad" as const },
  { value: "existence-questionable", label: "実在するか怪しい", rating: "bad" as const },
  { value: "difficulty-good", label: "ちょうどよい難易度", rating: "good" as const },
  { value: "appropriately-obscure", label: "ちゃんと知らない難語だった", rating: "good" as const },
  { value: "definition-simple", label: "本物の説明が簡潔", rating: "good" as const },
  { value: "easy-to-fake", label: "偽説明を作りやすかった", rating: "good" as const },
  { value: "conversation-good", label: "盛り上がった", rating: "good" as const },
  { value: "other", label: "その他" },
];

const tahoiyaSkipReasons = tahoiyaFeedbackReasons.filter((reason) => reason.rating === "bad");

export function TahoiyaGame() {
  const [room, setRoom] = useState<TahoiyaRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(defaultAvatarImage);
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<TahoiyaRoomChoice[]>([]);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [definitionInput, setDefinitionInput] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isPolishingDefinition, setIsPolishingDefinition] = useState(false);
  const [polishMessage, setPolishMessage] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [skipComment, setSkipComment] = useState("");
  const [isSkippingTopic, setIsSkippingTopic] = useState(false);
  const [message, setMessage] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const { now, resultReturnGate } = useTahoiyaRoomSession({ room, playerId, setRoom, setPlayerId, setActivePlayerId, setPlayerName, setAvatarColor, setAvatarImage, setMessage });

  const isDebugMode = Boolean(room?.debugMode);
  const operationPlayerId = isDebugMode ? activePlayerId : playerId;
  const activePlayer = room?.players.find((player) => player.id === operationPlayerId) ?? null;
  const isHost = Boolean(room && playerId === room.hostId);
  const { isAllVoteMode, answererCandidates, answerer, isAnswerer, hasActivePlayerSubmitted, hasActivePlayerVoted,
    displayedVoteOptionId, definitionWriterCount, writingDone, voterTarget, votingDone, remainingSeconds,
    nextWriter, nextVoter, sortedScores, roomConfigItems } = useTahoiyaViewModel(room, activePlayer, selectedOptionId, now);

  const { runRoomAction, dissolveRoom } = useTahoiyaRoomActions({ room, playerId, markRoomDissolved: resultReturnGate.markRoomDissolved, setRoom, setMessage });
  const { refreshJoinableRooms, createRoom, joinRoom, addTestPlayer, setDebugMode, setAnswererMode, setPlayMode,
    setTopicDifficulty, setManualAnswerer, setShowRealDefinitionToWriters, setActionTimeLimit, testWordGeneration } = useTahoiyaLobbyActions({
    room, playerId, playerName, avatarColor, avatarImage, passphrase, joinCode, runRoomAction,
    setRoom, setActivePlayerId, setJoinableRooms, setMessage,
  });
  const { forceAdvanceToVoting, forceAdvanceToResult, startRound, submitDefinition, polishDefinition, castVote, nextRound } = useTahoiyaGameActions({
    room, activePlayer, playerId, isHost, isDebugMode, isAnswerer, isAllVoteMode, writingDone, votingDone,
    definitionInput, selectedOptionId, isStarting, isPolishing: isPolishingDefinition, runRoomAction,
    setRoom, setActivePlayerId, setDefinitionInput, setSelectedOptionId, setPolishMessage, setMessage,
    setIsStarting, setIsPolishing: setIsPolishingDefinition,
  });
  const { autoFillTestDefinitions, autoFillTestVotes, skipDebugTopic, abortGame } = useTahoiyaDebugActions({
    room, playerId, isHost, isDebugMode, skipReason, skipComment, isSkipping: isSkippingTopic, runRoomAction,
    setRoom, setActivePlayerId, setDefinitionInput, setSelectedOptionId, setPolishMessage,
    setSkipReason, setSkipComment, setMessage, setIsSkipping: setIsSkippingTopic,
  });
  return (
    <main className={`min-h-screen bg-slate-950 text-slate-950 ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Dictionary bluffing" title="たほい屋">
        {(!room || room.phase === "lobby") && (room && isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
        <GameTopMenu>
            {room && room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
            <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
            <PaidLlmAccessButton variant="menu" />
            {room && isHost && (
              <DebugModeButton
                variant="menu"
                enabled={Boolean(room.debugMode)}
                disabled={room.phase !== "lobby"}
                onAbort={room.debugMode && room.phase !== "lobby" ? abortGame : undefined}
                replayEnabled={Boolean(room.debugReplayEnabled)}
                onReplayChange={(enabled) => void runRoomAction({ type: "set-debug-replay", actorId: playerId, enabled })}
                onChange={setDebugMode}
              />
            )}
        </GameTopMenu>
        <GamePlayerMenu id={playerId || undefined} name={playerName || "未ログイン"} avatarColor={avatarColor} avatarImage={avatarImage} />
      </GameTopBanner>
      {room && <div className="mx-auto max-w-6xl px-4 pt-4"><PlayerTimeoutNotice playerTimeouts={room.playerTimeouts} playerTimeoutNotice={room.playerTimeoutNotice} currentPlayerId={playerId} onRecover={() => runRoomAction({ type: "recover-player", actorId: playerId }).then(() => undefined)} /></div>}

      <TahoiyaRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <GameAdSlot
        gameId="tahoiya"
        surface={!room ? "game-entry" : room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null}
        disabled={Boolean(room?.debugMode)}
      />

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <TahoiyaRoomPanel
            room={room}
            passphrase={passphrase} joinCode={joinCode} joinableRooms={joinableRooms}
            answerer={answerer} answererCandidates={answererCandidates} roomConfigItems={roomConfigItems}
            activePlayer={activePlayer} activePlayerId={activePlayerId} playerName={playerName}
            isHost={isHost} isDebugMode={isDebugMode} isStarting={isStarting} message={message}
            onPassphraseChange={setPassphrase} onJoinCodeChange={setJoinCode} onActivePlayerChange={setActivePlayerId}
            onCreateRoom={() => void createRoom()} onRefreshRooms={() => void refreshJoinableRooms()} onJoinRoom={(code) => void joinRoom(code)}
            onPlayModeChange={setPlayMode} onDifficultyChange={setTopicDifficulty} onAnswererModeChange={setAnswererMode}
            onAnswererChange={setManualAnswerer} onShowDefinitionChange={setShowRealDefinitionToWriters} onTimeLimitChange={setActionTimeLimit}
            onTestWordGeneration={testWordGeneration} onAddTestPlayer={addTestPlayer} onStartRound={() => void startRound()} onDissolveRoom={() => void dissolveRoom()}
          />

          {room && <TahoiyaScorePanel room={room} players={sortedScores} />}
        </aside>

        <section className="space-y-4">
          {!room ? <TahoiyaEmptyState /> : (
            <>
              <TahoiyaRoundOverview room={room} isAnswerer={isAnswerer} remainingSeconds={remainingSeconds}
                isDebugMode={isDebugMode} isHost={isHost} nextWriter={nextWriter} nextVoter={nextVoter}
                skipReason={skipReason} skipComment={skipComment} skipReasons={tahoiyaSkipReasons} isSkipping={isSkippingTopic}
                onReasonChange={setSkipReason} onCommentChange={setSkipComment} onSkip={() => void skipDebugTopic()}
              />

              {room.phase === "writing" && <TahoiyaWritingPanel room={room} activePlayer={activePlayer} isAnswerer={isAnswerer}
                submittedCount={submittedCount(room)} writerCount={definitionWriterCount} hasSubmitted={hasActivePlayerSubmitted} writingDone={writingDone}
                definitionInput={definitionInput} polishMessage={polishMessage} isPolishing={isPolishingDefinition} isHost={isHost} isDebugMode={isDebugMode}
                onDefinitionChange={(value) => { setDefinitionInput(value); setPolishMessage(""); }}
                onEditSubmitted={() => setDefinitionInput(room.fakeDefinitions[activePlayer?.id ?? ""] ?? "")}
                onPolish={() => void polishDefinition()} onSubmit={submitDefinition} onAutoFill={autoFillTestDefinitions} onAdvance={forceAdvanceToVoting}
              />}

              {room.phase === "voting" && <TahoiyaVotingPanel room={room} activePlayer={activePlayer} voteCount={voterCount(room)} voterTarget={voterTarget}
                isAllVoteMode={isAllVoteMode} isAnswerer={isAnswerer} hasVoted={hasActivePlayerVoted} votingDone={votingDone}
                displayedOptionId={displayedVoteOptionId} selectedOptionId={selectedOptionId} isHost={isHost} isDebugMode={isDebugMode}
                onSelect={setSelectedOptionId} onVote={castVote} onAutoFill={autoFillTestVotes} onAdvance={forceAdvanceToResult}
              />}
              {room.phase === "result" && <TahoiyaResultPanel room={room} playerId={operationPlayerId} reasons={tahoiyaFeedbackReasons}
                isHost={isHost} canReturn={isHost || resultReturnGate.canReturnToRoom} isDissolved={resultReturnGate.isRoomDissolved}
                onReturn={isHost ? nextRound : () => { void resultReturnGate.returnToRoom(loadRoomFromStore, () => setMessage("部屋に戻れません。解散されたか、参加情報が変更されています。")); }}
                onDissolve={isHost ? dissolveRoom : undefined}
              />}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
