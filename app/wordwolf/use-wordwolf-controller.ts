"use client";

import { useCallback, useState } from "react";
import { fallbackAvatarColor } from "@/lib/player-session";
import type { Room, RoomChoice, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { useRoomResultReturnGate } from "../hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "../hooks/use-room-lobby-return-confirmation";
import { applyWordWolfRoomAction } from "./wordwolf-room-api-client";
import { loadRoomFromStore, saveRoom, saveRoomDefaultsToStore } from "./wordwolf-room-adapter";
import { useWordWolfLobbyActions } from "./use-wordwolf-lobby-actions";
import { useWordWolfGameActions } from "./use-wordwolf-game-actions";
import { useWordWolfRoomLifecycle } from "./use-wordwolf-room-lifecycle";
import { useWordWolfPlayerProfile } from "./use-wordwolf-player-profile";
import { useWordWolfViewModel } from "./use-wordwolf-view-model";
import { useWordWolfRoomSession } from "./use-wordwolf-room-session";
import { createWordWolfViewPermissions } from "./wordwolf-view-permissions";

export function useWordWolfController() {
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

  const resultReturnGate = useRoomResultReturnGate({
    room,
    setRoom,
    playerId: playerAccountId,
    resultPhase: "result",
    onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  });

  useWordWolfRoomSession({
    room,
    isRoomDissolved: resultReturnGate.isRoomDissolved,
    acceptIncomingRoom: resultReturnGate.acceptIncomingRoom,
    markRoomDissolved: resultReturnGate.markRoomDissolved,
    setRoom,
    setActivePlayerId,
    setPlayerAccountId,
    setPlayerName,
    setAvatarColor,
    setAvatarImage,
    setError,
  });

  const viewModel = useWordWolfViewModel(room, activePlayerId, playerName, avatarColor, avatarImage);

  const permissions = createWordWolfViewPermissions({
    room,
    playerAccountId,
    isMyClueTurn: viewModel.isMyClueTurn,
    isMyVoteTurn: viewModel.isMyVoteTurn,
    isMyFinalAnswerTurn: viewModel.isMyFinalAnswerTurn,
    canSubmitClue: viewModel.canSubmitClue,
    ownWord: viewModel.ownWord,
  });

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

  useRoomLobbyReturnConfirmation({
    room,
    playerId: playerAccountId,
    confirmReturn: () => runRoomAction({ type: "confirm-lobby-return" }),
  });

  const playerProfile = useWordWolfPlayerProfile({
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

  const lobbyActions = useWordWolfLobbyActions(room, runRoomAction);

  const roomLifecycle = useWordWolfRoomLifecycle({
    room,
    isHost: permissions.isHost,
    activePlayerId,
    playerAccountId,
    playerName,
    avatarColor,
    avatarImage,
    roomPassphrase,
    joinCode,
    setRoom,
    setActivePlayerId,
    setJoinCode,
    setJoinableRooms,
    setIsJoinListOpen,
    setError,
    markRoomDissolved: resultReturnGate.markRoomDissolved,
  });

  const gameActions = useWordWolfGameActions({
    room,
    turnSecondsLeft: viewModel.turnSecondsLeft,
    clueActorId: viewModel.clueActorId,
    currentPlayerId: viewModel.currentPlayerId,
    voteActorId: viewModel.voteActor?.id ?? "",
    guessActorId: viewModel.guessActorId,
    clueInput,
    guessInput,
    isGuessJudging,
    isStarting,
    setRoom,
    setClueInput,
    setGuessInput,
    setIsGuessJudging,
    setIsStarting,
    setGuessFeedbackMessage,
    setError,
    runRoomAction,
  });

  return {
    state: {
      room,
      activePlayerId,
      playerAccountId,
      playerName,
      roomPassphrase,
      joinCode,
      joinableRooms,
      isJoinListOpen,
      clueInput,
      guessInput,
      isGuessJudging,
      guessFeedbackMessage,
      error,
      avatarColor,
      avatarImage,
      isAvatarPickerOpen,
      isStarting,
      isRulesOpen,
      isMyPageOpen,
    },
    setters: {
      setActivePlayerId,
      setRoomPassphrase,
      setJoinCode,
      setClueInput,
      setGuessInput,
      setIsRulesOpen,
      setIsMyPageOpen,
      setIsAvatarPickerOpen,
      setError,
    },
    viewModel,
    permissions,
    actions: {
      runRoomAction,
      ...playerProfile,
      ...lobbyActions,
      ...roomLifecycle,
      ...gameActions,
      returnToRoom: () => resultReturnGate.returnToRoom(
        loadRoomFromStore,
        () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
      ),
    },
    result: {
      canReturnToRoom: resultReturnGate.canReturnToRoom,
      isRoomDissolved: resultReturnGate.isRoomDissolved,
    },
  };
}

export type WordWolfController = ReturnType<typeof useWordWolfController>;
