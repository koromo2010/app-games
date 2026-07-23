"use client";

import { gameTopBannerOffsetClass } from "../components/GameTopBanner";
import { GameAdSlot } from "../components/GameAdSlot";
import { GameLoungeVisual } from "../components/GameLoungeVisual";
import { PageLoadingOverlay } from "../components/PageLoadingOverlay";
import { isOnlineRoomDebugPlayer } from "@/lib/online-room-access";
import { ClueLogPanel } from "./WordWolfPanels";
import { WordWolfActionPanels } from "./WordWolfActionPanels";
import { WordWolfEntryPanel } from "./WordWolfEntryPanel";
import { WordWolfLobbySettings } from "./WordWolfLobbySettings";
import { WordWolfPhaseStatus } from "./WordWolfPhaseStatus";
import { WordWolfHeader } from "./WordWolfHeader";
import { WordWolfResultPanel } from "./WordWolfResultPanel";
import { WordWolfRoomSidebar } from "./WordWolfRoomSidebar";
import { WordWolfRulesDialog } from "./WordWolfRulesDialog";
import type { WordWolfController } from "./use-wordwolf-controller";

export function WordWolfDesktopLayout({ controller }: { controller: WordWolfController }) {
  const { state, setters, viewModel, permissions, actions, result } = controller;
  const {
    room, activePlayerId, playerAccountId, playerName, roomPassphrase, joinCode, joinableRooms,
    isJoinListOpen, clueInput, guessInput, isGuessJudging, guessFeedbackMessage, error,
    avatarImage, isAvatarPickerOpen, isStarting, isClueSubmitting, isVoteSubmitting,
    isGuessFeedbackSaving, isRoomLifecyclePending, isRulesOpen, isMyPageOpen,
    ready,
  } = state;
  if (!ready) return <PageLoadingOverlay />;
  const {
    activePlayer, currentPlayer, wolfIds, wolfPlayers, accusedPlayer, accusedIsWolf,
    finalAnswerPlayer, nextVotePlayer, isDebugMode, voteActor, voteDisplayPlayer, headerName,
    headerAvatarColor, headerAvatarImage, ownWord, resultTitle, topicSourceLabel, voteVoters,
    votedCount, selectedVoteTargetId, clueParticipants, clueSubmittedCount, canSubmitClue,
    voteCandidates, allowedWolfCount, wolfCountOptions, isRunoffVote, runoffCandidateNames,
    roundProgressLabel, turnSecondsLeft, shouldShowClueLog, hasWolfInCurrentGame,
    isMyClueTurn, isMyVoteTurn, isMyFinalAnswerTurn, currentPlayerId,
  } = viewModel;

  const layoutClass = room && shouldShowClueLog
    ? "mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]"
    : "mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]";

  return (
    <main className={`min-h-screen bg-slate-950 text-slate-950 ${gameTopBannerOffsetClass}`}>
      <WordWolfHeader
        room={room} isHost={permissions.isHost} currentPlayerId={currentPlayerId} playerId={playerAccountId || undefined}
        debugControlledPlayerId={activePlayerId}
        playerName={playerName} headerName={headerName} avatarImage={avatarImage}
        headerAvatarColor={headerAvatarColor} headerAvatarImage={headerAvatarImage}
        isAvatarPickerOpen={isAvatarPickerOpen} isMyPageOpen={isMyPageOpen}
        onDissolve={() => void actions.dissolveRoom()} onOpenRules={() => setters.setIsRulesOpen(true)} onAbort={actions.abortGame}
        onDebugReplayChange={(enabled) => void actions.runRoomAction({ type: "set-debug-replay", enabled })}
        onDebugChange={(enabled) => { void actions.runRoomAction({ type: "set-debug", enabled }); setters.setError(""); }}
        debugParticipants={room?.players.filter(isOnlineRoomDebugPlayer) ?? []}
        onAddDebugParticipant={() => actions.runRoomAction({ type: "debug-add-player" }).then(() => undefined)}
        onRemoveDebugParticipant={(targetPlayerId) => actions.runRoomAction({ type: "debug-remove-player", targetPlayerId }).then((saved) => {
          if (saved && activePlayerId === targetPlayerId) setters.setActivePlayerId(saved.hostId);
        })}
        onSelectDebugPlayer={(playerId) => {
          setters.setActivePlayerId(playerId);
          localStorage.setItem("wordwolf-last-player", playerId);
        }}
        onTestWordGeneration={actions.testWordGeneration}
        onAvatarPickerOpenChange={setters.setIsAvatarPickerOpen} onPlayerNameChange={actions.updatePlayerName}
        onCommitPlayerName={actions.commitPlayerName} onAvatarColorChange={actions.updateAvatarColor}
        onAvatarImageChange={actions.updateAvatarImage} onAvatarUpload={actions.uploadAvatarImage}
        onMyPageOpenChange={setters.setIsMyPageOpen}
        onRecover={() => { void actions.runRoomAction({ type: "recover-player" }); }}
      />

      <WordWolfRulesDialog open={isRulesOpen} onClose={() => setters.setIsRulesOpen(false)} />

      <GameAdSlot
        gameId="wordwolf"
        surface={!room ? "game-entry" : room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null}
        disabled={Boolean(room?.debugMode)}
      />

      {(!room || room.phase === "lobby") && <div className="mx-auto max-w-7xl px-4 pt-4"><GameLoungeVisual gameId="wordwolf" /></div>}

      <section className={layoutClass}>
        <aside className="space-y-4">
          {!room && (
            <WordWolfEntryPanel
              playerName={playerName}
              roomPassphrase={roomPassphrase}
              joinCode={joinCode}
              joinableRooms={joinableRooms}
              isJoinListOpen={isJoinListOpen}
              isPending={isRoomLifecyclePending}
              onRoomPassphraseChange={setters.setRoomPassphrase}
              onJoinCodeChange={setters.setJoinCode}
              onCreateRoom={() => void actions.createRoom()}
              onShowJoinChoices={() => void actions.showJoinChoices()}
              onJoinRoom={(code) => void actions.joinRoom(code)}
            />
          )}

          {error && <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {room && (
            <WordWolfRoomSidebar
              room={room}
              activePlayerId={activePlayerId}
              isHost={permissions.isHost}
              onCopyRoomCode={() => void actions.copyRoomCode()}
              onCopyRoomInvite={() => void actions.copyRoomInvite()}
              onDissolveRoom={() => void actions.dissolveRoom()}
              canReturnToRoom={permissions.isHost || result.canReturnToRoom}
              isRoomDissolved={result.isRoomDissolved}
              onReturnToRoom={permissions.isHost ? actions.resetRoom : actions.returnToRoom}
              onRemoveWaitingPlayer={(targetPlayerId, targetName) => { if (window.confirm(`${targetName}さんを退出扱いにしますか？`)) void actions.runRoomAction({ type: "remove-waiting-player", targetPlayerId }); }}
            >
              {room.phase === "lobby" && (
                <WordWolfLobbySettings
                  room={room}
                  isHost={permissions.canEditRoomSettings}
                  isStarting={isStarting}
                  allowedWolfCount={allowedWolfCount}
                  wolfCountOptions={wolfCountOptions}
                  onGameModeChange={actions.setGameMode}
                  onWolfCountChange={actions.setWolfCount}
                  onRoundsTotalChange={(roundsTotal) => void actions.runRoomAction({ type: "update-config", config: { roundsTotal } }, true)}
                  onClueModeChange={actions.setClueMode}
                  onTurnTimeLimitChange={actions.setTurnTimeLimit}
                  onRandomizeTurnOrderChange={actions.setRandomizeTurnOrder}
                  onTopicDictionarySourceChange={actions.setTopicDictionarySource}
                  onTopicHintChange={actions.setTopicHint}
                  onTopicPairDistanceChange={actions.setTopicPairDistance}
                  onTopicDifficultyChange={actions.setTopicDifficulty}
                  onClueLogVisibilityChange={actions.setClueLogVisibility}
                  onStartGame={actions.startGame}
                />
              )}
            </WordWolfRoomSidebar>
          )}
        </aside>

        <section className="space-y-4">
          {!room ? (
            <div className="min-h-[560px] rounded-lg border border-white/10 bg-white/[0.96] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
              <div className="grid min-h-[500px] place-items-center rounded-lg border border-dashed border-cyan-200 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#ecfeff_100%)]">
                <div className="max-w-md text-center">
                  <p className="text-sm font-semibold text-cyan-700">準備完了</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">名前を入れて部屋を作成</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">まずは名前を入力して、部屋を作成するか参加できる部屋を選んでください。1人で動作確認するときは、部屋作成後にデバッグモードをONにすると流れを確認できます。</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <WordWolfPhaseStatus
                room={room}
                isHost={permissions.isHost}
                isMyClueTurn={isMyClueTurn}
                isMyVoteTurn={isMyVoteTurn}
                isMyFinalAnswerTurn={isMyFinalAnswerTurn}
                isRunoffVote={isRunoffVote}
                clueSubmittedCount={clueSubmittedCount}
                clueParticipantCount={clueParticipants.length}
                votedCount={votedCount}
                voteVoterCount={voteVoters.length}
                currentPlayerName={currentPlayer?.name}
                activePlayerName={activePlayer?.name}
                nextVotePlayerName={nextVotePlayer?.name}
                finalAnswerPlayerName={finalAnswerPlayer?.name}
                accusedPlayerName={accusedPlayer?.name}
                ownWord={ownWord}
                roundProgressLabel={roundProgressLabel}
                resultTitle={resultTitle}
                isDebugMode={isDebugMode}
              />

              <WordWolfActionPanels
                room={room}
                currentPlayer={currentPlayer}
                runoffCandidateNames={runoffCandidateNames}
                clueSubmittedCount={clueSubmittedCount}
                clueParticipantCount={clueParticipants.length}
                turnSecondsLeft={turnSecondsLeft}
                clueInput={clueInput}
                setClueInput={setters.setClueInput}
                onClueKeyDown={actions.submitClueOnEnter}
                onSubmitClue={() => void actions.submitClue()}
                isClueSubmitting={isClueSubmitting}
                canSubmitClue={permissions.canSubmitClue || canSubmitClue}
                isMyClueTurn={permissions.canSubmitClue || isMyClueTurn}
                isMyVoteTurn={permissions.canVote}
                isRunoffVote={isRunoffVote}
                votedCount={votedCount}
                voteVoterCount={voteVoters.length}
                voteDisplayPlayer={voteDisplayPlayer}
                voteActor={voteActor}
                isDebugMode={isDebugMode}
                voteCandidates={voteCandidates}
                selectedVoteTargetId={selectedVoteTargetId}
                onCastVote={(targetPlayerId) => void actions.castVote(targetPlayerId)}
                isVoteSubmitting={isVoteSubmitting}
                isMyFinalAnswerTurn={permissions.canSubmitFinalAnswer}
                accusedPlayer={accusedPlayer}
                guessInput={guessInput}
                setGuessInput={setters.setGuessInput}
                onGuessKeyDown={actions.submitGuessOnEnter}
                onSubmitGuess={() => void actions.submitWolfGuess()}
                isGuessJudging={isGuessJudging}
              />

              {room.phase === "result" && (
                <WordWolfResultPanel
                  room={room}
                  resultTitle={resultTitle}
                  hasWolf={hasWolfInCurrentGame}
                  wolfPlayers={wolfPlayers}
                  accusedPlayerName={accusedPlayer?.name}
                  accusedIsWolf={accusedIsWolf}
                  topicSourceLabel={topicSourceLabel}
                  feedbackPlayerId={activePlayerId || playerAccountId}
                  wolfCount={wolfIds.length}
                  guessFeedbackMessage={guessFeedbackMessage}
                  isGuessFeedbackSaving={isGuessFeedbackSaving}
                  onGuessFeedback={(accepted) => void actions.submitGuessFeedback(accepted)}
                  canReturnToRoom={permissions.isHost || result.canReturnToRoom}
                  isHost={permissions.isHost}
                  isRoomDissolved={result.isRoomDissolved}
                  onReturnToRoom={permissions.isHost ? actions.resetRoom : actions.returnToRoom}
                  onDissolve={permissions.canDissolve ? actions.dissolveRoom : undefined}
                />
              )}
            </>
          )}
        </section>

        {shouldShowClueLog && room && (
          <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-[104px] xl:self-start">
            <ClueLogPanel room={room} />
          </aside>
        )}
      </section>
    </main>
  );
}
