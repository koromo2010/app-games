import type { GameDebugLogEntry } from "./game-debug-log.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";

export type NigoichiPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
  isDummy?: boolean;
  shareNameAllowed?: boolean;
};

export type NigoichiPhase = "lobby" | "clue" | "guess" | "result";

export type NigoichiHand = readonly [number, number];

export type NigoichiRoom = {
  code: string;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: NigoichiPhase;
  players: NigoichiPlayer[];
  gameNumber: number;
  debugMode: boolean;
  debugReplayEnabled: boolean;
  words: string[];
  hands: Record<string, NigoichiHand>;
  clues: Record<string, string>;
  guesses: Record<string, number>;
  missingNumber: number | null;
  debugLog: GameDebugLogEntry[];
  createdAt: number;
  updatedAt: number;
};

export type NigoichiRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type NigoichiRoomAction =
  | { type: "join-room"; actorId: string; player: NigoichiPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "start-game"; actorId: string }
  | { type: "submit-clue"; actorId: string; playerId?: string; text: string }
  | { type: "submit-guess"; actorId: string; playerId?: string; number: number }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "debug-add-player"; actorId: string }
  | { type: "debug-fill-clues"; actorId: string }
  | { type: "debug-fill-guesses"; actorId: string };

export const nigoichiPlayerLimit = onlineRoomPlayerLimits.nigoichi;
export const nigoichiMinimumPlayers = 3;

export function shuffleNigoichi<T>(items: readonly T[], random = Math.random) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function dealNigoichiRound(players: Pick<NigoichiPlayer, "id">[], wordPool: readonly string[], random = Math.random) {
  const wordCount = players.length * 2 + 1;
  const words = shuffleNigoichi([...new Set(wordPool.map((word) => word.trim()).filter(Boolean))], random).slice(0, wordCount);
  if (words.length < wordCount) throw new Error("NIGOICHI_WORDS_UNAVAILABLE");
  const missingNumber = Math.floor(random() * wordCount);
  const dealtNumbers = shuffleNigoichi(
    Array.from({ length: wordCount }, (_, index) => index).filter((index) => index !== missingNumber),
    random,
  );
  const hands = Object.fromEntries(players.map((player, index) => [
    player.id,
    [dealtNumbers[index * 2], dealtNumbers[index * 2 + 1]] as NigoichiHand,
  ]));
  return { words, hands, missingNumber };
}

export function allNigoichiCluesSubmitted(room: Pick<NigoichiRoom, "players" | "clues">) {
  return room.players.every((player) => Boolean(room.clues[player.id]?.trim()));
}

export function allNigoichiGuessesSubmitted(room: Pick<NigoichiRoom, "players" | "guesses">) {
  return room.players.every((player) => Number.isInteger(room.guesses[player.id]));
}

export function nigoichiGuessIsCorrect(room: Pick<NigoichiRoom, "guesses" | "missingNumber">, playerId: string) {
  return room.missingNumber !== null && room.guesses[playerId] === room.missingNumber;
}

export function sanitizeNigoichiRoomForPlayer(room: NigoichiRoom, playerId: string) {
  const isDebugHost = room.debugMode && playerId === room.hostId;
  const revealAll = room.phase === "result" || isDebugHost;
  const hands = revealAll ? room.hands : room.hands[playerId] ? { [playerId]: room.hands[playerId] } : {};
  const clues = room.phase === "clue" && !isDebugHost
    ? room.clues[playerId] ? { [playerId]: room.clues[playerId] } : {}
    : room.clues;
  const guesses = room.phase !== "result" && !isDebugHost
    ? Number.isInteger(room.guesses[playerId]) ? { [playerId]: room.guesses[playerId] } : {}
    : room.guesses;
  return {
    ...room,
    passphrase: room.passphrase ? "設定済み" : "",
    hands,
    clues,
    guesses,
    missingNumber: revealAll ? room.missingNumber : null,
    debugLog: isDebugHost ? room.debugLog : [],
  };
}

export function nigoichiSharePlayerLabel(
  players: Pick<NigoichiPlayer, "id" | "name" | "isDummy" | "shareNameAllowed">[],
  playerId: string,
) {
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) return "PLAYER?";
  const player = players[index];
  if (player.isDummy) return player.name;
  return player.shareNameAllowed === true ? player.name : `PLAYER${index + 1}`;
}

export function nigoichiShareText(room: Pick<NigoichiRoom, "players" | "words" | "hands" | "clues" | "guesses" | "missingNumber">) {
  const correct = room.players.filter((player) => nigoichiGuessIsCorrect(room, player.id)).length;
  const ownerByNumber = new Map<number, string>();
  for (const player of room.players) {
    const label = nigoichiSharePlayerLabel(room.players, player.id);
    for (const number of room.hands[player.id] ?? []) ownerByNumber.set(number, label);
  }
  const wordLines = room.words.map((word, index) => {
    const owner = index === room.missingNumber ? "余り" : ownerByNumber.get(index) ?? "不明";
    return `${index + 1}. ${word} — ${owner}`;
  });
  const clueLines = room.players.map((player) => {
    const label = nigoichiSharePlayerLabel(room.players, player.id);
    const hand = room.hands[player.id] ?? [];
    const pair = hand.map((number) => `${number + 1}.${room.words[number] ?? "不明"}`).join(" ＋ ");
    return `${label}：${pair} → ${room.clues[player.id] ?? "未入力"}`;
  });
  return [
    "ニゴイチで遊びました",
    `${room.players.length}人中${correct}人が余り番号を正解`,
    "",
    "言葉一覧",
    ...wordLines,
    "",
    "連想語",
    ...clueLines,
    "",
    "#GameFields",
  ].join("\n");
}
