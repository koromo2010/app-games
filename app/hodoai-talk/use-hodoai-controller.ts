"use client";

import { useState } from "react";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import type { HodoaiRoom, HodoaiRoomChoice } from "@/lib/hodoai-talk";
import { createHodoaiViewPermissions } from "./hodoai-view-permissions";
import { useHodoaiRoomActions } from "./use-hodoai-room-actions";
import { useHodoaiRoomSession } from "./use-hodoai-room-session";
import { useHodoaiViewModel } from "./use-hodoai-view-model";
import { hodoaiRoomApi } from "./hodoai-room-api-client";

export function useHodoaiController() {
  const [room, setRoom] = useState<HodoaiRoom | null>(null);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<HodoaiRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const { session, ready, isRestoringRoom, playerId, resultReturnGate } = useHodoaiRoomSession({ room, setRoom, setError });
  const viewModel = useHodoaiViewModel(room, playerId);
  const permissions = createHodoaiViewPermissions(room, playerId);

  const actions = useHodoaiRoomActions({
    room,
    session,
    passphrase,
    joinCode,
    isHost: viewModel.isHost,
    markRoomDissolved: resultReturnGate.markRoomDissolved,
    setRoom,
    setError,
    setIsSaving,
    setChoices,
    setShowChoices,
  });

  useRoomLobbyReturnConfirmation({
    room,
    playerId,
    confirmReturn: () => actions.runAction({ type: "confirm-lobby-return", actorId: playerId }),
  });

  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => hodoaiRoomApi.fetchRoom(code, playerId),
    () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  );

  return {
    state: {
      room,
      error,
      passphrase,
      joinCode,
      choices,
      showChoices,
      isSaving,
      rulesOpen,
      ready,
      isRestoringRoom,
    },
    session,
    playerId,
    viewModel,
    permissions,
    resultReturnGate,
    actions: {
      ...actions,
      returnToRoom,
      setPassphrase,
      setJoinCode,
      setRulesOpen,
    },
  };
}

export type HodoaiController = ReturnType<typeof useHodoaiController>;
