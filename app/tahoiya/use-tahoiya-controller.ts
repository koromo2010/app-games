"use client";

import { useEffect, useRef, useState } from "react";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import type { TahoiyaRoom, TahoiyaRoomChoice } from "@/lib/tahoiya-types";
import { useTahoiyaViewModel } from "./use-tahoiya-view-model";
import { useTahoiyaLobbyActions } from "./use-tahoiya-lobby-actions";
import { useTahoiyaGameActions } from "./use-tahoiya-game-actions";
import { useTahoiyaDebugActions } from "./use-tahoiya-debug-actions";
import { useTahoiyaRoomSession } from "./use-tahoiya-room-session";
import { useTahoiyaRoomActions } from "./use-tahoiya-room-actions";
import { rememberTahoiyaDeviceTopic, syncTahoiyaDeviceTopicHistory } from "./tahoiya-device-topic-history";

export function useTahoiyaController() {
  const [room, setRoom] = useState<TahoiyaRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [avatarColor, setAvatarColor] = useState(fallbackAvatarColor);
  const [avatarImage, setAvatarImage] = useState<string | null>(defaultAvatarImage);
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<TahoiyaRoomChoice[]>([]);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [definitionIndex, setDefinitionIndex] = useState(0);
  const [definitionInput, setDefinitionInput] = useState("");
  const timeoutDefinitionKeyRef = useRef("");
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

  useEffect(() => {
    if (!playerId) return;
    void syncTahoiyaDeviceTopicHistory().catch(() => false);
  }, [playerId]);

  useEffect(() => {
    if (!room?.word || room.topicSource === "pending") return;
    void rememberTahoiyaDeviceTopic(room.word).catch(() => []);
  }, [room?.topicSource, room?.word]);

  const isDebugMode = Boolean(room?.debugMode);
  const operationPlayerId = isDebugMode ? activePlayerId : playerId;
  const activePlayer = room?.players.find((player) => player.id === operationPlayerId) ?? null;
  const isHost = Boolean(room && playerId === room.hostId);
  const viewModel = useTahoiyaViewModel(room, activePlayer, selectedOptionId, definitionIndex, now);

  const { runRoomAction, dissolveRoom } = useTahoiyaRoomActions({ room, playerId, markRoomDissolved: resultReturnGate.markRoomDissolved, setRoom, setMessage });
  const lobbyActions = useTahoiyaLobbyActions({
    room, playerId, playerName, avatarColor, avatarImage, passphrase, joinCode, runRoomAction,
    setRoom, setActivePlayerId, setJoinableRooms, setMessage,
  });
  const gameActions = useTahoiyaGameActions({
    room, activePlayer, playerId, isHost, isDebugMode, isAnswerer: viewModel.isAnswerer,
    isAllVoteMode: viewModel.isAllVoteMode, writingDone: viewModel.writingDone,
    votingDone: viewModel.votingDone, definitionIndex, definitionInput, selectedOptionId,
    isStarting, isPolishing: isPolishingDefinition, runRoomAction, setRoom, setActivePlayerId,
    setDefinitionIndex, setDefinitionInput, setSelectedOptionId, setPolishMessage, setMessage,
    setIsStarting, setIsPolishing: setIsPolishingDefinition,
  });
  const debugActions = useTahoiyaDebugActions({
    room, playerId, isHost, isDebugMode, skipReason, skipComment, isSkipping: isSkippingTopic,
    runRoomAction, setRoom, setActivePlayerId, setDefinitionInput, setSelectedOptionId,
    setPolishMessage, setSkipReason, setSkipComment, setMessage, setIsSkipping: setIsSkippingTopic,
  });

  useEffect(() => {
    if (!room || room.phase !== "writing" || viewModel.remainingSeconds !== 0 || !activePlayer || viewModel.isAnswerer || viewModel.writingDone || !definitionInput.trim()) return;
    const key = `${room.code}:${room.round}:${room.phaseStartedAt}:${activePlayer.id}:${definitionIndex}`;
    if (timeoutDefinitionKeyRef.current === key) return;
    timeoutDefinitionKeyRef.current = key;
    void gameActions.submitDefinition();
  }, [activePlayer, definitionIndex, definitionInput, gameActions, room, viewModel.isAnswerer, viewModel.remainingSeconds, viewModel.writingDone]);

  return {
    state: {
      room, playerId, playerName, avatarColor, avatarImage, passphrase, joinCode, joinableRooms,
      activePlayerId, definitionIndex, definitionInput, selectedOptionId, isStarting,
      isPolishingDefinition, polishMessage, skipReason, skipComment, isSkippingTopic, message,
      rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setActivePlayerId, setDefinitionIndex, setDefinitionInput,
      setSelectedOptionId, setPolishMessage, setSkipReason, setSkipComment, setRulesOpen,
    },
    viewModel,
    permissions: { isDebugMode, isHost, operationPlayerId, activePlayer },
    actions: { runRoomAction, dissolveRoom, ...lobbyActions, ...gameActions, ...debugActions },
    result: resultReturnGate,
  };
}

export type TahoiyaController = ReturnType<typeof useTahoiyaController>;
