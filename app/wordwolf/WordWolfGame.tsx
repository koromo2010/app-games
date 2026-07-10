"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  avatarColorOptions,
  clearPlayerSession,
  defaultAvatarImage,
  defaultAvatarImages,
  fallbackAvatarColor,
  makeRandomAvatarColor,
  normalizePlayerName,
  readPlayerSession,
  savePlayerSession,
} from "@/lib/player-session";
import {
  getTopicKey,
  isValidWordWolfTopic,
  normalizeGuess,
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
  pickFallbackTopic,
  type TopicDictionarySource,
  type TopicPairDistance,
  type TopicSourceMode,
  type WordWolfTopic,
} from "@/lib/wordwolf";

type Phase = "lobby" | "clue" | "vote" | "wolfGuess" | "result";
type ClueLogVisibility = "always" | "result";
type GameMode = "wordwolf" | "may-no-wolf";

type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
};

type Clue = {
  playerId: string;
  round: number;
  text: string;
  at: number;
};

type Room = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: Phase;
  gameMode: GameMode;
  debugMode?: boolean;
  clueLogVisibility: ClueLogVisibility;
  players: Player[];
  roundsTotal: number;
  turnTimeLimitSeconds: number;
  currentRound: number;
  currentTurnIndex: number;
  currentTurnStartedAt: number | null;
  wolfId: string | null;
  villageWord: string;
  wolfWord: string;
  topicReason: string;
  topicSource: WordWolfTopic["source"] | "pending";
  topicDictionarySource: TopicDictionarySource;
  topicPairDistance: TopicPairDistance;
  topicSourceMode?: TopicSourceMode;
  clues: Clue[];
  votes: Record<string, string>;
  accusedId: string | null;
  wolfGuess: string;
  winner: "village" | "wolf" | "players" | null;
  resultText: string;
  createdAt: number;
  updatedAt: number;
};

type RoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

const lobbyRounds = [1, 2, 3, 4];
const turnTimeLimitOptions = [0, 30, 60, 90, 120];
const noWolfChance = 0.1;
const roomStoragePrefix = "wordwolf-room-";
const topicHistoryKey = "wordwolf-topic-history";
const topicHistoryLimit = 30;
const panelClass = "rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]";
const mutedPanelClass = "rounded-lg border border-slate-200 bg-slate-50/90";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-100";
const primaryButtonClass =
  "rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-300";
const cyanButtonClass =
  "rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:bg-slate-300";
const subtleButtonClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50";
const dangerButtonClass =
  "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100";

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOwnerId() {
  const savedOwnerId = localStorage.getItem("wordwolf-owner-id");
  if (savedOwnerId) return savedOwnerId;

  const ownerId = makeId("owner");
  localStorage.setItem("wordwolf-owner-id", ownerId);
  return ownerId;
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getRoomKey(code: string) {
  return `${roomStoragePrefix}${code.toUpperCase()}`;
}

function saveRoom(room: Room) {
  localStorage.setItem(getRoomKey(room.code), JSON.stringify(stampRoom(room)));
}

function deleteRoom(code: string) {
  localStorage.removeItem(getRoomKey(code));
}

function loadRoom(code: string): Room | null {
  const raw = localStorage.getItem(getRoomKey(code));
  if (!raw) return null;

  try {
    const room = JSON.parse(raw) as Room;
    return {
      ...room,
      passphrase: room.passphrase ?? "",
      gameMode: normalizeGameMode(room.gameMode),
      clueLogVisibility: room.clueLogVisibility ?? "result",
      turnTimeLimitSeconds: room.turnTimeLimitSeconds ?? 0,
      currentTurnStartedAt: room.currentTurnStartedAt ?? null,
      topicDictionarySource: normalizeTopicDictionarySource(room.topicDictionarySource ?? room.topicSourceMode),
      topicPairDistance: normalizeTopicPairDistance(room.topicPairDistance ?? room.topicSourceMode),
    };
  } catch {
    return null;
  }
}

function listRooms(): Room[] {
  const rooms: Room[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(roomStoragePrefix)) continue;

    const room = loadRoom(key.slice(roomStoragePrefix.length));
    if (room) rooms.push(room);
  }

  return rooms;
}

function listJoinableRooms(): RoomChoice[] {
  return listRooms()
    .filter((room) => room.phase === "lobby" && room.players.length < 6)
    .map((room) => ({
      code: room.code,
      hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
      playerCount: room.players.length,
      roundsTotal: room.roundsTotal,
      hasPassphrase: Boolean(room.passphrase),
      updatedAt: room.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function deleteHostedRooms(ownerId: string, fallbackHostId: string) {
  listRooms()
    .filter((room) => room.ownerId === ownerId || (!room.ownerId && room.hostId === fallbackHostId))
    .forEach((room) => deleteRoom(room.code));
}

function createEmptyRoom(
  hostName: string,
  passphrase: string,
  ownerId: string,
  avatarColor: string,
  avatarImage?: string | null,
): { room: Room; player: Player } {
  const player = createPlayer(hostName, avatarColor, avatarImage);
  const room: Room = {
    code: makeRoomCode(),
    hostId: player.id,
    ownerId,
    passphrase,
    phase: "lobby",
    gameMode: "wordwolf",
    clueLogVisibility: "result",
    players: [player],
    roundsTotal: 3,
    turnTimeLimitSeconds: 0,
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: null,
    wolfId: null,
    villageWord: "",
    wolfWord: "",
    topicReason: "",
    topicSource: "pending",
    topicDictionarySource: "ja-daily",
    topicPairDistance: "balanced",
    clues: [],
    votes: {},
    accusedId: null,
    wolfGuess: "",
    winner: null,
    resultText: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { room, player };
}

function stampRoom(room: Room) {
  return { ...room, updatedAt: Date.now() };
}

function createPlayer(
  name: string,
  avatarColor = makeRandomAvatarColor(),
  avatarImage?: string | null,
): Player {
  return {
    id: makeId("player"),
    name,
    avatarColor,
    avatarImage: avatarImage || undefined,
    joinedAt: Date.now(),
  };
}

function pickWolf(players: Player[]) {
  return players[Math.floor(Math.random() * players.length)];
}

function createClue(playerId: string, round: number, text: string): Clue {
  return { playerId, round, text, at: Date.now() };
}

function fillSoloTestPlayers(players: Player[]) {
  const nextPlayers = [...players];

  while (nextPlayers.length < 3) {
    nextPlayers.push(createPlayer(`Test Player ${nextPlayers.length + 1}`));
  }

  return nextPlayers;
}

function loadTopicHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(topicHistoryKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberTopic(topic: WordWolfTopic) {
  const key = getTopicKey(topic);
  const history = loadTopicHistory().filter((item) => item !== key);
  localStorage.setItem(topicHistoryKey, JSON.stringify([key, ...history].slice(0, topicHistoryLimit)));
}

async function fetchTopicWithFallback(
  dictionarySource: TopicDictionarySource,
  pairDistance: TopicPairDistance,
): Promise<WordWolfTopic> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1500);
  const history = loadTopicHistory().slice(0, topicHistoryLimit);
  const params = new URLSearchParams({ source: dictionarySource, distance: pairDistance });
  if (history.length > 0) {
    params.set("exclude", history.join(","));
  }

  try {
    const response = await fetch(`/api/wordwolf/topic?${params.toString()}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const topic = pickFallbackTopic(history, dictionarySource, pairDistance);
      rememberTopic(topic);
      return topic;
    }

    const topic = (await response.json()) as WordWolfTopic;
    if (!isValidWordWolfTopic(topic)) {
      const fallbackTopic = pickFallbackTopic(history, dictionarySource, pairDistance);
      rememberTopic(fallbackTopic);
      return fallbackTopic;
    }

    rememberTopic(topic);
    return topic;
  } catch {
    const topic = pickFallbackTopic(history, dictionarySource, pairDistance);
    rememberTopic(topic);
    return topic;
  } finally {
    window.clearTimeout(timer);
  }
}

function getVoteTarget(room: Room) {
  const counts = room.players.map((player) => ({
    playerId: player.id,
    count: Object.values(room.votes).filter((vote) => vote === player.id).length,
  }));
  const max = Math.max(...counts.map((item) => item.count), 0);
  const top = counts.filter((item) => item.count === max);

  if (max === 0 || top.length !== 1) return null;
  return top[0].playerId;
}

function getNextVotePlayer(room: Room) {
  return room.players.find((player) => !room.votes[player.id]) ?? null;
}

function ClueLogPanel({ room }: { room: Room }) {
  return (
    <div className={panelClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-700">Timeline</p>
          <h2 className="text-xl font-bold text-slate-950">発言ログ</h2>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {room.clues.length} posts
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {room.clues.length === 0 ? (
          <p className={`${mutedPanelClass} px-3 py-6 text-center text-sm text-slate-500`}>
            まだ投稿はありません。
          </p>
        ) : (
          room.clues.map((clue) => {
            const player = room.players.find((item) => item.id === clue.playerId);
            return (
              <div
                key={`${clue.playerId}-${clue.round}-${clue.at}`}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{player?.name ?? "Unknown"}</p>
                  <p className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">{clue.round}周目</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{clue.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function WordWolfGame() {
  const [room, setRoom] = useState<Room | null>(null);
  const [activePlayerId, setActivePlayerId] = useState("");
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === "undefined") return "";
    return readPlayerSession()?.name ?? "";
  });
  const [roomPassphrase, setRoomPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinableRooms, setJoinableRooms] = useState<RoomChoice[]>([]);
  const [isJoinListOpen, setIsJoinListOpen] = useState(false);
  const [clueInput, setClueInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [error, setError] = useState("");
  const [avatarColor, setAvatarColor] = useState(() => {
    const randomColor = makeRandomAvatarColor();
    if (typeof window === "undefined") return randomColor;
    const savedSession = readPlayerSession();
    return savedSession?.avatarColor ?? randomColor;
  });
  const [avatarImage, setAvatarImage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return readPlayerSession()?.avatarImage ?? null;
  });
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDebugAuthing, setIsDebugAuthing] = useState(false);
  const [isDebugPasswordOpen, setIsDebugPasswordOpen] = useState(false);
  const [debugPassword, setDebugPassword] = useState("");
  const [debugPasswordError, setDebugPasswordError] = useState("");
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const lastCode = localStorage.getItem("wordwolf-last-room");
    const lastPlayer = localStorage.getItem("wordwolf-last-player");
    if (!lastCode) return;

    const savedRoom = loadRoom(lastCode);
    if (!savedRoom) return;

    const timer = window.setTimeout(() => {
      setRoom(savedRoom);
      if (lastPlayer && savedRoom.players.some((player) => player.id === lastPlayer)) {
        setActivePlayerId(lastPlayer);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!room) return;

    const timer = window.setInterval(() => {
      const latest = loadRoom(room.code);
      if (latest && latest.updatedAt !== room.updatedAt) {
        setRoom(latest);
      } else if (!latest) {
        setRoom(null);
        setActivePlayerId("");
        setError("部屋が解散されました。");
      }
    }, 700);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getRoomKey(room.code)) return;
      if (!event.newValue) {
        setRoom(null);
        setActivePlayerId("");
        setError("部屋が解散されました。");
        return;
      }

      const latest = loadRoom(room.code);
      if (latest) setRoom(latest);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [room]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === activePlayerId) ?? null,
    [activePlayerId, room],
  );

  const currentPlayer = room?.players[room.currentTurnIndex] ?? null;
  const wolfPlayer = room?.players.find((player) => player.id === room.wolfId) ?? null;
  const accusedPlayer = room?.players.find((player) => player.id === room.accusedId) ?? null;
  const nextVotePlayer = room ? getNextVotePlayer(room) : null;
  const isDebugMode = Boolean(room?.debugMode);
  const clueActor = isDebugMode ? currentPlayer : activePlayer;
  const voteActor = isDebugMode ? nextVotePlayer : activePlayer;
  const guessActor = isDebugMode ? wolfPlayer : activePlayer;
  const isHost = Boolean(room && activePlayerId === room.hostId);
  const headerName = activePlayer?.name || playerName.trim() || "ゲスト";
  const headerAvatarColor = activePlayer?.avatarColor || avatarColor;
  const headerAvatarImage = activePlayer?.avatarImage || avatarImage || defaultAvatarImage;
  const displayWordPlayer = isDebugMode && room?.phase === "clue" ? currentPlayer : activePlayer;
  const ownWord = displayWordPlayer && room && room.phase !== "lobby"
    ? displayWordPlayer.id === room.wolfId
      ? room.wolfWord
      : room.villageWord
    : "";
  const resultTitle = room?.winner === "players"
    ? "結果"
    : room?.winner === "village"
      ? "村側の勝利"
      : "狼の勝利";
  const hasWolfInCurrentGame = Boolean(room?.wolfId);
  const topicSourceLabel =
    room?.topicSource === "llm"
      ? "LLM生成"
      : room?.topicSource === "fallback"
        ? "サンプル辞書"
        : "未取得";
  const votedCount = room ? Object.keys(room.votes).length : 0;
  const shouldShowClueLog = Boolean(
    room && (room.clueLogVisibility === "always" || room.phase === "result"),
  );
  const turnSecondsLeft = room?.phase === "clue" && room.turnTimeLimitSeconds > 0 && room.currentTurnStartedAt
    ? Math.max(
        0,
        room.turnTimeLimitSeconds - Math.floor((now - room.currentTurnStartedAt) / 1000),
      )
    : null;

  const setAndSaveRoom = useCallback((nextRoom: Room) => {
    const stampedRoom = stampRoom(nextRoom);
    setRoom(stampedRoom);
    saveRoom(stampedRoom);
    localStorage.setItem("wordwolf-last-room", stampedRoom.code);
  }, []);

  const createRoom = () => {
    const name = playerName.trim();
    const passphrase = roomPassphrase.trim();
    if (!name) {
      setError("ゲームロビーでプレイヤー登録をしてください。");
      return;
    }

    const ownerId = getOwnerId();
    const fallbackHostId = activePlayerId || localStorage.getItem("wordwolf-last-player") || "";
    deleteHostedRooms(ownerId, fallbackHostId);

    const created = createEmptyRoom(name, passphrase, ownerId, avatarColor, avatarImage);
    setIsJoinListOpen(false);
    setJoinableRooms([]);
    setActivePlayerId(created.player.id);
    setAndSaveRoom(created.room);
    localStorage.setItem("wordwolf-last-player", created.player.id);
    setError("");
  };

  const showJoinChoices = () => {
    const rooms = listJoinableRooms();
    setJoinableRooms(rooms);
    setIsJoinListOpen(true);
    setError(rooms.length > 0 ? "" : "参加できる未開始の部屋がありません。");
  };

  const joinRoom = (selectedCode = joinCode) => {
    const code = selectedCode.trim().toUpperCase();
    const name = playerName.trim();
    const passphrase = roomPassphrase.trim();
    if (!name) {
      setError("ゲームロビーでプレイヤー登録をしてください。");
      return;
    }
    if (!code) {
      setError("部屋コードを入力してください。");
      return;
    }

    const targetRoom = loadRoom(code);
    if (!targetRoom) {
      setError("その部屋が見つかりません。同じブラウザ内で作った部屋コードを使ってください。");
      return;
    }
    if (targetRoom.phase !== "lobby") {
      setError("開始済みの部屋には参加できません。");
      return;
    }
    if (targetRoom.passphrase && targetRoom.passphrase !== passphrase) {
      setError("合言葉が違います。");
      return;
    }
    if (targetRoom.players.length >= 6) {
      setError("この部屋は6人で満員です。");
      return;
    }

    const player = createPlayer(name, avatarColor, avatarImage);
    const nextRoom = { ...targetRoom, players: [...targetRoom.players, player] };
    setJoinCode(code);
    setIsJoinListOpen(false);
    setJoinableRooms([]);
    setActivePlayerId(player.id);
    setAndSaveRoom(nextRoom);
    localStorage.setItem("wordwolf-last-player", player.id);
    setError("");
  };

  const dissolveRoom = () => {
    if (!room || !isHost) return;
    if (!window.confirm("部屋を解散しますか？参加者はこの部屋に戻れなくなります。")) return;

    deleteRoom(room.code);
    if (localStorage.getItem("wordwolf-last-room") === room.code) {
      localStorage.removeItem("wordwolf-last-room");
      localStorage.removeItem("wordwolf-last-player");
    }
    setRoom(null);
    setActivePlayerId("");
    setError("部屋を解散しました。");
  };

  const logout = () => {
    clearPlayerSession();
    localStorage.removeItem("wordwolf-last-room");
    localStorage.removeItem("wordwolf-last-player");
    setRoom(null);
    setActivePlayerId("");
    setPlayerName("");
    setRoomPassphrase("");
    setJoinCode("");
    setJoinableRooms([]);
    setIsAvatarPickerOpen(false);
    setError("入力情報をリセットしました。");
  };

  const updatePlayerName = (nextName: string) => {
    setPlayerName(nextName);
    const normalizedName = normalizePlayerName(nextName);

    if (!nextName.trim() || nextName.trim() === "名無し") return;

    savePlayerSession({
      name: normalizedName,
      avatarColor,
      avatarImage,
    });

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, name: normalizedName } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const commitPlayerName = () => {
    const normalizedName = normalizePlayerName(playerName);
    setPlayerName(normalizedName);
    savePlayerSession({
      name: normalizedName,
      avatarColor,
      avatarImage,
    });

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, name: normalizedName } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const updateAvatarColor = (nextColor: string) => {
    setAvatarColor(nextColor);
    setIsAvatarPickerOpen(false);
    if (playerName.trim()) {
      savePlayerSession({
        name: playerName.trim(),
        avatarColor: nextColor,
        avatarImage,
      });
    }

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, avatarColor: nextColor } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const updateAvatarImage = (nextImage: string | null) => {
    setAvatarImage(nextImage);
    if (playerName.trim()) {
      savePlayerSession({
        name: playerName.trim(),
        avatarColor,
        avatarImage: nextImage,
      });
    }

    if (!room || !activePlayerId) return;

    const players = room.players.map((player) =>
      player.id === activePlayerId ? { ...player, avatarImage: nextImage || undefined } : player,
    );
    setAndSaveRoom({ ...room, players });
  };

  const uploadAvatarImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setError("画像を読み込めませんでした。");
        return;
      }
      updateAvatarImage(reader.result);
      setError("");
    };
    reader.onerror = () => setError("画像を読み込めませんでした。");
    reader.readAsDataURL(file);
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        try {
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
        } finally {
          document.body.removeChild(textArea);
        }
      }
      setError(successMessage);
    } catch {
      setError("コピーできませんでした。ブラウザの権限を確認してください。");
    }
  };

  const copyRoomCode = () => {
    if (!room) return;
    void copyText(room.code, "ROOMをコピーしました。");
  };

  const copyRoomInvite = () => {
    if (!room) return;
    const passphraseText = room.passphrase ? room.passphrase : "なし";
    void copyText(`ROOM: ${room.code}\n合言葉: ${passphraseText}`, "ROOMと合言葉をコピーしました。");
  };

  const addSeat = () => {
    if (!room || room.players.length >= 6) return;
    const playerNumber = room.players.length + 1;
    const player = createPlayer(`Player ${playerNumber}`);
    setAndSaveRoom({ ...room, players: [...room.players, player] });
  };

  const toggleDebugMode = () => {
    if (!room || room.phase !== "lobby") return;

    if (room.debugMode) {
      setAndSaveRoom({ ...room, debugMode: false });
      setError("");
      return;
    }

    setDebugPassword("");
    setDebugPasswordError("");
    setIsDebugPasswordOpen(true);
  };

  const confirmDebugPassword = async () => {
    if (!room || room.phase !== "lobby" || room.debugMode) return;

    setIsDebugAuthing(true);
    setError("");
    setDebugPasswordError("");

    try {
      const response = await fetch("/api/debug-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: debugPassword }),
      });

      if (!response.ok) {
        setDebugPasswordError(response.status === 503
          ? "デバッグ用パスワードが未設定です。管理者に確認してください。"
          : "デバッグ用パスワードが違います。");
        return;
      }

      setAndSaveRoom({ ...room, debugMode: true });
      setDebugPassword("");
      setIsDebugPasswordOpen(false);
    } catch {
      setError("デバッグモードを切り替えられませんでした。もう一度試してください。");
    } finally {
      setIsDebugAuthing(false);
    }
  };

  const setClueLogVisibility = (clueLogVisibility: ClueLogVisibility) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, clueLogVisibility });
  };

  const setGameMode = (gameMode: GameMode) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, gameMode });
  };

  const setTurnTimeLimit = (turnTimeLimitSeconds: number) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, turnTimeLimitSeconds });
  };

  const setTopicDictionarySource = (topicDictionarySource: TopicDictionarySource) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicDictionarySource });
  };

  const setTopicPairDistance = (topicPairDistance: TopicPairDistance) => {
    if (!room || room.phase !== "lobby") return;
    setAndSaveRoom({ ...room, topicPairDistance });
  };

  const startGame = async () => {
    if (!room || isStarting) return;

    setIsStarting(true);
    setError("");

    try {
      if (!room.debugMode && room.players.length < 3) {
        setError("デバッグモードOFFでは3人以上で開始してください。");
        return;
      }

      const topic = await fetchTopicWithFallback(room.topicDictionarySource, room.topicPairDistance);
      const players = room.debugMode ? fillSoloTestPlayers(room.players) : room.players;
      const shouldHaveWolf = room.gameMode === "wordwolf" || Math.random() >= noWolfChance;
      const wolf = shouldHaveWolf ? pickWolf(players) : null;
      setAndSaveRoom({
        ...room,
        players,
        debugMode: room.debugMode,
        phase: "clue",
        currentRound: 1,
        currentTurnIndex: 0,
        currentTurnStartedAt: Date.now(),
        wolfId: wolf?.id ?? null,
        villageWord: topic.villageWord,
        wolfWord: wolf ? topic.wolfWord : topic.villageWord,
        topicReason: topic.reason,
        topicSource: topic.source,
        clues: [],
        votes: {},
        accusedId: null,
        wolfGuess: "",
        winner: null,
        resultText: "",
      });
    } catch {
      setError("お題を取得できませんでした。もう一度試してください。");
    } finally {
      setIsStarting(false);
    }
  };

  const submitClue = useCallback((isTimeout = false) => {
    if (!room || !clueActor || !currentPlayer) return;
    const text = isTimeout ? "時間切れ" : clueInput.trim();
    if (!text || clueActor.id !== currentPlayer.id) return;

    const isLastPlayer = room.currentTurnIndex >= room.players.length - 1;
    const isLastRound = room.currentRound >= room.roundsTotal;
    const nextRoom: Room = {
      ...room,
      clues: [...room.clues, createClue(clueActor.id, room.currentRound, text)],
      currentTurnIndex: isLastPlayer ? 0 : room.currentTurnIndex + 1,
      currentRound: isLastPlayer && !isLastRound ? room.currentRound + 1 : room.currentRound,
      phase: isLastPlayer && isLastRound ? "vote" : "clue",
      currentTurnStartedAt: isLastPlayer && isLastRound ? null : Date.now(),
    };

    setClueInput("");
    setAndSaveRoom(nextRoom);
  }, [clueActor, clueInput, currentPlayer, room, setAndSaveRoom]);

  useEffect(() => {
    if (
      !room ||
      room.phase !== "clue" ||
      room.turnTimeLimitSeconds <= 0 ||
      turnSecondsLeft !== 0 ||
      clueActor?.id !== currentPlayer?.id
    ) {
      return;
    }

    const timer = window.setTimeout(() => submitClue(true), 0);
    return () => window.clearTimeout(timer);
  }, [clueActor?.id, currentPlayer?.id, room, submitClue, turnSecondsLeft]);

  const isComposingEnter = (event: KeyboardEvent<HTMLElement>) =>
    event.nativeEvent.isComposing || event.keyCode === 229;

  const submitClueOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || isComposingEnter(event)) return;
    event.preventDefault();
    submitClue();
  };

  const submitGuessOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposingEnter(event)) return;
    event.preventDefault();
    submitWolfGuess();
  };

  const castVote = (targetId: string) => {
    if (!room || !voteActor || room.phase !== "vote") return;
    const votes = { ...room.votes, [voteActor.id]: targetId };
    const nextRoom = { ...room, votes };

    if (Object.keys(votes).length >= room.players.length) {
      const accusedId = getVoteTarget(nextRoom);
      if (room.gameMode === "may-no-wolf" && !room.wolfId) {
        const loserName = nextRoom.players.find((player) => player.id === accusedId)?.name;
        setAndSaveRoom({
          ...nextRoom,
          phase: "result",
          currentTurnStartedAt: null,
          accusedId,
          winner: "players",
          resultText: accusedId
            ? `狼はいませんでした。投票で選ばれた${loserName ?? "プレイヤー"}の負けです。`
            : "狼はいませんでした。投票が割れたため敗者なしです。",
        });
        return;
      }

      if (accusedId && accusedId === room.wolfId) {
        setAndSaveRoom({ ...nextRoom, phase: "wolfGuess", accusedId, currentTurnStartedAt: null });
        return;
      }

      setAndSaveRoom({
        ...nextRoom,
        phase: "result",
        currentTurnStartedAt: null,
        accusedId,
        winner: "wolf",
        resultText: accusedId
          ? "投票で狼を当てられませんでした。狼の勝利です。"
          : "投票が割れました。狼の勝利です。",
      });
      return;
    }

    setAndSaveRoom(nextRoom);
  };

  const submitWolfGuess = () => {
    if (!room || !guessActor || guessActor.id !== room.wolfId) return;
    const isCorrect = normalizeGuess(guessInput) === normalizeGuess(room.villageWord);

    setAndSaveRoom({
      ...room,
      phase: "result",
      currentTurnStartedAt: null,
      wolfGuess: guessInput.trim(),
      winner: isCorrect ? "wolf" : "village",
      resultText: isCorrect
        ? "狼が村のお題を当てました。逆転で狼の勝利です。"
        : "狼は村のお題を外しました。村側の勝利です。",
    });
  };

  const resetToLobby = (targetRoom: Room): Room => ({
    ...targetRoom,
    phase: "lobby",
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: null,
    wolfId: null,
    villageWord: "",
    wolfWord: "",
    topicReason: "",
    topicSource: "pending",
    clues: [],
    votes: {},
    accusedId: null,
    wolfGuess: "",
    winner: null,
    resultText: "",
  });

  const resetRoom = () => {
    if (!room) return;
    setAndSaveRoom(resetToLobby(room));
    setGuessInput("");
    setClueInput("");
  };

  const abortGame = () => {
    if (!room || room.phase === "lobby") return;
    setAndSaveRoom(resetToLobby(room));
    setGuessInput("");
    setClueInput("");
  };

  return (
    <main className="min-h-screen bg-slate-950 pt-[104px] text-slate-950 sm:pt-[82px]">
      <section className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white shadow-2xl shadow-slate-950/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200">Room based social deduction</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-normal sm:text-3xl">ワードウルフ・ラウンジ</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/games"
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-cyan-50 transition hover:bg-white/15"
            >
              ゲームロビー
            </Link>
            <div className="relative flex min-w-0 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen((isOpen) => !isOpen)}
                className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-white/10 shadow-sm ring-2 ring-white/10 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                style={{ backgroundColor: headerAvatarColor }}
                aria-label="アイコン色を選ぶ"
              >
                <span
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${headerAvatarImage})` }}
                  aria-hidden="true"
                />
              </button>
              <span className="max-w-[140px] truncate font-semibold text-cyan-50">{headerName}</span>
              {(activePlayerId || playerName.trim()) && (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  ログアウト
                </button>
              )}
              {isAvatarPickerOpen && (
                <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-white/15 bg-slate-950/95 p-3 shadow-2xl">
                  <label className="block text-xs font-semibold text-cyan-100">
                    プレイヤー名
                    <input
                      value={playerName}
                      onChange={(event) => updatePlayerName(event.target.value)}
                      onBlur={commitPlayerName}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="mt-2 w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm font-semibold text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200"
                      placeholder="空欄なら自動生成"
                    />
                  </label>
                  <p className="mt-3 text-xs font-semibold text-cyan-100">アイコン色</p>
                  <div className="mt-2 grid grid-cols-8 gap-2">
                    {avatarColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateAvatarColor(color)}
                        className={`h-8 w-8 rounded-full border transition hover:scale-105 ${
                          headerAvatarColor === color ? "border-white ring-2 ring-cyan-200" : "border-white/30"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`${color} を選択`}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-cyan-100">デフォルト画像</p>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {defaultAvatarImages.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => updateAvatarImage(image)}
                        className={`h-10 w-10 overflow-hidden rounded-full border bg-cover bg-center transition hover:scale-105 ${
                          headerAvatarImage === image ? "border-white ring-2 ring-cyan-200" : "border-white/30"
                        }`}
                        style={{
                          backgroundColor: headerAvatarColor,
                          backgroundImage: `url(${image})`,
                        }}
                        aria-label={`デフォルト画像 ${index + 1} を選択`}
                      />
                    ))}
                  </div>
                  <label className="mt-3 block cursor-pointer rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-center text-xs font-semibold text-cyan-50 transition hover:bg-white/15">
                    画像をアップロード
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        uploadAvatarImage(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {avatarImage && (
                    <button
                      type="button"
                      onClick={() => updateAvatarImage(defaultAvatarImage)}
                      className="mt-2 w-full rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      デフォルト画像に戻す
                    </button>
                  )}
                </div>
              )}
            </div>
            {room && isHost && (
              <button
                type="button"
                onClick={toggleDebugMode}
                disabled={room.phase !== "lobby" || isDebugAuthing}
                className={`rounded-lg border px-3 py-1.5 font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  room.debugMode
                    ? "border-cyan-200 bg-cyan-200 text-slate-950 hover:bg-cyan-100"
                    : "border-white/15 bg-white/10 text-cyan-50 hover:bg-white/15"
                }`}
              >
                {isDebugAuthing ? "確認中..." : room.debugMode ? "デバッグ ON" : "デバッグ OFF"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsRulesOpen(true)}
              className="rounded-lg border border-amber-200 bg-amber-200 px-3 py-1.5 font-semibold text-slate-950 shadow-sm transition hover:bg-amber-100"
            >
              ルール
            </button>
          </div>
        </div>
      </section>

      {isDebugPasswordOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-5 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDebugPassword();
            }}
          >
            <p className="text-xs font-semibold uppercase text-cyan-700">Debug mode</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">パスワード確認</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              デバッグモードをONにするにはパスワードが必要です。
            </p>
            <input
              autoFocus
              type="password"
              value={debugPassword}
              onChange={(event) => setDebugPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              placeholder="パスワード"
              autoComplete="off"
            />
            {debugPasswordError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {debugPasswordError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDebugPasswordOpen(false);
                  setDebugPassword("");
                  setDebugPasswordError("");
                }}
                className={subtleButtonClass}
                disabled={isDebugAuthing}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={cyanButtonClass}
                disabled={!debugPassword || isDebugAuthing}
              >
                {isDebugAuthing ? "確認中..." : "ONにする"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isRulesOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wordwolf-rules-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/20 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700">Rules</p>
                <h2 id="wordwolf-rules-title" className="mt-1 text-2xl font-bold text-slate-950">
                  現在のルール
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRulesOpen(false)}
                className={subtleButtonClass}
              >
                閉じる
              </button>
            </div>

            <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700">
              <section>
                <h3 className="text-base font-bold text-slate-950">基本の流れ</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>ホストが部屋を作り、参加者が部屋に入ります。</li>
                  <li>ホストがゲームモード、周回数、持ち時間、お題ソースなどを設定します。</li>
                  <li>ゲーム開始後、各プレイヤーに自分のお題が表示されます。</li>
                  <li>順番に、お題そのものを言わず関連する発言を書き込みます。</li>
                  <li>設定した周回が終わったら投票します。</li>
                </ol>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">ワードウルフ</h3>
                <p className="mt-2">
                  1人だけ違うお題を持つ狼になります。投票で狼以外が選ばれたら狼の勝利です。狼が選ばれた場合、狼は村側のお題を当てると逆転勝利できます。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">狼不在設定</h3>
                <p className="mt-2">
                  通常は狼がいますが、10%の確率で狼がいない回になります。狼がいない回では全員が同じお題を持ち、投票で選ばれた人が負けです。同票の場合は敗者なしです。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">デバッグモード</h3>
                <p className="mt-2">
                  デバッグモードでは1人でもテストできます。足りないプレイヤーはテスト用に補完され、発言や投票の操作対象を画面上で切り替えながら確認できます。
                </p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-950">お題とログ</h3>
                <p className="mt-2">
                  お題はサンプルリストまたはLLM生成から取得します。発言ログは部屋設定で、常に表示するかゲーム終了後だけ表示するかを選べます。
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          {!room && (
            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Entry</p>
                  <h2 className="text-lg font-bold text-slate-950">部屋</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">local</span>
              </div>
              {playerName.trim() ? (
                <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
                  <p className="text-xs font-semibold text-cyan-700">プレイヤー</p>
                  <p className="mt-0.5 font-bold">{playerName.trim()}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <p className="font-semibold">先にロビーでプレイヤー登録してください。</p>
                  <Link
                    href="/games"
                    className="mt-2 inline-flex rounded-lg bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100"
                  >
                    ゲームロビーへ
                  </Link>
                </div>
              )}
              <label className="mt-3 block text-sm font-medium text-slate-700">
                合言葉（任意）
                <input
                  value={roomPassphrase}
                  onChange={(event) => setRoomPassphrase(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  placeholder="空欄なら合言葉なし"
                  type="password"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={createRoom}
                  disabled={!playerName.trim()}
                  className={cyanButtonClass}
                >
                  部屋を作成
                </button>
                <button
                  onClick={showJoinChoices}
                  disabled={!playerName.trim()}
                  className={subtleButtonClass}
                >
                  参加
                </button>
              </div>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className={`mt-2 font-mono uppercase ${inputClass}`}
                placeholder="ROOM CODE"
                maxLength={4}
              />
              {isJoinListOpen && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">参加できる部屋</p>
                    <button
                      onClick={showJoinChoices}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      更新
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {joinableRooms.length === 0 ? (
                      <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
                        未開始の部屋はありません。
                      </p>
                    ) : (
                      joinableRooms.map((choice) => (
                        <button
                          key={choice.code}
                          onClick={() => joinRoom(choice.code)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-base font-bold">{choice.code}</span>
                            <span className="text-xs text-slate-500">
                              {choice.hasPassphrase ? "合言葉あり" : "合言葉なし"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span>host: {choice.hostName}</span>
                            <span>{choice.playerCount}/6人</span>
                            <span>{choice.roundsTotal}周</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {joinCode.trim() && (
                    <button
                      onClick={() => joinRoom()}
                      className={`mt-3 w-full ${subtleButtonClass}`}
                    >
                      入力したコードで参加
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {room && (
            <div className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Room</p>
                  <p className="font-mono text-3xl font-black tracking-normal text-slate-950">{room.code}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {room.phase}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      title="ROOMコードをコピー"
                      aria-label="ROOMコードをコピー"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"
                    >
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span>
                      <span>ROOM</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyRoomInvite}
                      title="ROOMと合言葉をコピー"
                      aria-label="ROOMと合言葉をコピー"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900"
                    >
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">コピー</span>
                      <span>ROOM+合言葉</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {room.players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => {
                      setActivePlayerId(player.id);
                      localStorage.setItem("wordwolf-last-player", player.id);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                      player.id === activePlayerId
                        ? "border-cyan-500 bg-cyan-50 text-cyan-950"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-white bg-cover bg-center shadow-sm"
                        style={{
                          backgroundColor: player.avatarColor || fallbackAvatarColor,
                          backgroundImage: `url(${player.avatarImage || defaultAvatarImage})`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{player.name}</span>
                    </span>
                    {player.id === room.hostId && <span className="text-xs text-slate-500">host</span>}
                  </button>
                ))}
              </div>

              {isHost && (
                <button
                  onClick={dissolveRoom}
                  className={`mt-4 w-full ${dangerButtonClass}`}
                >
                  部屋を解散
                </button>
              )}

              {room.phase === "lobby" && isHost && (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">狼不在</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGameMode("wordwolf")}
                        aria-pressed={room.gameMode === "wordwolf"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.gameMode === "wordwolf"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        なし
                      </button>
                      <button
                        type="button"
                        onClick={() => setGameMode("may-no-wolf")}
                        aria-pressed={room.gameMode === "may-no-wolf"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.gameMode === "may-no-wolf"
                            ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        あり
                      </button>
                    </div>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    周回数
                    <select
                      value={room.roundsTotal}
                      onChange={(event) => setAndSaveRoom({ ...room, roundsTotal: Number(event.target.value) })}
                      className={`mt-1 ${inputClass}`}
                    >
                      {lobbyRounds.map((round) => (
                        <option key={round} value={round}>
                          {round}周
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    持ち時間
                    <select
                      value={room.turnTimeLimitSeconds}
                      onChange={(event) => setTurnTimeLimit(Number(event.target.value))}
                      className={`mt-1 ${inputClass}`}
                    >
                      {turnTimeLimitOptions.map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds === 0 ? "なし" : `${seconds}秒`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    お題ソース
                    <select
                      value={room.topicDictionarySource}
                      onChange={(event) =>
                        setTopicDictionarySource(normalizeTopicDictionarySource(event.target.value))
                      }
                      className={`mt-1 ${inputClass}`}
                    >
                      <option value="ja-daily">サンプル: 日本語日常語</option>
                      <option value="en-common">サンプル: 英語common nouns</option>
                      <option value="curated-pairs">サンプル: 固定ペア</option>
                      <option value="llm">LLM生成</option>
                    </select>
                  </label>
                  <div>
                    <p className="text-sm font-medium text-slate-700">ペアの距離</p>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("near")}
                        aria-pressed={room.topicPairDistance === "near"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "near"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        近め
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("balanced")}
                        aria-pressed={room.topicPairDistance === "balanced"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "balanced"
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        標準
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicPairDistance("wide")}
                        aria-pressed={room.topicPairDistance === "wide"}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                          room.topicPairDistance === "wide"
                            ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        広め
                      </button>
                    </div>
                  </div>
                  {room.debugMode && (
                    <button
                      onClick={addSeat}
                      disabled={room.players.length >= 6}
                      className={`w-full disabled:opacity-50 ${subtleButtonClass}`}
                    >
                      テスト用プレイヤー追加
                    </button>
                  )}
                  <label className="block text-sm font-medium text-slate-700">
                    発言ログ
                    <select
                      value={room.clueLogVisibility}
                      onChange={(event) =>
                        setClueLogVisibility(event.target.value as ClueLogVisibility)
                      }
                      className={`mt-1 ${inputClass}`}
                    >
                      <option value="result">ゲーム終了後だけ表示</option>
                      <option value="always">常に表示</option>
                    </select>
                  </label>
                  <button
                    onClick={startGame}
                    disabled={isStarting}
                    className={`w-full ${primaryButtonClass}`}
                  >
                    {isStarting ? "お題生成中..." : "ゲーム開始"}
                  </button>
                </div>
              )}
            </div>
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
              <div className={panelClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-cyan-700">Active player</p>
                    <p className="text-2xl font-black text-slate-950">{activePlayer?.name ?? "未選択"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm sm:w-[360px]">
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">人数</p>
                      <p className="font-bold text-slate-950">{room.players.length}/6</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">周回</p>
                      <p className="font-bold text-slate-950">{room.currentRound}/{room.roundsTotal}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-2">
                      <p className="text-xs text-slate-500">投票</p>
                      <p className="font-bold text-slate-950">{votedCount}/{room.players.length}</p>
                    </div>
                  </div>
                </div>

                {ownWord && (
                  <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
                    <p className="text-xs font-semibold uppercase text-cyan-700">Your topic</p>
                    <p className="mt-1 text-3xl font-black text-cyan-950">{ownWord}</p>
                  </div>
                )}

                {isDebugMode && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">デバッグモード</p>
                    {room.phase === "clue" && currentPlayer && (
                      <p className="mt-1">現在の手番「{currentPlayer.name}」として投稿します。</p>
                    )}
                    {room.phase === "vote" && nextVotePlayer && (
                      <p className="mt-1">次の投票者「{nextVotePlayer.name}」として投票します。</p>
                    )}
                    {room.phase === "wolfGuess" && wolfPlayer && (
                      <p className="mt-1">狼「{wolfPlayer.name}」として逆転回答します。</p>
                    )}
                    {room.phase !== "lobby" && (
                      <button
                        onClick={abortGame}
                        className={`mt-3 ${dangerButtonClass}`}
                      >
                        ゲームを中断
                      </button>
                    )}
                  </div>
                )}
              </div>

              {room.phase === "lobby" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Lobby</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">ロビー</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    部屋コードを共有して参加してもらいます。1人で動作確認するときは、デバッグモードをONにしてください。
                  </p>
                </div>
              )}

              {room.phase === "clue" && (
                <div className={panelClass}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-cyan-700">Current turn</p>
                      <h2 className="mt-1 text-3xl font-black text-slate-950">{currentPlayer?.name}</h2>
                    </div>
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                      {room.currentRound}周目
                    </p>
                  </div>
                  {turnSecondsLeft !== null && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                      残り {turnSecondsLeft} 秒
                    </div>
                  )}
                  <textarea
                    value={clueInput}
                    onChange={(event) => setClueInput(event.target.value)}
                    onKeyDown={submitClueOnEnter}
                    disabled={clueActor?.id !== currentPlayer?.id}
                    className={`mt-4 min-h-28 resize-y ${inputClass}`}
                    placeholder="お題そのものを言わずに、関連することを書き込む"
                  />
                  <button
                    onClick={() => submitClue()}
                    disabled={!clueInput.trim() || clueActor?.id !== currentPlayer?.id}
                    className={`mt-3 ${cyanButtonClass}`}
                  >
                    投稿して次へ
                  </button>
                </div>
              )}

              {room.phase === "vote" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Vote</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {room.gameMode === "may-no-wolf" ? "追放投票" : "誰が狼か投票"}
                  </h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {room.players.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => castVote(player.id)}
                        className={`rounded-lg border px-3 py-3 text-left font-semibold ${
                          voteActor && room.votes[voteActor.id] === player.id
                            ? "border-cyan-500 bg-cyan-50 text-cyan-950"
                            : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {room.phase === "wolfGuess" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_50px_rgba(120,53,15,0.16)]">
                  <p className="text-xs font-semibold uppercase text-amber-700">Final chance</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">狼が見つかりました</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    投票対象は {accusedPlayer?.name} です。狼は村側のお題を当てれば逆転勝利です。
                  </p>
                  <input
                    value={guessInput}
                    onChange={(event) => setGuessInput(event.target.value)}
                    onKeyDown={submitGuessOnEnter}
                    disabled={guessActor?.id !== room.wolfId}
                    className="mt-4 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-amber-100"
                    placeholder="村側のお題を入力"
                  />
                  <button
                    onClick={submitWolfGuess}
                    disabled={!guessInput.trim() || guessActor?.id !== room.wolfId}
                    className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 disabled:bg-slate-300"
                  >
                    回答する
                  </button>
                </div>
              )}

              {room.phase === "result" && (
                <div className={panelClass}>
                  <p className="text-xs font-semibold uppercase text-cyan-700">Result</p>
                  <h2 className="mt-1 text-3xl font-black text-slate-950">{resultTitle}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{room.resultText}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-100 p-3">
                      <dt className="text-xs text-slate-500">村側のお題</dt>
                      <dd className="mt-1 text-lg font-bold text-slate-950">{room.villageWord}</dd>
                    </div>
                    {hasWolfInCurrentGame ? (
                      <>
                        <div className="rounded-lg bg-slate-100 p-3">
                          <dt className="text-xs text-slate-500">狼のお題</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">{room.wolfWord}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-100 p-3">
                          <dt className="text-xs text-slate-500">狼</dt>
                          <dd className="mt-1 text-lg font-bold text-slate-950">{wolfPlayer?.name}</dd>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg bg-slate-100 p-3 sm:col-span-2">
                        <dt className="text-xs text-slate-500">投票で選ばれた人</dt>
                        <dd className="mt-1 text-lg font-bold text-slate-950">{accusedPlayer?.name ?? "なし"}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    お題理由: {room.topicReason} / 取得元: {topicSourceLabel}
                  </p>
                  {isHost && (
                    <div className="mt-4">
                      <p className="text-sm leading-6 text-slate-600">
                        同じ卓のままロビーに戻り、周数やログ表示を設定し直して続行できます。
                      </p>
                      <button
                        onClick={resetRoom}
                        className={`mt-3 ${primaryButtonClass}`}
                      >
                        ルール設定に戻って卓を続行
                      </button>
                    </div>
                  )}
                </div>
              )}

              {shouldShowClueLog && <ClueLogPanel room={room} />}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
