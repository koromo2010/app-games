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
export type NigoichiWordDifficulty = "easy" | "normal" | "hard";
export type NigoichiHand = readonly number[];

export type NigoichiAssociationGroup = {
  id: string;
  clue: string;
  cardIds: number[];
};

export const nigoichiMinimumPlayers = 2;
export const nigoichiMaximumAssociationWords = 5;
export const nigoichiMaximumTotalCards = 21;
export const nigoichiPlayerLimit = onlineRoomPlayerLimits.nigoichi;
export const nigoichiWordDifficultyLabels: Record<NigoichiWordDifficulty, string> = {
  easy: "かんたん",
  normal: "普通",
  hard: "難しい",
};

export function nigoichiConfigBounds(playerCount: number, associationWordCount: number) {
  const effectivePlayerCount = Math.max(nigoichiMinimumPlayers, Math.floor(playerCount));
  const minCardsPerPlayer = Math.max(1, Math.floor(associationWordCount)) * 2;
  const maxCardsPerPlayer = Math.floor((nigoichiMaximumTotalCards - 1) / effectivePlayerCount);
  return { minCardsPerPlayer, maxCardsPerPlayer, isFeasible: minCardsPerPlayer <= maxCardsPerPlayer };
}

export function nigoichiMaximumAssociationWordsForPlayers(playerCount: number) {
  const maxCardsPerPlayer = nigoichiConfigBounds(playerCount, 1).maxCardsPerPlayer;
  return Math.max(1, Math.min(nigoichiMaximumAssociationWords, Math.floor(maxCardsPerPlayer / 2)));
}

export function correctNigoichiConfig(playerCount: number, cardsPerPlayer: number, associationWordCount: number) {
  const correctedAssociationWordCount = Math.min(
    nigoichiMaximumAssociationWordsForPlayers(playerCount),
    Math.max(1, Number.isInteger(associationWordCount) ? associationWordCount : 1),
  );
  const bounds = nigoichiConfigBounds(playerCount, correctedAssociationWordCount);
  const correctedCardsPerPlayer = Math.min(
    bounds.maxCardsPerPlayer,
    Math.max(bounds.minCardsPerPlayer, Number.isInteger(cardsPerPlayer) ? cardsPerPlayer : 2),
  );
  return {
    cardsPerPlayer: correctedCardsPerPlayer,
    associationWordCount: correctedAssociationWordCount,
    totalCards: Math.max(nigoichiMinimumPlayers, Math.floor(playerCount)) * correctedCardsPerPlayer + 1,
  };
}

export function isValidNigoichiConfig(playerCount: number, cardsPerPlayer: number, associationWordCount: number) {
  const totalCards = playerCount * cardsPerPlayer + 1;
  return Number.isInteger(playerCount)
    && playerCount >= nigoichiMinimumPlayers
    && Number.isInteger(associationWordCount)
    && associationWordCount >= 1
    && associationWordCount <= nigoichiMaximumAssociationWords
    && Number.isInteger(cardsPerPlayer)
    && cardsPerPlayer >= associationWordCount * 2
    && totalCards <= nigoichiMaximumTotalCards;
}

export type NigoichiRoom = {
  code: string;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: NigoichiPhase;
  players: NigoichiPlayer[];
  gameNumber: number;
  cardsPerPlayer: number;
  associationWordCount: number;
  wordDifficulty: NigoichiWordDifficulty;
  debugMode: boolean;
  debugReplayEnabled: boolean;
  words: string[];
  hands: Record<string, NigoichiHand>;
  associations: Record<string, NigoichiAssociationGroup[]>;
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
  cardsPerPlayer: number;
  associationWordCount: number;
  wordDifficulty: NigoichiWordDifficulty;
  updatedAt: number;
};

export type NigoichiRoomAction =
  | { type: "join-room"; actorId: string; player: NigoichiPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "set-config"; actorId: string; cardsPerPlayer: number; associationWordCount: number; wordDifficulty: NigoichiWordDifficulty }
  | { type: "start-game"; actorId: string }
  | { type: "submit-associations"; actorId: string; playerId?: string; groups: NigoichiAssociationGroup[] }
  | { type: "submit-guess"; actorId: string; playerId?: string; number: number }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "debug-add-player"; actorId: string }
  | { type: "debug-fill-associations"; actorId: string }
  | { type: "debug-fill-guesses"; actorId: string };

export function shuffleNigoichi<T>(items: readonly T[], random = Math.random) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function dealNigoichiRound(
  players: Pick<NigoichiPlayer, "id">[],
  wordPool: readonly string[],
  cardsPerPlayer = 2,
  random = Math.random,
) {
  const wordCount = players.length * cardsPerPlayer + 1;
  const words = shuffleNigoichi([...new Set(wordPool.map((word) => word.trim()).filter(Boolean))], random).slice(0, wordCount);
  if (words.length < wordCount) throw new Error("NIGOICHI_WORDS_UNAVAILABLE");
  const missingNumber = Math.floor(random() * wordCount);
  const dealtNumbers = shuffleNigoichi(
    Array.from({ length: wordCount }, (_, index) => index).filter((index) => index !== missingNumber),
    random,
  );
  const hands = Object.fromEntries(players.map((player, index) => [
    player.id,
    dealtNumbers.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer),
  ]));
  return { words, hands, missingNumber };
}

export function areValidNigoichiAssociationGroups(
  hand: readonly number[],
  groups: readonly NigoichiAssociationGroup[],
  associationWordCount: number,
) {
  if (groups.length !== associationWordCount) return false;
  const handSet = new Set(hand);
  const used = new Set<number>();
  for (const group of groups) {
    if (!group.id || !group.clue.trim() || group.cardIds.length < 2 || new Set(group.cardIds).size !== group.cardIds.length) return false;
    for (const cardId of group.cardIds) {
      if (!Number.isInteger(cardId) || !handSet.has(cardId) || used.has(cardId)) return false;
      used.add(cardId);
    }
  }
  return used.size === hand.length;
}

export function allNigoichiAssociationsSubmitted(room: Pick<NigoichiRoom, "players" | "associations">) {
  return room.players.every((player) => (room.associations[player.id]?.length ?? 0) > 0);
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
  const associations = revealAll
    ? room.associations
    : room.phase === "clue"
      ? room.associations[playerId] ? { [playerId]: room.associations[playerId] } : {}
      : Object.fromEntries(Object.entries(room.associations).map(([ownerId, groups]) => [ownerId, groups.map((group) => ({ ...group, cardIds: [] }))]));
  const guesses = room.phase !== "result" && !isDebugHost
    ? Number.isInteger(room.guesses[playerId]) ? { [playerId]: room.guesses[playerId] } : {}
    : room.guesses;
  return {
    ...room,
    passphrase: room.passphrase ? "設定済み" : "",
    hands,
    associations,
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

export function nigoichiShareText(room: Pick<NigoichiRoom, "players" | "cardsPerPlayer" | "associationWordCount" | "wordDifficulty" | "words" | "hands" | "associations" | "guesses" | "missingNumber">) {
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
  const associationLines = room.players.flatMap((player) => {
    const label = nigoichiSharePlayerLabel(room.players, player.id);
    return (room.associations[player.id] ?? []).map((group, index) => {
      const cards = group.cardIds.map((number) => `${number + 1}.${room.words[number] ?? "不明"}`).join(" ＋ ");
      return `${label} ${index + 1}：${cards} → ${group.clue}`;
    });
  });
  return [
    "ワードアウトで遊びました",
    `${room.players.length}人中${correct}人が余り番号を正解`,
    `A=${room.cardsPerPlayer}枚・M=${room.associationWordCount}語・B=${room.words.length}枚・難易度：${nigoichiWordDifficultyLabels[room.wordDifficulty]}`,
    "",
    "言葉一覧",
    ...wordLines,
    "",
    "連想グループ",
    ...associationLines,
    "",
    "#GameFields",
  ].join("\n");
}
