"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  makeRandomAvatarColor,
} from "@/lib/player-session";
import type { TahoiyaAnswererMode, TahoiyaDefinitionOption, TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomChoice, TahoiyaTopic } from "@/lib/tahoiya-types";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { cyanButtonClass, dangerButtonClass, inputClass, panelClass, primaryButtonClass, subtleButtonClass } from "../wordwolf/styles";

const roomStoragePrefix = "tahoiya-room-";
const roomDefaultsStoragePrefix = "tahoiya-room-defaults-";

const tahoiyaFeedbackReasons = [
  { value: "too-difficult", label: "難しすぎる", rating: "bad" as const },
  { value: "too-easy", label: "単語が簡単すぎる", rating: "bad" as const },
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

type TahoiyaRoomDefaults = Pick<TahoiyaRoom, "answererMode">;

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getOwnerId() {
  const saved = localStorage.getItem("tahoiya-owner-id");
  if (saved) return saved;

  const ownerId = makeId("owner");
  localStorage.setItem("tahoiya-owner-id", ownerId);
  return ownerId;
}

function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

function getRoomDefaultsKey(playerId: string, ownerId: string) {
  return `${roomDefaultsStoragePrefix}${playerId || ownerId || "local"}`;
}

function normalizeRoomDefaults(value: unknown): TahoiyaRoomDefaults {
  if (!value || typeof value !== "object") return { answererMode: "random" };
  const parsed = value as Partial<TahoiyaRoomDefaults>;
  return { answererMode: parsed.answererMode === "manual" ? "manual" : "random" };
}

function loadRoomDefaults(playerId: string, ownerId: string) {
  const raw = localStorage.getItem(getRoomDefaultsKey(playerId, ownerId));
  if (!raw) return normalizeRoomDefaults(null);

  try {
    return normalizeRoomDefaults(JSON.parse(raw));
  } catch {
    return normalizeRoomDefaults(null);
  }
}

function saveRoomDefaults(room: TahoiyaRoom) {
  const defaults = normalizeRoomDefaults(room);
  localStorage.setItem(getRoomDefaultsKey(room.hostId, room.ownerId ?? ""), JSON.stringify(defaults));
  return defaults;
}

async function loadRoomDefaultsFromStore(playerId: string, ownerId: string) {
  const localDefaults = loadRoomDefaults(playerId, ownerId);

  try {
    const params = new URLSearchParams({ game: "tahoiya", playerId });
    const response = await fetch(`/api/room-defaults?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("ROOM_DEFAULTS_FETCH_FAILED");

    const data = (await response.json()) as { defaults?: unknown };
    if (!data.defaults) return localDefaults;

    const defaults = normalizeRoomDefaults(data.defaults);
    localStorage.setItem(getRoomDefaultsKey(playerId, ownerId), JSON.stringify(defaults));
    return defaults;
  } catch {
    return localDefaults;
  }
}

async function saveRoomDefaultsToStore(room: TahoiyaRoom) {
  const defaults = saveRoomDefaults(room);

  try {
    await fetch("/api/room-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "tahoiya", playerId: room.hostId, defaults }),
    });
  } catch {
    // Local defaults keep prototype testing usable when Redis is unavailable.
  }
}

function stampRoom(room: TahoiyaRoom) {
  return { ...room, updatedAt: Date.now() };
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function createPlayer(name: string, avatarColor = makeRandomAvatarColor(), avatarImage?: string | null, id?: string): TahoiyaPlayer {
  return {
    id: id ?? makeId("player"),
    name,
    avatarColor,
    avatarImage: avatarImage || undefined,
    joinedAt: Date.now(),
  };
}

function normalizeRoom(room: TahoiyaRoom): TahoiyaRoom {
  return {
    ...room,
    passphrase: room.passphrase ?? "",
    debugMode: Boolean(room.debugMode),
    players: Array.isArray(room.players) ? room.players : [],
    parentId: room.parentId || room.hostId,
    answererMode: room.answererMode === "manual" ? "manual" : "random",
    answererId: typeof room.answererId === "string" ? room.answererId : "",
    round: room.round ?? 1,
    fakeDefinitions: room.fakeDefinitions ?? {},
    options: room.options ?? [],
    votes: room.votes ?? {},
    scores: room.scores ?? {},
    topicSource: room.topicSource ?? "pending",
    updatedAt: room.updatedAt ?? Date.now(),
  };
}

function saveRoomLocally(room: TahoiyaRoom) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(stampRoom(room)));
}

function loadRoomLocally(code: string): TahoiyaRoom | null {
  const raw = localStorage.getItem(getRoomKey(code));
  if (!raw) return null;

  try {
    return normalizeRoom(JSON.parse(raw) as TahoiyaRoom);
  } catch {
    return null;
  }
}

function listRoomsLocally() {
  const rooms: TahoiyaRoom[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;
    const room = loadRoomLocally(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }
  return rooms;
}

function listJoinableRoomsLocally(): TahoiyaRoomChoice[] {
  return listRoomsLocally()
    .filter((room) => room.phase === "lobby" && room.players.length < 8)
    .map((room) => ({
      code: room.code,
      hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
      playerCount: room.players.length,
      phase: room.phase,
      hasPassphrase: Boolean(room.passphrase),
      updatedAt: room.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function deleteRoomLocally(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

async function saveRoomToStore(room: TahoiyaRoom) {
  saveRoomLocally(room);
  try {
    await fetch("/api/tahoiya/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });
  } catch {
    // Local storage keeps prototype testing usable when Redis is unavailable.
  }
}

async function loadRoomFromStore(code: string) {
  try {
    const response = await fetch(`/api/tahoiya/rooms?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("ROOM_FETCH_FAILED");
    const data = (await response.json()) as { room?: TahoiyaRoom };
    if (!data.room) return null;
    const normalized = normalizeRoom(data.room);
    saveRoomLocally(normalized);
    return normalized;
  } catch {
    return loadRoomLocally(code);
  }
}

async function listJoinableRoomsFromStore() {
  try {
    const response = await fetch("/api/tahoiya/rooms", { cache: "no-store" });
    if (!response.ok) throw new Error("ROOM_LIST_FAILED");
    const data = (await response.json()) as { rooms?: TahoiyaRoomChoice[] };
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return listJoinableRoomsLocally();
  }
}

async function deleteRoomFromStore(code: string) {
  deleteRoomLocally(code);
  try {
    await fetch(`/api/tahoiya/rooms?code=${encodeURIComponent(code)}`, { method: "DELETE" });
  } catch {
    // Local delete already happened.
  }
}

function createEmptyRoom(
  host: TahoiyaPlayer,
  passphrase: string,
  ownerId: string,
  savedDefaults?: TahoiyaRoomDefaults,
): TahoiyaRoom {
  const defaults = savedDefaults ?? loadRoomDefaults(host.id, ownerId);
  return {
    code: makeRoomCode(),
    hostId: host.id,
    ownerId,
    passphrase,
    phase: "lobby",
    debugMode: false,
    players: [host],
    parentId: host.id,
    answererMode: defaults.answererMode,
    answererId: "",
    round: 1,
    word: "",
    reading: "",
    realDefinition: "",
    topicNote: "",
    topicSource: "pending",
    fakeDefinitions: {},
    options: [],
    votes: {},
    scores: {},
    resultText: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createOptions(room: TahoiyaRoom): TahoiyaDefinitionOption[] {
  return shuffle([
    {
      id: makeId("real"),
      text: room.realDefinition,
      authorId: null,
      isReal: true,
    },
    ...Object.entries(room.fakeDefinitions).map(([playerId, text]) => ({
      id: makeId("fake"),
      text,
      authorId: playerId,
      isReal: false,
    })),
  ]);
}

function scoreRound(room: TahoiyaRoom) {
  const scores = { ...room.scores };
  const resultLines: string[] = [];

  for (const [voterId, optionId] of Object.entries(room.votes)) {
    const option = room.options.find((item) => item.id === optionId);
    const voter = room.players.find((player) => player.id === voterId);
    if (!option || !voter) continue;

    if (option.isReal) {
      scores[voterId] = (scores[voterId] ?? 0) + 2;
      resultLines.push(`${voter.name} が本物を当てて +2`);
    } else if (option.authorId) {
      const author = room.players.find((player) => player.id === option.authorId);
      scores[option.authorId] = (scores[option.authorId] ?? 0) + 1;
      resultLines.push(`${author?.name ?? "Unknown"} の偽説明に票が入り +1`);
    }
  }

  return {
    scores,
    resultText: resultLines.length > 0 ? resultLines.join(" / ") : "得点は入りませんでした。",
  };
}

function getAnswererCandidates(room: TahoiyaRoom) {
  return room.players;
}

function getAnswerer(room: TahoiyaRoom) {
  return getAnswererCandidates(room).find((player) => player.id === room.answererId) ?? null;
}

function getDefinitionWriters(room: TahoiyaRoom) {
  return room.players.filter((player) => player.id !== room.answererId);
}

function submittedCount(room: TahoiyaRoom) {
  return getDefinitionWriters(room).filter((player) => room.fakeDefinitions[player.id]).length;
}

function voterCount(room: TahoiyaRoom) {
  return room.answererId && room.votes[room.answererId] ? 1 : 0;
}

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
  const [message, setMessage] = useState("");
  const roomCode = room?.code;

  useEffect(() => {
    let mounted = true;
    loadPersistentPlayerSession()
      .then((session) => {
        if (!mounted || !session) return;
        setPlayerId(session.id ?? "");
        setActivePlayerId(session.id ?? "");
        setPlayerName(session.name);
        setAvatarColor(session.avatarColor);
        setAvatarImage(session.avatarImage || defaultAvatarImage);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomCode) return undefined;
    const timer = window.setInterval(() => {
      void loadRoomFromStore(roomCode).then((latest) => {
        if (latest) setRoom(latest);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [roomCode]);

  const isDebugMode = Boolean(room?.debugMode);
  const operationPlayerId = isDebugMode ? activePlayerId : playerId;
  const activePlayer = room?.players.find((player) => player.id === operationPlayerId) ?? null;
  const isHost = Boolean(room && playerId === room.hostId);
  const answererCandidates = room ? getAnswererCandidates(room) : [];
  const answerer = room ? getAnswerer(room) : null;
  const isAnswerer = Boolean(room && activePlayer?.id === room.answererId);
  const definitionWriters = room ? getDefinitionWriters(room) : [];
  const definitionWriterCount = definitionWriters.length;
  const writingDone = room ? submittedCount(room) >= definitionWriterCount : false;
  const votingDone = room ? voterCount(room) >= 1 : false;
  const nextWriter = room?.phase === "writing"
    ? definitionWriters.find((player) => !room.fakeDefinitions[player.id])
    : null;
  const nextVoter = room?.phase === "voting"
    ? answerer && !room.votes[answerer.id] ? answerer : null
    : null;

  const sortedScores = useMemo(() => {
    if (!room) return [];
    return [...room.players].sort((left, right) => (room.scores[right.id] ?? 0) - (room.scores[left.id] ?? 0));
  }, [room]);

  const setAndSaveRoom = (nextRoom: TahoiyaRoom) => {
    const stamped = stampRoom(nextRoom);
    setRoom(stamped);
    void saveRoomToStore(stamped);
    void saveRoomDefaultsToStore(stamped);
  };

  const refreshJoinableRooms = async () => {
    setJoinableRooms(await listJoinableRoomsFromStore());
  };

  const createRoom = async () => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) {
      setMessage("先にゲームロビーでログインしてください。");
      return;
    }

    const ownerId = getOwnerId();
    const host = createPlayer(playerName, avatarColor, avatarImage, playerId);
    const defaults = await loadRoomDefaultsFromStore(playerId, ownerId);
    const nextRoom = createEmptyRoom(host, passphrase, ownerId, defaults);
    setAndSaveRoom(nextRoom);
    setActivePlayerId(host.id);
    setMessage("");
  };

  const joinRoom = async (targetCode = joinCode) => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) {
      setMessage("先にゲームロビーでログインしてください。");
      return;
    }

    const code = targetCode.trim().toUpperCase();
    const target = await loadRoomFromStore(code);
    if (!target) {
      setMessage("部屋が見つかりません。");
      return;
    }
    if (target.phase !== "lobby") {
      setMessage("開始済みの部屋には参加できません。");
      return;
    }
    if (target.passphrase && target.passphrase !== passphrase) {
      setMessage("合言葉が違います。");
      return;
    }

    const existing = target.players.find((player) => player.id === playerId);
    const nextRoom = existing
      ? target
      : {
          ...target,
          players: [...target.players, createPlayer(playerName, avatarColor, avatarImage, playerId)].slice(0, 8),
        };
    setAndSaveRoom(nextRoom);
    setActivePlayerId(playerId);
    setMessage("");
  };

  const addTestPlayer = () => {
    if (!room || room.phase !== "lobby" || !room.debugMode) return;
    const count = room.players.length + 1;
    setAndSaveRoom({
      ...room,
      players: [...room.players, createPlayer(`テスト${count}`)].slice(0, 8),
    });
  };

  const setDebugMode = (debugMode: boolean) => {
    if (!room || room.phase !== "lobby") return;
    const nextRoom = { ...room, debugMode };
    setAndSaveRoom(nextRoom);
    if (!debugMode) {
      setActivePlayerId(playerId);
    }
  };

  const withMinimumDebugPlayers = (baseRoom: TahoiyaRoom) => {
    if (!baseRoom.debugMode || baseRoom.players.length >= 3) return baseRoom;

    const players = [...baseRoom.players];
    while (players.length < 3) {
      players.push(createPlayer(`テスト${players.length + 1}`));
    }
    return { ...baseRoom, players };
  };

  const setAnswererMode = (answererMode: TahoiyaAnswererMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({
      ...room,
      answererMode,
      answererId: answererMode === "random" ? "" : room.answererId,
    });
  };

  const setManualAnswerer = (answererId: string) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, answererId });
  };

  const startRound = async () => {
    if (!room || isStarting) return;
    const startingRoom = withMinimumDebugPlayers(room);
    if (startingRoom.players.length < 3) {
      setMessage("回答者1人と偽説明を書く人2人以上、合計3人以上が必要です。");
      return;
    }
    const candidates = getAnswererCandidates(startingRoom);

    const selectedAnswererId =
      startingRoom.answererMode === "random"
        ? shuffle(candidates)[0]?.id ?? ""
        : candidates.some((player) => player.id === startingRoom.answererId)
          ? startingRoom.answererId
          : "";

    if (!selectedAnswererId) {
      setMessage("回答者を指定するか、ランダムで選ぶ設定にしてください。");
      return;
    }

    const playableRoom = { ...startingRoom, answererId: selectedAnswererId };
    setIsStarting(true);
    setMessage("");
    try {
      const response = await fetch("/api/tahoiya/topic", { cache: "no-store" });
      const topic = (await response.json()) as TahoiyaTopic;
      setMessage(topic.notice ?? "");
      setAndSaveRoom({
        ...playableRoom,
        phase: "writing",
        word: topic.word,
        reading: topic.reading,
        realDefinition: topic.realDefinition,
        topicNote: topic.note,
        topicSource: topic.source,
        topicGeneration: topic.generation,
        fakeDefinitions: {},
        options: [],
        votes: {},
        resultText: "",
      });
      const firstWriter = getDefinitionWriters(playableRoom)[0];
      if (firstWriter) setActivePlayerId(firstWriter.id);
      setDefinitionInput("");
      setSelectedOptionId("");
    } finally {
      setIsStarting(false);
    }
  };

  const submitDefinition = () => {
    if (!room || !activePlayer || isAnswerer || !definitionInput.trim()) return;
    const nextRoom = {
      ...room,
      fakeDefinitions: {
        ...room.fakeDefinitions,
        [activePlayer.id]: definitionInput.trim(),
      },
    };
    setAndSaveRoom(nextRoom);
    if (isDebugMode) {
      const next = getDefinitionWriters(nextRoom).find((player) => !nextRoom.fakeDefinitions[player.id]);
      if (next) setActivePlayerId(next.id);
    }
    setDefinitionInput("");
  };

  const autoFillTestDefinitions = () => {
    if (!room || room.phase !== "writing") return;
    const nextDefinitions = { ...room.fakeDefinitions };
    for (const player of room.players) {
      if (player.id === room.answererId || nextDefinitions[player.id]) continue;
      nextDefinitions[player.id] = "特定の作業に使われる古い道具の一種。";
    }
    setAndSaveRoom({ ...room, fakeDefinitions: nextDefinitions });
  };

  const publishOptions = () => {
    if (!room || room.phase !== "writing" || !writingDone) return;
    const nextRoom = {
      ...room,
      phase: "voting",
      options: createOptions(room),
      votes: {},
    } satisfies TahoiyaRoom;
    setAndSaveRoom(nextRoom);
    if (answerer) setActivePlayerId(answerer.id);
    setSelectedOptionId("");
  };

  const castVote = () => {
    if (!room || !activePlayer || !isAnswerer || !selectedOptionId) return;
    const nextRoom = {
      ...room,
      votes: {
        ...room.votes,
        [activePlayer.id]: selectedOptionId,
      },
    };
    setAndSaveRoom(nextRoom);
    setSelectedOptionId("");
  };

  const autoFillTestVotes = () => {
    if (!room || room.phase !== "voting" || room.options.length === 0 || !room.answererId) return;
    const nextVotes = { ...room.votes };
    const option = room.options[0];
    if (option && !nextVotes[room.answererId]) nextVotes[room.answererId] = option.id;
    setAndSaveRoom({ ...room, votes: nextVotes });
  };

  const finishRound = () => {
    if (!room || room.phase !== "voting" || !votingDone) return;
    const result = scoreRound(room);
    setAndSaveRoom({
      ...room,
      phase: "result",
      scores: result.scores,
      resultText: result.resultText,
    });
  };

  const nextRound = () => {
    if (!room) return;
    const nextAnswererId = room.answererMode === "manual" ? room.answererId : "";
    setAndSaveRoom({
      ...room,
      phase: "lobby",
      answererId: nextAnswererId,
      round: room.round + 1,
      word: "",
      reading: "",
      realDefinition: "",
      topicNote: "",
      topicSource: "pending",
      topicGeneration: undefined,
      fakeDefinitions: {},
      options: [],
      votes: {},
      resultText: "",
    });
  };

  const dissolveRoom = async () => {
    if (!room) return;
    const code = room.code;
    setRoom(null);
    await deleteRoomFromStore(code);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-200">Dictionary bluffing</p>
            <h1 className="text-2xl font-black">たほい屋</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PaidLlmAccessButton />
            <Link href="/games" className={subtleButtonClass}>
              ゲームロビー
            </Link>
            <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white">
              {playerName || "未ログイン"}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <div className={panelClass}>
            <p className="text-xs font-semibold uppercase text-amber-700">Entry</p>
            <h2 className="text-lg font-bold text-slate-950">部屋</h2>
            {!room ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  合言葉
                  <input
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    className={`mt-1 ${inputClass}`}
                    placeholder="空欄なら合言葉なし"
                  />
                </label>
                <button onClick={() => void createRoom()} className={`w-full ${primaryButtonClass}`}>
                  部屋を作成
                </button>
                <button onClick={() => void refreshJoinableRooms()} className={`w-full ${subtleButtonClass}`}>
                  参加できる部屋を表示
                </button>
                {joinableRooms.length > 0 && (
                  <div className="space-y-2">
                    {joinableRooms.map((choice) => (
                      <button
                        key={choice.code}
                        type="button"
                        onClick={() => void joinRoom(choice.code)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-white"
                      >
                        <span className="font-bold text-slate-950">{choice.code}</span>
                        <span className="ml-2 text-slate-500">
                          {choice.hostName} / {choice.playerCount}人
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="ROOM CODE"
                />
                <button onClick={() => void joinRoom()} className={`w-full ${cyanButtonClass}`}>
                  コードで参加
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-slate-100 p-3">
                  <p className="text-xs text-slate-500">ROOM</p>
                  <p className="text-xl font-black text-slate-950">{room.code}</p>
                </div>
                <p className="text-sm text-slate-600">
                  回答者: <span className="font-bold text-slate-950">{answerer?.name ?? (room.answererMode === "random" ? "開始時にランダム" : "未指定")}</span>
                </p>
                {room.phase === "lobby" && isHost && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setDebugMode(!room.debugMode)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm font-bold transition ${
                        room.debugMode
                          ? "border-amber-400 bg-amber-100 text-amber-950"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      デバッグモード {room.debugMode ? "ON" : "OFF"}
                    </button>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-950">回答者の決め方</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAnswererMode("manual")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.answererMode === "manual"
                              ? "border-amber-500 bg-amber-100 text-amber-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          指定
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswererMode("random")}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                            room.answererMode === "random"
                              ? "border-cyan-500 bg-cyan-100 text-cyan-950"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          ランダム
                        </button>
                      </div>
                      {room.answererMode === "manual" ? (
                        <label className="mt-2 block text-sm font-medium text-slate-700">
                          回答者
                          <select value={room.answererId} onChange={(event) => setManualAnswerer(event.target.value)} className={`mt-1 ${inputClass}`}>
                            <option value="">選択してください</option>
                            {answererCandidates.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          ラウンド開始時に、参加者全員から1人を回答者に選びます。
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {isDebugMode ? (
                  <label className="block text-sm font-medium text-slate-700">
                    操作プレイヤー
                    <select value={activePlayer?.id ?? activePlayerId} onChange={(event) => setActivePlayerId(event.target.value)} className={`mt-1 ${inputClass}`}>
                      {room.players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    操作中: <span className="font-bold text-slate-950">{activePlayer?.name ?? playerName}</span>
                  </div>
                )}
                {room.phase === "lobby" && (
                  <>
                    {isDebugMode && (
                      <button onClick={addTestPlayer} disabled={room.players.length >= 8} className={`w-full ${subtleButtonClass}`}>
                        テストプレイヤー追加
                      </button>
                    )}
                    <button onClick={() => void startRound()} disabled={isStarting} className={`w-full ${primaryButtonClass}`}>
                      {isStarting ? "お題生成中..." : "ラウンド開始"}
                    </button>
                  </>
                )}
                {isHost && (
                  <button onClick={() => void dissolveRoom()} className={`w-full ${dangerButtonClass}`}>
                    部屋を解散
                  </button>
                )}
              </div>
            )}
            {message && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{message}</p>}
          </div>

          {room && (
            <div className={panelClass}>
              <p className="text-xs font-semibold uppercase text-amber-700">Score</p>
              <h2 className="text-lg font-bold text-slate-950">得点</h2>
              <div className="mt-3 space-y-2">
                {sortedScores.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-800">{player.name}</span>
                    <span className="font-black text-slate-950">{room.scores[player.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {!room ? (
            <div className="min-h-[520px] rounded-lg border border-white/10 bg-white/[0.96] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
              <div className="grid min-h-[460px] place-items-center rounded-lg border border-dashed border-amber-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#fff7ed_100%)]">
                <div className="max-w-md text-center">
                  <p className="text-sm font-semibold text-amber-700">Prototype ready</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">辞書の本物を見抜く</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    回答者を1人選び、それ以外の全員がお題を見て偽説明を作ります。回答者は並んだ説明から本物を選びます。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={panelClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-amber-700">Round {room.round}</p>
                    <h2 className="mt-1 text-3xl font-black text-slate-950">
                      {room.phase === "lobby"
                        ? "開始待ち"
                        : room.phase === "writing" && isAnswerer
                          ? "お題は準備中"
                          : room.word}
                      {room.reading && !(room.phase === "writing" && isAnswerer) ? (
                        <span className="ml-2 text-base font-semibold text-slate-500">({room.reading})</span>
                      ) : null}
                    </h2>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{room.phase}</span>
                </div>
                {isDebugMode && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-bold">デバッグモード中</p>
                    <p className="mt-1">
                      {room.phase === "writing" && nextWriter
                        ? `次の未投稿: ${nextWriter.name}`
                        : room.phase === "voting" && nextVoter
                          ? `次の未投票: ${nextVoter.name}`
                          : "操作プレイヤーを切り替えながら一人で流れを確認できます。"}
                    </p>
                  </div>
                )}
              </div>

              {room.phase === "lobby" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Players</p>
                  <h2 className="text-2xl font-black text-slate-950">参加者</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {room.players.map((player) => (
                      <div key={player.id} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                        {player.name}
                        {player.id === room.answererId ? (
                          <span className="ml-2 text-cyan-700">回答者</span>
                        ) : (
                          <span className="ml-2 text-slate-500">
                            {room.answererMode === "random" ? "回答者候補・偽説明" : "偽説明"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {room.phase === "writing" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Fake explanation</p>
                  <h2 className="text-2xl font-black text-slate-950">偽説明を書く</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    偽説明: {submittedCount(room)}/{definitionWriterCount}
                  </p>
                  {isAnswerer ? (
                    <p className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">回答者にはお題を表示しません。説明が並ぶまで待ちます。</p>
                  ) : (
                    <>
                      <textarea
                        value={definitionInput}
                        onChange={(event) => setDefinitionInput(event.target.value)}
                        className={`mt-4 min-h-28 resize-y ${inputClass}`}
                        placeholder="辞書に載っていそうな短い説明を書く"
                      />
                      <button onClick={submitDefinition} disabled={!definitionInput.trim()} className={`mt-3 ${cyanButtonClass}`}>
                        偽説明を投稿
                      </button>
                    </>
                  )}
                  {isHost && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isDebugMode && (
                        <button onClick={autoFillTestDefinitions} className={subtleButtonClass}>
                          未投稿をテスト入力
                        </button>
                      )}
                      <button onClick={publishOptions} disabled={!writingDone} className={primaryButtonClass}>
                        説明を並べる
                      </button>
                    </div>
                  )}
                </div>
              )}

              {room.phase === "voting" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Vote</p>
                  <h2 className="text-2xl font-black text-slate-950">本物を選ぶ</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    回答者の投票: {voterCount(room)}/1
                  </p>
                  {!isAnswerer ? (
                    <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-700">偽説明を書いた人は投票しません。回答者の投票を待ちます。</p>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {room.options.map((option, index) => (
                        <button
                          key={option.id}
                          onClick={() => setSelectedOptionId(option.id)}
                          className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold ${
                            selectedOptionId === option.id
                              ? "border-amber-500 bg-amber-50 text-amber-950"
                              : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white"
                          }`}
                        >
                          {index + 1}. {option.text}
                        </button>
                      ))}
                      <button onClick={castVote} disabled={!selectedOptionId} className={cyanButtonClass}>
                        投票する
                      </button>
                    </div>
                  )}
                  {isHost && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isDebugMode && (
                        <button onClick={autoFillTestVotes} className={subtleButtonClass}>
                          回答者をテスト投票
                        </button>
                      )}
                      <button onClick={finishRound} disabled={!votingDone} className={primaryButtonClass}>
                        採点する
                      </button>
                    </div>
                  )}
                </div>
              )}

              {room.phase === "result" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-amber-700">Result</p>
                  <h2 className="text-3xl font-black text-slate-950">結果</h2>
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase text-amber-700">本物</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{room.realDefinition}</p>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {room.options.map((option, index) => {
                      const author = option.authorId ? room.players.find((player) => player.id === option.authorId) : null;
                      const votes = Object.entries(room.votes)
                        .filter(([, optionId]) => optionId === option.id)
                        .map(([voterId]) => room.players.find((player) => player.id === voterId)?.name ?? "Unknown");
                      return (
                        <div key={option.id} className={`rounded-lg border px-3 py-3 text-sm ${option.isReal ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                          <p className="font-bold text-slate-950">
                            {index + 1}. {option.text}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {option.isReal ? "本物" : `作者: ${author?.name ?? "Unknown"}`} / 投票: {votes.length ? votes.join(", ") : "なし"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">{room.resultText}</p>
                  {room.topicGeneration && operationPlayerId && (
                    <GameFeedbackPanel
                      artifactId={`tahoiya:${room.code}:${room.round}:${room.word}`}
                      artifactText={`単語=${room.word} / 読み=${room.reading ?? ""} / 語釈=${room.realDefinition} / 注記=${room.topicNote}`}
                      game="tahoiya"
                      task="tahoiya.topic"
                      playerId={operationPlayerId}
                      generation={room.topicGeneration}
                      reasonOptions={tahoiyaFeedbackReasons}
                      settings={{
                        playerCount: room.players.length,
                        answererMode: room.answererMode,
                        difficulty: "very-hard",
                        definitionStyle: "simple-definition",
                        punctuationStyle: "no-parentheses",
                      }}
                      outcome={{
                        correctVotes: Object.entries(room.votes).filter(([, optionId]) => room.options.find((option) => option.id === optionId)?.isReal).length,
                        fakeDefinitionCount: Object.keys(room.fakeDefinitions).length,
                      }}
                    />
                  )}
                  {isHost && (
                    <button onClick={nextRound} className={`mt-4 ${primaryButtonClass}`}>
                      次のラウンドへ
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
