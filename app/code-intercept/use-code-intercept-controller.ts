"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugWordGenerationResult } from "@/app/components/DebugWordGenerationTest";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { useOnlineGameSessionRestore } from "@/app/hooks/use-online-game-session-restore";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { applyCodeInterceptRoomAction, codeInterceptRoomApi, createCodeInterceptRoom, fetchCodeInterceptDebugWords } from "./code-intercept-room-api-client";
import { clientTimeoutClaimDelayMs } from "@/lib/game-timer/client-policy";
import {
  codeInterceptAnswererIds,
  codeInterceptDraftScope,
  codeLengthForTeam,
  codeInterceptDefaults,
  codeInterceptPhaseTimeLimitSeconds,
  codeInterceptTimeoutGraceMs,
  codeInterceptTeamIds,
  codeInterceptWordDifficulties,
  otherCodeInterceptTeam,
  teamPlayers,
  type CodeInterceptPlayer,
  type CodeInterceptRoom,
  type CodeInterceptRoomAction,
  type CodeInterceptRoomChoice,
  type CodeInterceptTeamId,
  type CodeInterceptWordDifficulty,
} from "@/lib/code-intercept";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import { preferLatestOnlineRoom } from "@/lib/online-room-client-state";
import { synchronizedNow } from "@/lib/server-clock";

const lastRoomKey = "code-intercept-last-room";
const ownerIdKey = "code-intercept-owner-id";

function makeRoomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function getOwnerId() {
  const saved = localStorage.getItem(ownerIdKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  localStorage.setItem(ownerIdKey, created);
  return created;
}
function teamLabel(teamId: CodeInterceptTeamId) { return teamId === "red" ? "赤チーム" : "青チーム"; }
function isCodeInterceptWordDifficulty(value: unknown): value is CodeInterceptWordDifficulty {
  return typeof value === "string" && codeInterceptWordDifficulties.some((difficulty) => difficulty === value);
}
function wordDifficultyLabel(difficulty: CodeInterceptWordDifficulty) {
  return difficulty === "easy" ? "簡単" : difficulty === "hard" ? "難しい" : "普通";
}
function wordDifficultyMixLabel(difficulty: CodeInterceptWordDifficulty) {
  if (difficulty === "easy") return "簡単100%";
  if (difficulty === "hard") return "難しい50%・普通40%・簡単10%";
  return "普通80%・簡単20%";
}
function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  const payloadErrorCode = error.payload && typeof error.payload === "object" && "errorCode" in error.payload
    ? String((error.payload as { errorCode?: unknown }).errorCode ?? "")
    : "";
  if (error.status === 401) return "合言葉が違うか、ログインの有効期限が切れています。";
  if (error.status === 403) return "この操作を行う権限がありません。";
  if (error.status === 404) return "部屋が見つかりません。";
  if (error.status === 409) return "チーム人数、部屋の状態、または同時更新を確認してもう一度お試しください。";
  if (payloadErrorCode === "CODE_INTERCEPT_WORDS_UNAVAILABLE") return "単語DBのGeneral Game Poolから、設定した難易度の単語を取得できませんでした。";
  if (error.status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

async function sampleCodeInterceptDebugWords(roomCode: string): Promise<DebugWordGenerationResult> {
  const result = await fetchCodeInterceptDebugWords(roomCode);
  const difficulty = isCodeInterceptWordDifficulty(result.difficulty) ? result.difficulty : null;
  return {
    fields: [
      { label: "抽出数", value: `${result.words.length}語` },
      { label: "抽選元", value: result.source === "general_game_pool" ? "General Game Pool（general_game_poolフラグ）" : "不明" },
      { label: "難易度", value: difficulty ? `${wordDifficultyLabel(difficulty)}（${wordDifficultyMixLabel(difficulty)}）` : "不明" },
    ],
    items: result.words.map((word) => ({ title: word, fields: [] })),
    notice: "実際のゲーム開始と同じGeneral Game Pool（general_game_poolフラグ）抽選を試しています。部屋、秘密カード、出題履歴は変更しません。",
  };
}

export function useCodeInterceptController() {
  const [room, setRoom] = useState<CodeInterceptRoom | null>(null);
  const { session, ready, isRestoringRoom } = useOnlineGameSessionRestore({ lastRoomKey, fetchActiveRoom: codeInterceptRoomApi.fetchActiveRoom, fetchRoom: codeInterceptRoomApi.fetchRoom, setRoom });
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<CodeInterceptRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [newPlayerCapacity, setNewPlayerCapacity] = useState(6);
  const [clueDraftsByRound, setClueDraftsByRound] = useState<Record<string, string[]>>({});
  const [allyDraftsByRound, setAllyDraftsByRound] = useState<Record<string, number[]>>({});
  const [interceptDraftsByRound, setInterceptDraftsByRound] = useState<Record<string, number[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const timeoutClueSubmissionKeyRef = useRef("");
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "game-result", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  const playerId = session?.id ?? "";
  useOnlineRoomPolling({
    game: "code-intercept",
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? room?.code : null,
    intervalMs: room?.phase === "lobby" || room?.phase === "game-result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => codeInterceptRoomApi.fetchRoom(code, playerId),
    onRoom: resultReturnGate.acceptIncomingRoom,
    onMissing: () => {
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) {
        setError("部屋が解散されました。結果画面はこのまま確認できます。");
        return;
      }
      setRoom(null);
      setError("部屋が解散されたか、参加情報がなくなりました。");
    },
  });

  const isHost = Boolean(room && room.hostId === playerId);
  const me = room?.players.find((player) => player.id === playerId);
  const myTeamId = me?.teamId;
  const myTeam = room?.teams.find((team) => team.id === myTeamId);
  const myCode = myTeamId ? room?.secretCodes[myTeamId] : undefined;
  const myCodeLength = room && myTeamId ? codeLengthForTeam(room, myTeamId) : codeInterceptDefaults.fixedCodeLength;
  const enemyTeamId = myTeamId ? otherCodeInterceptTeam(myTeamId) : undefined;
  const enemyCodeLength = room && enemyTeamId ? codeLengthForTeam(room, enemyTeamId) : codeInterceptDefaults.fixedCodeLength;
  const enemyAnswersSubmitted = Boolean(enemyTeamId && room?.answerReadyTeamIds?.includes(enemyTeamId));
  const isClueGiver = Boolean(room && myTeamId && room.clueGiverIds[myTeamId] === playerId);
  const myAnswererIds = room && myTeamId ? codeInterceptAnswererIds(room, myTeamId) : [];
  const latestRound = room?.roundHistory.at(-1);
  const teamCounts = useMemo(() => room ? Object.fromEntries(codeInterceptTeamIds.map((id) => [id, teamPlayers(room, id).length])) as Record<CodeInterceptTeamId, number> : { red: 0, blue: 0 }, [room]);
  const draftRound = room ? codeInterceptDraftScope(room) : "";
  const clueDrafts = clueDraftsByRound[draftRound] ?? (myTeamId ? room?.clues[myTeamId] : undefined) ?? Array.from({ length: myCodeLength }, () => "");
  const allyDraft = allyDraftsByRound[draftRound] ?? room?.allyAnswerProposals[playerId] ?? (myTeamId ? room?.allyAnswers[myTeamId] : undefined) ?? [];
  const interceptDraft = interceptDraftsByRound[draftRound] ?? room?.interceptAnswerProposals[playerId] ?? (myTeamId ? room?.interceptAnswers[myTeamId] : undefined) ?? [];
  const timerRoomCode = room?.code;
  const timerPhase = room?.phase;
  const timerPhaseStartedAt = room?.phaseStartedAt;
  const timerDurationSeconds = room ? codeInterceptPhaseTimeLimitSeconds(room) : 0;
  const timerClaimDelayMs = room ? clientTimeoutClaimDelayMs({ playerId, hostId: room.hostId, playerIds: room.players.map((player) => player.id) }) : 0;

  useEffect(() => {
    if (!timerRoomCode || !playerId || timerDurationSeconds <= 0 || !timerPhaseStartedAt || !timerPhase || !["code-length", "clue", "answer"].includes(timerPhase)) return;
    const delay = Math.max(0, timerPhaseStartedAt + timerDurationSeconds * 1000 + codeInterceptTimeoutGraceMs() - synchronizedNow()) + 100 + timerClaimDelayMs;
    const timer = window.setTimeout(() => {
      void applyCodeInterceptRoomAction(timerRoomCode, { type: "expire-phase", actorId: playerId, phaseStartedAt: timerPhaseStartedAt })
        .then((saved) => setRoom((current) => current?.code === saved.code ? preferLatestOnlineRoom(current, saved) : current))
        .catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playerId, timerClaimDelayMs, timerDurationSeconds, timerPhase, timerPhaseStartedAt, timerRoomCode]);

  const runAction = useCallback(async (action: CodeInterceptRoomAction) => {
    if (!room || isSaving) return null;
    setIsSaving(true); setError("");
    try { const saved = await applyCodeInterceptRoomAction(room.code, action); setRoom((current) => preferLatestOnlineRoom(current, saved)); return saved; }
    catch (caught) { setError(apiMessage(caught, "操作を保存できませんでした。")); return null; }
    finally { setIsSaving(false); }
  }, [isSaving, room]);
  useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn: () => runAction({ type: "confirm-lobby-return", actorId: playerId }) });

  useEffect(() => {
    if (!room || room.phase !== "clue" || !room.phaseStartedAt || room.clueTimeLimitSeconds <= 0 || !isClueGiver || !myTeamId || room.clues[myTeamId]) return;
    const typedClues = clueDrafts.slice(0, myCodeLength);
    if (!typedClues.some((clue) => clue.trim())) return;
    const key = `${draftRound}:${playerId}`;
    const delay = Math.max(0, room.phaseStartedAt + room.clueTimeLimitSeconds * 1000 - synchronizedNow());
    const timer = window.setTimeout(() => {
      if (timeoutClueSubmissionKeyRef.current === key) return;
      timeoutClueSubmissionKeyRef.current = key;
      const action: CodeInterceptRoomAction = typedClues.every((clue) => clue.trim())
        ? { type: "submit-clues", actorId: playerId, clues: typedClues.map((clue) => clue.trim()) }
        : { type: "submit-timeout-clues", actorId: playerId, clues: typedClues };
      void applyCodeInterceptRoomAction(room.code, action)
        .then((saved) => setRoom((current) => current?.code === saved.code ? preferLatestOnlineRoom(current, saved) : current))
        .catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [clueDrafts, draftRound, isClueGiver, myCodeLength, myTeamId, playerId, room]);

  const createRoom = async () => {
    if (!session?.id || isSaving) return;
    setIsSaving(true); setError("");
    const now = Date.now();
    const host: CodeInterceptPlayer = { id: session.id, name: session.name, joinedAt: now, teamId: "red", avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    const draft: CodeInterceptRoom = {
      code: makeRoomCode(), revision: 0, hostId: session.id, ownerId: getOwnerId(), passphrase: passphrase.trim(), phase: "lobby", players: [host], playerCapacity: newPlayerCapacity, gameNumber: 1, gameStartedAt: null, roundNumber: 1,
      cardCount: codeInterceptDefaults.cardCount, wordDifficulty: codeInterceptDefaults.wordDifficulty, teamAssignmentMode: codeInterceptDefaults.teamAssignmentMode, codeLengthMode: codeInterceptDefaults.codeLengthMode, codeRevealMode: codeInterceptDefaults.codeRevealMode, fixedCodeLength: codeInterceptDefaults.fixedCodeLength, initialPoints: codeInterceptDefaults.initialPoints, miscommunicationDamage: codeInterceptDefaults.miscommunicationDamage, interceptionDamage: codeInterceptDefaults.interceptionDamage, interceptionStartsAtRound: codeInterceptDefaults.interceptionStartsAtRound, clueTimeLimitSeconds: codeInterceptDefaults.clueTimeLimitSeconds, answerTimeLimitSeconds: codeInterceptDefaults.answerTimeLimitSeconds, phaseStartedAt: null,
      debugMode: false, debugReplayEnabled: false, teams: codeInterceptTeamIds.map((id) => ({ id, name: teamLabel(id), points: codeInterceptDefaults.initialPoints, secretWords: [] })), clueGiverIds: {}, codeLengthChoices: {}, roundCodeLengths: {}, secretCodes: {}, clues: {}, allyAnswerProposals: {}, interceptAnswerProposals: {}, allyAnswers: {}, interceptAnswers: {}, timeoutPenaltyPhases: {}, roundHistory: [], winner: null, debugLog: [], createdAt: now, updatedAt: now,
    };
    try { const data = await createCodeInterceptRoom(draft, session.id); setRoom(data.room); localStorage.setItem(lastRoomKey, data.room.code); }
    catch (caught) { setError(apiMessage(caught, "部屋を作成できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const joinRoom = async (selectedCode?: string) => {
    if (!session?.id || isSaving) return;
    const code = (selectedCode ?? joinCode).trim().toUpperCase();
    if (code.length !== 4) { setError("4文字の部屋コードを入力してください。"); return; }
    setIsSaving(true); setError("");
    const player: CodeInterceptPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), teamId: "red", avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    try { const saved = await applyCodeInterceptRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase }); setRoom(saved); setShowChoices(false); localStorage.setItem(lastRoomKey, saved.code); }
    catch (caught) { setError(apiMessage(caught, "部屋へ参加できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const listRooms = async () => {
    setError("");
    try { setChoices(await codeInterceptRoomApi.fetchJoinableRooms()); setShowChoices(true); }
    catch (caught) { setError(apiMessage(caught, "部屋一覧を取得できませんでした。")); }
  };

  const leaveRoom = async () => { if (!confirmRoomLeave()) return; if (await runAction({ type: "leave-room", actorId: playerId })) { setRoom(null); localStorage.removeItem(lastRoomKey); } };
  const dissolveRoom = async () => {
    if (!room || !window.confirm("この部屋を解散しますか？")) return;
    setIsSaving(true); setError("");
    try {
      await codeInterceptRoomApi.remove({ code: room.code, actorId: playerId });
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) setError("部屋を解散しました。結果画面はこのまま確認できます。");
      else setRoom(null);
    }
    catch (caught) { setError(apiMessage(caught, "部屋を解散できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => codeInterceptRoomApi.fetchRoom(code, playerId),
    () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"),
  );

  return {
    state: {
      room, session, ready, isRestoringRoom, error, passphrase, joinCode, choices,
      showChoices, newPlayerCapacity, isSaving, rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setNewPlayerCapacity, setClueDraftsByRound,
      setAllyDraftsByRound, setInterceptDraftsByRound, setRulesOpen,
    },
    viewModel: {
      playerId, myTeamId, myTeam, myCode, myCodeLength,
      enemyCodeLength, enemyAnswersSubmitted, myAnswererIds,
      latestRound, teamCounts, draftRound, clueDrafts, allyDraft, interceptDraft,
    },
    permissions: { isHost, isClueGiver },
    actions: {
      runAction, createRoom, joinRoom, listRooms, leaveRoom, dissolveRoom,
      returnToRoom, sampleDebugWords: sampleCodeInterceptDebugWords,
    },
    result: resultReturnGate,
  };
}

export type CodeInterceptController = ReturnType<typeof useCodeInterceptController>;
