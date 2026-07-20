"use client";

import { useCallback, useState } from "react";
import {
  fallbackAvatarColor,
} from "@/lib/player-session";
import { gameTopBannerOffsetClass } from "../components/GameTopBanner";
import { GameAdSlot } from "../components/GameAdSlot";
import { GameLoungeVisual } from "../components/GameLoungeVisual";
import { useRoomResultReturnGate } from "../hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "../hooks/use-room-lobby-return-confirmation";
import type {
  Room,
  RoomChoice,
  WordWolfRoomAction,
} from "@/lib/wordwolf-game-types";
import { ClueLogPanel } from "./WordWolfPanels";
import { WordWolfActionPanels } from "./WordWolfActionPanels";
import { WordWolfEntryPanel } from "./WordWolfEntryPanel";
import { WordWolfLobbySettings } from "./WordWolfLobbySettings";
import { WordWolfPhaseStatus } from "./WordWolfPhaseStatus";
import { WordWolfHeader } from "./WordWolfHeader";
import { WordWolfResultPanel } from "./WordWolfResultPanel";
import { WordWolfRoomSidebar } from "./WordWolfRoomSidebar";
import { WordWolfRulesDialog } from "./WordWolfRulesDialog";
import { applyWordWolfRoomAction } from "./wordwolf-room-api-client";
import {
  loadRoomFromStore,
  saveRoom,
  saveRoomDefaultsToStore,
} from "./wordwolf-room-adapter";
import { useWordWolfLobbyActions } from "./use-wordwolf-lobby-actions";
import { useWordWolfGameActions } from "./use-wordwolf-game-actions";
import { useWordWolfRoomLifecycle } from "./use-wordwolf-room-lifecycle";
import { useWordWolfPlayerProfile } from "./use-wordwolf-player-profile";
import { useWordWolfViewModel } from "./use-wordwolf-view-model";
import { useWordWolfRoomSession } from "./use-wordwolf-room-session";

export function WordWolfGame() {
  const [room, setRoom] = useState<Room | null>(null);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [playerAccountId, setPlayerAccountId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [roomPassphrase, setRoomPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<RoomChoice[]>([]);
  const [isJoinListOpen, setIsJoinListOpen] = useState(false);
  const [clueInput, setClueInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isGuessJudging, setIsGuessJudging] = useState(false);
  const [guessFeedbackMessage, setGuessFeedbackMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: playerAccountId, resultPhase: "result", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });
  useWordWolfRoomSession({
    room, isRoomDissolved: resultReturnGate.isRoomDissolved, acceptIncomingRoom: resultReturnGate.acceptIncomingRoom,
    markRoomDissolved: resultReturnGate.markRoomDissolved, setRoom, setActivePlayerId, setPlayerAccountId,
    setPlayerName, setAvatarColor, setAvatarImage, setError,
  });

  const { activePlayer, currentPlayer, wolfIds, wolfPlayers, accusedPlayer, accusedIsWolf, finalAnswerPlayer, nextVotePlayer, isDebugMode, voteActor, voteDisplayPlayer, headerName, headerAvatarColor, headerAvatarImage, ownWord, resultTitle, topicSourceLabel, voteVoters, votedCount, selectedVoteTargetId, clueParticipants, clueSubmittedCount, canSubmitClue, voteCandidates, allowedWolfCount, wolfCountOptions, isRunoffVote, runoffCandidateNames, roundProgressLabel, turnSecondsLeft, shouldShowClueLog, hasWolfInCurrentGame, isMyClueTurn, isMyVoteTurn, isMyFinalAnswerTurn, clueActorId, currentPlayerId, guessActorId } = useWordWolfViewModel(room, activePlayerId, playerName, avatarColor, avatarImage);
  const isHost = Boolean(room && playerAccountId === room.hostId);
  const wordwolfLayoutClass = room && shouldShowClueLog ? "mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]" : "mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]";
  const runRoomAction = useCallback(async (action: WordWolfRoomAction, persistDefaults = false) => {
    if (!room) return null;
    try {
      const saved = await applyWordWolfRoomAction(room.code, action);
      saveRoom(saved);
      setRoom(saved);
      if (persistDefaults) void saveRoomDefaultsToStore(saved);
      localStorage.setItem("wordwolf-last-room", saved.code);
      setError("");
      return saved;
    } catch {
      setError("部屋の更新に失敗しました。最新状態を確認してもう一度お試しください。");
      return null;
    }
  }, [room]);
  useRoomLobbyReturnConfirmation({ room, playerId: playerAccountId, confirmReturn: () => runRoomAction({ type: "confirm-lobby-return" }) });

  const { updatePlayerName, commitPlayerName, updateAvatarColor, updateAvatarImage, uploadAvatarImage } = useWordWolfPlayerProfile({
    room,
    activePlayerId,
    playerName,
    avatarColor,
    avatarImage,
    setPlayerName,
    setAvatarColor,
    setAvatarImage,
    setIsAvatarPickerOpen,
    setError,
    runRoomAction,
  });
  const { addSeat, setClueLogVisibility, setGameMode, setWolfCount, setClueMode, setRandomizeTurnOrder, setTurnTimeLimit, setTopicDictionarySource, setTopicPairDistance, setTopicDifficulty, setTopicHint, testWordGeneration } = useWordWolfLobbyActions(room, runRoomAction);
  const { createRoom, showJoinChoices, joinRoom, dissolveRoom, copyRoomCode, copyRoomInvite } = useWordWolfRoomLifecycle({
    room, isHost, activePlayerId, playerAccountId, playerName, avatarColor, avatarImage, roomPassphrase, joinCode,
    setRoom, setActivePlayerId, setJoinCode, setJoinableRooms, setIsJoinListOpen, setError,
    markRoomDissolved: resultReturnGate.markRoomDissolved,
  });
  const { startGame, submitClue, submitClueOnEnter, castVote, submitWolfGuess, submitGuessOnEnter, submitGuessFeedback, resetRoom, abortGame } = useWordWolfGameActions({
    room, turnSecondsLeft, clueActorId, currentPlayerId, voteActorId: voteActor?.id ?? "", guessActorId,
    clueInput, guessInput, isGuessJudging, isStarting, setRoom, setClueInput, setGuessInput,
    setIsGuessJudging, setIsStarting, setGuessFeedbackMessage, setError, runRoomAction,
  });


  return (
    <main className={`min-h-screen bg-slate-950 text-slate-950 ${gameTopBannerOffsetClass}`}>
      <WordWolfHeader
        room={room} isHost={isHost} currentPlayerId={currentPlayerId} playerId={playerAccountId || undefined}
        playerName={playerName} headerName={headerName} avatarImage={avatarImage}
        headerAvatarColor={headerAvatarColor} headerAvatarImage={headerAvatarImage}
        isAvatarPickerOpen={isAvatarPickerOpen} isMyPageOpen={isMyPageOpen}
        onDissolve={() => void dissolveRoom()} onOpenRules={() => setIsRulesOpen(true)} onAbort={abortGame}
        onDebugReplayChange={(enabled) => void runRoomAction({ type: "set-debug-replay", enabled })}
        onDebugChange={(enabled) => { void runRoomAction({ type: "set-debug", enabled }); setError(""); }}
        onAvatarPickerOpenChange={setIsAvatarPickerOpen} onPlayerNameChange={updatePlayerName}
        onCommitPlayerName={commitPlayerName} onAvatarColorChange={updateAvatarColor}
        onAvatarImageChange={updateAvatarImage} onAvatarUpload={uploadAvatarImage}
        onMyPageOpenChange={setIsMyPageOpen}
        onRecover={() => { void runRoomAction({ type: "recover-player" }); }}
      />

      <WordWolfRulesDialog open={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

      <GameAdSlot
        gameId="wordwolf"
        surface={!room ? "game-entry" : room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null}
        disabled={Boolean(room?.debugMode)}
      />

      {(!room || room.phase === "lobby") && <div className="mx-auto max-w-7xl px-4 pt-4"><GameLoungeVisual gameId="wordwolf" /></div>}

      <section className={wordwolfLayoutClass}>
        <aside className="space-y-4">
          {!room && (
            <WordWolfEntryPanel
              playerName={playerName}
              roomPassphrase={roomPassphrase}
              joinCode={joinCode}
              joinableRooms={joinableRooms}
              isJoinListOpen={isJoinListOpen}
              onRoomPassphraseChange={setRoomPassphrase}
              onJoinCodeChange={setJoinCode}
              onCreateRoom={() => void createRoom()}
              onShowJoinChoices={() => void showJoinChoices()}
              onJoinRoom={(code) => void joinRoom(code)}
            />
          )}

          {error && <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {room && (
            <WordWolfRoomSidebar
              room={room}
              activePlayerId={activePlayerId}
              isHost={isHost}
              onSelectPlayer={(playerId) => { setActivePlayerId(playerId); localStorage.setItem("wordwolf-last-player", playerId); }}
              onCopyRoomCode={() => void copyRoomCode()}
              onCopyRoomInvite={() => void copyRoomInvite()}
              onDissolveRoom={() => void dissolveRoom()}
              onRemoveWaitingPlayer={(targetPlayerId, playerName) => { if (window.confirm(`${playerName}さんを退出扱いにしますか？`)) void runRoomAction({ type: "remove-waiting-player", targetPlayerId }); }}
            >
              {room.phase === "lobby" && (
                <WordWolfLobbySettings
                  room={room}
                  isHost={isHost}
                  isStarting={isStarting}
                  allowedWolfCount={allowedWolfCount}
                  wolfCountOptions={wolfCountOptions}
                  onGameModeChange={setGameMode}
                  onWolfCountChange={setWolfCount}
                  onRoundsTotalChange={(roundsTotal) => void runRoomAction({ type: "update-config", config: { roundsTotal } }, true)}
                  onClueModeChange={setClueMode}
                  onTurnTimeLimitChange={setTurnTimeLimit}
                  onRandomizeTurnOrderChange={setRandomizeTurnOrder}
                  onTopicDictionarySourceChange={setTopicDictionarySource}
                  onTopicHintChange={setTopicHint}
                  onTopicPairDistanceChange={setTopicPairDistance}
                  onTopicDifficultyChange={setTopicDifficulty}
                  onClueLogVisibilityChange={setClueLogVisibility}
                  onTestWordGeneration={testWordGeneration}
                  onAddSeat={addSeat}
                  onStartGame={startGame}
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
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    まずは名前を入力して、部屋を作成するか参加できる部屋を選んでください。1人で動作確認するときは、部屋作成後にデバッグモードをONにすると流れを確認できます。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <WordWolfPhaseStatus
                room={room}
                isHost={isHost}
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
                setClueInput={setClueInput}
                onClueKeyDown={submitClueOnEnter}
                onSubmitClue={() => void submitClue()}
                canSubmitClue={canSubmitClue}
                isMyClueTurn={isMyClueTurn}
                isMyVoteTurn={isMyVoteTurn}
                isRunoffVote={isRunoffVote}
                votedCount={votedCount}
                voteVoterCount={voteVoters.length}
                voteDisplayPlayer={voteDisplayPlayer}
                voteActor={voteActor}
                isDebugMode={isDebugMode}
                voteCandidates={voteCandidates}
                selectedVoteTargetId={selectedVoteTargetId}
                onCastVote={(playerId) => void castVote(playerId)}
                isMyFinalAnswerTurn={isMyFinalAnswerTurn}
                accusedPlayer={accusedPlayer}
                guessInput={guessInput}
                setGuessInput={setGuessInput}
                onGuessKeyDown={submitGuessOnEnter}
                onSubmitGuess={() => void submitWolfGuess()}
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
                  onGuessFeedback={(accepted) => void submitGuessFeedback(accepted)}
                  canReturnToRoom={isHost || resultReturnGate.canReturnToRoom}
                  isHost={isHost}
                  isRoomDissolved={resultReturnGate.isRoomDissolved}
                  onReturnToRoom={isHost ? resetRoom : () => resultReturnGate.returnToRoom(loadRoomFromStore, () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"))}
                  onDissolve={isHost ? dissolveRoom : undefined}
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
