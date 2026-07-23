"use client";

import Link from "next/link";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { DebugModeButton } from "../components/DebugModeButton";
import { GameAdSlot } from "../components/GameAdSlot";
import { GameLoungeVisual } from "../components/GameLoungeVisual";
import { PlayerTimeoutNotice } from "../components/PlayerTimeoutNotice";
import { GameTopBanner, gameTopBannerOffsetClass } from "../components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "../components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "../components/OnlineRoomSpectatorLink";
import { GamePlayerMenu } from "../components/GamePlayerMenu";
import { TahoiyaRulesDialog } from "./TahoiyaRulesDialog";
import { TahoiyaRoomPanel } from "./TahoiyaRoomPanel";
import { TahoiyaRoundOverview } from "./TahoiyaRoundOverview";
import { TahoiyaWritingPanel } from "./TahoiyaWritingPanel";
import { TahoiyaVotingPanel } from "./TahoiyaVotingPanel";
import { TahoiyaResultPanel } from "./TahoiyaResultPanel";
import { submittedCount, voterCount } from "./use-tahoiya-view-model";
import { TahoiyaEmptyState, TahoiyaScorePanel } from "./TahoiyaScorePanel";
import type { TahoiyaController } from "./use-tahoiya-controller";

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

export function TahoiyaDesktopLayout({ controller }: { controller: TahoiyaController }) {
  const { state, setters, viewModel, permissions, actions, result } = controller;
  const { room, playerId, playerName, avatarColor, avatarImage, passphrase, joinCode,
    joinableRooms, activePlayerId, definitionIndex, definitionInput, selectedOptionId,
    isStarting, isPolishingDefinition, polishMessage, skipReason, skipComment,
    isSkippingTopic, message, rulesOpen } = state;
  const { isDebugMode, isHost, operationPlayerId, activePlayer } = permissions;
  const { isAllVoteMode, answererCandidates, answerer, isAnswerer, activePlayerDefinitions,
    hasActivePlayerSubmitted, hasActivePlayerVoted, displayedVoteOptionId, definitionTargetCount,
    writingDone, voterTarget, votingDone, remainingSeconds, nextWriter, nextVoter, sortedScores,
    roomConfigItems } = viewModel;

  return (
    <main className={`min-h-screen bg-slate-950 text-slate-950 ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Dictionary bluffing" title="たほい屋">
        {(!room || room.phase === "lobby") && (room && isHost
          ? <button type="button" onClick={() => void actions.dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
        {room && isHost && <DebugModeButton variant="banner" enabled={Boolean(room.debugMode)} disabled={room.phase !== "lobby"}
          onAbort={room.debugMode && room.phase !== "lobby" ? actions.abortGame : undefined}
          replayEnabled={Boolean(room.debugReplayEnabled)} onReplayChange={(enabled) => void actions.runRoomAction({ type: "set-debug-replay", actorId: playerId, enabled })}
          onChange={actions.setDebugMode} />}
        <GameTopMenu>
          {room && room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
          {room && <OnlineRoomSpectatorLink game="tahoiya" code={room.code} />}
          <button type="button" data-menu-close="true" onClick={() => setters.setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          <PaidLlmAccessButton variant="menu" />
        </GameTopMenu>
        <GamePlayerMenu id={playerId || undefined} name={playerName || "未ログイン"} avatarColor={avatarColor} avatarImage={avatarImage} />
      </GameTopBanner>
      {room && <div className="mx-auto max-w-6xl px-4 pt-4"><PlayerTimeoutNotice playerTimeouts={room.playerTimeouts} playerTimeoutNotice={room.playerTimeoutNotice} currentPlayerId={playerId} onRecover={() => actions.runRoomAction({ type: "recover-player", actorId: playerId }).then(() => undefined)} /></div>}
      <TahoiyaRulesDialog open={rulesOpen} onClose={() => setters.setRulesOpen(false)} />
      <GameAdSlot gameId="tahoiya" surface={!room ? "game-entry" : room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null} disabled={Boolean(room?.debugMode)} />
      {(!room || room.phase === "lobby") && <div className="mx-auto max-w-6xl px-4 pt-4"><GameLoungeVisual gameId="tahoiya" /></div>}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <TahoiyaRoomPanel room={room} passphrase={passphrase} joinCode={joinCode} joinableRooms={joinableRooms}
            answerer={answerer} answererCandidates={answererCandidates} roomConfigItems={roomConfigItems}
            activePlayer={activePlayer} activePlayerId={activePlayerId} playerName={playerName}
            isHost={isHost} isDebugMode={isDebugMode} isStarting={isStarting} message={message}
            onPassphraseChange={setters.setPassphrase} onJoinCodeChange={setters.setJoinCode}
            onActivePlayerChange={(value) => { setters.setActivePlayerId(value); setters.setDefinitionIndex(0); setters.setDefinitionInput(room?.fakeDefinitions[value]?.[0] ?? ""); setters.setPolishMessage(""); }}
            onCreateRoom={() => void actions.createRoom()} onRefreshRooms={() => void actions.refreshJoinableRooms()} onJoinRoom={(code) => void actions.joinRoom(code)}
            onPlayModeChange={actions.setPlayMode} onDifficultyChange={actions.setTopicDifficulty} onAnswererModeChange={actions.setAnswererMode}
            onAnswererChange={actions.setManualAnswerer} onShowDefinitionChange={actions.setShowRealDefinitionToWriters}
            onFakeDefinitionsPerPlayerChange={actions.setFakeDefinitionsPerPlayer} onTimeLimitChange={actions.setActionTimeLimit}
            onTestWordGeneration={actions.testWordGeneration} onTestDifficultyScreening={actions.testDifficultyScreening}
            onAddTestPlayer={actions.addTestPlayer} onStartRound={() => void actions.startRound()} onDissolveRoom={() => void actions.dissolveRoom()} />
          {room && <TahoiyaScorePanel room={room} players={sortedScores} />}
        </aside>
        <section className="space-y-4">
          {!room ? <TahoiyaEmptyState /> : <>
            <TahoiyaRoundOverview room={room} isAnswerer={isAnswerer} remainingSeconds={remainingSeconds}
              isDebugMode={isDebugMode} isHost={isHost} nextWriter={nextWriter} nextVoter={nextVoter}
              skipReason={skipReason} skipComment={skipComment} skipReasons={tahoiyaSkipReasons} isSkipping={isSkippingTopic}
              onReasonChange={setters.setSkipReason} onCommentChange={setters.setSkipComment} onSkip={() => void actions.skipDebugTopic()}
              onRemoveWaitingPlayer={(targetPlayerId, targetPlayerName) => void actions.removeWaitingPlayer(targetPlayerId, targetPlayerName)} />
            {room.phase === "writing" && <TahoiyaWritingPanel room={room} activePlayer={activePlayer} isAnswerer={isAnswerer}
              submittedCount={submittedCount(room)} definitionTargetCount={definitionTargetCount} activePlayerDefinitions={activePlayerDefinitions}
              definitionIndex={definitionIndex} hasSubmitted={hasActivePlayerSubmitted} writingDone={writingDone}
              definitionInput={definitionInput} polishMessage={polishMessage} isPolishing={isPolishingDefinition} isHost={isHost} isDebugMode={isDebugMode}
              onDefinitionChange={(value) => { setters.setDefinitionInput(value); setters.setPolishMessage(""); }}
              onDefinitionIndexChange={(index) => { setters.setDefinitionIndex(index); setters.setDefinitionInput(activePlayerDefinitions[index] ?? ""); setters.setPolishMessage(""); }}
              onEditSubmitted={() => setters.setDefinitionInput(activePlayerDefinitions[definitionIndex] ?? "")}
              onPolish={() => void actions.polishDefinition()} onSubmit={actions.submitDefinition} onAutoFill={actions.autoFillTestDefinitions} onAdvance={actions.forceAdvanceToVoting} />}
            {room.phase === "voting" && <TahoiyaVotingPanel room={room} activePlayer={activePlayer} voteCount={voterCount(room)} voterTarget={voterTarget}
              isAllVoteMode={isAllVoteMode} isAnswerer={isAnswerer} hasVoted={hasActivePlayerVoted} votingDone={votingDone}
              displayedOptionId={displayedVoteOptionId} selectedOptionId={selectedOptionId} isHost={isHost} isDebugMode={isDebugMode}
              onSelect={setters.setSelectedOptionId} onVote={actions.castVote} onAutoFill={actions.autoFillTestVotes} onAdvance={actions.forceAdvanceToResult} />}
            {room.phase === "result" && <TahoiyaResultPanel room={room} playerId={operationPlayerId} reasons={tahoiyaFeedbackReasons}
              isHost={isHost} canReturn={isHost || result.canReturnToRoom} isDissolved={result.isRoomDissolved}
              onReturn={isHost ? actions.nextRound : actions.returnToLobby} onDissolve={isHost ? actions.dissolveRoom : undefined} />}
          </>}
        </section>
      </section>
    </main>
  );
}
