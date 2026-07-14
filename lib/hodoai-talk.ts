import type { GameDebugLogEntry } from "@/lib/game-debug-log";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";

export type HodoaiTheme = {
  id: string;
  title: string;
  lowLabel: string;
  highLabel: string;
};

export type HodoaiPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
  isDummy?: boolean;
  /** 外部共有文へ表示名を載せることを、入室時点で本人が許可していたか。 */
  shareNameAllowed?: boolean;
};

export type HodoaiCard = {
  id: string;
  ownerId: string;
  cardNumber: number;
};

export type HodoaiPhase = "lobby" | "clue" | "arrange" | "result";

export type HodoaiConfig = {
  roundsTotal: number;
  cardsPerPlayer: number;
  clueTimeLimitSeconds: number;
  arrangeTimeLimitSeconds: number;
  debugMode: boolean;
};

export type HodoaiClueRound = {
  round: number;
  theme: HodoaiTheme;
  clues: Record<string, string>;
};

export type HodoaiRoundResult = {
  round: number;
  theme: HodoaiTheme;
  inversions: number;
  points: number;
  cards: HodoaiCard[];
  clueRounds: HodoaiClueRound[];
  order: string[];
  values: Record<string, number>;
  clues: Record<string, string>;
};

export type HodoaiRoom = HodoaiConfig & {
  code: string;
  debugReplayEnabled: boolean;
  revision: number;
  hostId: string;
  sorterId: string;
  ownerId?: string;
  passphrase: string;
  phase: HodoaiPhase;
  players: HodoaiPlayer[];
  gameNumber: number;
  round: number;
  theme: HodoaiTheme | null;
  cards: HodoaiCard[];
  values: Record<string, number>;
  clues: Record<string, string>;
  clueHistory: HodoaiClueRound[];
  order: string[];
  totalPoints: number;
  history: HodoaiRoundResult[];
  debugLog: GameDebugLogEntry[];
  phaseStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type HodoaiRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  cardsPerPlayer: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type HodoaiRoomAction =
  | { type: "join-room"; actorId: string; player: HodoaiPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "update-config"; actorId: string; config: Omit<HodoaiConfig, "debugMode"> }
  | { type: "set-sorter"; actorId: string; sorterId: string }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "start-game"; actorId: string }
  | { type: "submit-clue"; actorId: string; round: number; cardId: string; text: string }
  | { type: "reorder"; actorId: string; round: number; order: string[] }
  | { type: "score-round"; actorId: string; round: number; force?: boolean }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "debug-fill-clues"; actorId: string; round: number }
  | { type: "debug-sort"; actorId: string; round: number }
  | { type: "debug-add-player"; actorId: string };

export const defaultHodoaiConfig: HodoaiConfig = {
  roundsTotal: 3,
  cardsPerPlayer: 1,
  clueTimeLimitSeconds: 0,
  arrangeTimeLimitSeconds: 0,
  debugMode: false,
};

// 0～120のカードは合計121枚。同期量と画面操作を守る参加者の安全上限は別途50人とする。
export const hodoaiTechnicalPlayerLimit = onlineRoomPlayerLimits.hodoai;

export function normalizeHodoaiConfig(value: unknown): HodoaiConfig {
  const parsed = value && typeof value === "object" ? value as Partial<HodoaiConfig> : {};
  const rounds = typeof parsed.roundsTotal === "number" ? Math.floor(parsed.roundsTotal) : 3;
  const cards = typeof parsed.cardsPerPlayer === "number" ? Math.floor(parsed.cardsPerPlayer) : 1;
  const normalizeTime = (seconds: unknown) => {
    const number = typeof seconds === "number" && Number.isFinite(seconds) ? Math.floor(seconds) : 0;
    return Math.max(0, Math.min(3600, number));
  };
  return {
    roundsTotal: Math.max(1, Math.min(4, rounds)),
    cardsPerPlayer: Math.max(1, Math.min(5, cards)),
    clueTimeLimitSeconds: normalizeTime(parsed.clueTimeLimitSeconds),
    arrangeTimeLimitSeconds: normalizeTime(parsed.arrangeTimeLimitSeconds),
    debugMode: parsed.debugMode === true,
  };
}

export const hodoaiThemes: HodoaiTheme[] = [
  { id: "snack", title: "休憩中にうれしい食べ物", lowLabel: "少しうれしい", highLabel: "最高にうれしい" },
  { id: "weekend", title: "休日にやってみたいこと", lowLabel: "気が向けば", highLabel: "今すぐやりたい" },
  { id: "gift", title: "もらうとうれしい小さな贈り物", lowLabel: "ほんのりうれしい", highLabel: "かなりうれしい" },
  { id: "animal", title: "一日だけなってみたい生き物", lowLabel: "遠慮したい", highLabel: "ぜひなりたい" },
  { id: "superpower", title: "日常で使いたい不思議な力", lowLabel: "使い道が少ない", highLabel: "毎日使いたい" },
  { id: "room", title: "部屋に追加したいもの", lowLabel: "なくても平気", highLabel: "絶対ほしい" },
  { id: "trip", title: "ふらっと出かけたい場所", lowLabel: "近くなら行く", highLabel: "予定を空けて行く" },
  { id: "weather", title: "散歩したくなる天気", lowLabel: "家にいたい", highLabel: "ずっと歩きたい" },
  { id: "sound", title: "落ち着く音", lowLabel: "少し気になる", highLabel: "とても落ち着く" },
  { id: "skill", title: "一瞬で身につけたい技能", lowLabel: "機会があれば", highLabel: "心からほしい" },
  { id: "festival", title: "町のお祭りにほしい催し", lowLabel: "素通りする", highLabel: "目当てに出かける" },
  { id: "breakfast", title: "朝に食べたいもの", lowLabel: "今日は違う", highLabel: "毎朝でもいい" },
  { id: "vehicle", title: "乗って旅したい乗り物", lowLabel: "少し不安", highLabel: "わくわくする" },
  { id: "helper", title: "家事を助けてくれる道具", lowLabel: "出番が少ない", highLabel: "手放せない" },
  { id: "story", title: "物語の舞台にしたい場所", lowLabel: "想像しにくい", highLabel: "物語が広がる" },
  { id: "cafe", title: "カフェにあるとうれしいもの", lowLabel: "なくてもよい", highLabel: "通いたくなる" },
  { id: "memory", title: "写真に残したい瞬間", lowLabel: "目で覚えておく", highLabel: "必ず撮りたい" },
  { id: "challenge", title: "みんなで挑戦したいこと", lowLabel: "見守りたい", highLabel: "参加したい" },
];

export function shuffleHodoai<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function pickHodoaiTheme(history: Array<{ theme: HodoaiTheme }>) {
  const used = new Set(history.map((result) => result.theme.id));
  const unused = hodoaiThemes.filter((theme) => !used.has(theme.id));
  const candidates = unused.length > 0 ? unused : hodoaiThemes;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? hodoaiThemes[0];
}

export function dealHodoaiCards(players: HodoaiPlayer[], cardsPerPlayer: number) {
  const cards = players.flatMap((player) => Array.from({ length: cardsPerPlayer }, (_, index) => ({
    id: `${player.id}:card-${index + 1}`,
    ownerId: player.id,
    cardNumber: index + 1,
  })));
  if (cards.length > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
  const dealtValues = shuffleHodoai(Array.from({ length: 121 }, (_, index) => index)).slice(0, cards.length);
  return { cards, values: Object.fromEntries(cards.map((card, index) => [card.id, dealtValues[index]])) };
}

export function countHodoaiInversions(order: string[], values: Record<string, number>) {
  let inversions = 0;
  for (let left = 0; left < order.length; left += 1) {
    for (let right = left + 1; right < order.length; right += 1) {
      if ((values[order[left]] ?? 0) > (values[order[right]] ?? 0)) inversions += 1;
    }
  }
  return inversions;
}

export function pointsForInversions(inversions: number) {
  if (inversions === 0) return 3;
  if (inversions === 1) return 2;
  if (inversions <= 3) return 1;
  return 0;
}

export function hodoaiClueRoundDestination(round: number, roundsTotal: number): "clue" | "arrange" {
  return round < roundsTotal ? "clue" : "arrange";
}

export function canReorderHodoaiCards(room: Pick<HodoaiRoom, "phase" | "sorterId">, actorId: string) {
  return room.phase === "arrange" && room.sorterId === actorId;
}

export function canAssignHodoaiSorter(
  room: Pick<HodoaiRoom, "phase" | "hostId" | "players">,
  actorId: string,
  sorterId: string,
) {
  return actorId === room.hostId
    && (room.phase === "lobby" || room.phase === "arrange")
    && room.players.some((player) => player.id === sorterId);
}

export function hodoaiFinalMessage(points: number, maxPoints: number) {
  const ratio = maxPoints > 0 ? points / maxPoints : 0;
  if (ratio >= 0.85) return "息ぴったり！ 言葉の距離感がよくそろいました。";
  if (ratio >= 0.5) return "いい塩梅！ 次は満点が狙えそうです。";
  if (ratio >= 0.2) return "伸びしろ十分。意外な感じ方も楽しめました。";
  return "大発見の連続！ みんなの違いがよく見えました。";
}

export function hodoaiSharePlayerLabel(
  players: Pick<HodoaiPlayer, "id" | "name" | "shareNameAllowed">[],
  ownerId: string,
) {
  const index = players.findIndex((player) => player.id === ownerId);
  if (index < 0) return "PLAYER?";
  const player = players[index];
  return player.shareNameAllowed === true ? player.name : `PLAYER${index + 1}`;
}

export function hodoaiGameShareText(room: Pick<HodoaiRoom, "totalPoints" | "history" | "players">) {
  const result = room.history.at(-1);
  const rounds = result?.clueRounds.map((clueRound) => `ことば${clueRound.round}「${clueRound.theme.title}」`) ?? [];
  const finalOrder = result?.order.slice(0, 20).flatMap((id, index) => {
    const card = result.cards.find((item) => item.id === id);
    const value = result.values[id];
    if (!card || typeof value !== "number") return [];
    const expressions = result.clueRounds
      .map((clueRound) => clueRound.clues[card.id])
      .filter((clue): clue is string => Boolean(clue))
      .join(" / ");
    const owner = hodoaiSharePlayerLabel(room.players, card.ownerId);
    return [`${index + 1}. ${value}｜${expressions || "ことばなし"}｜${owner}・カード${card.cardNumber}`];
  }) ?? [];
  if (result && result.order.length > finalOrder.length) finalOrder.push(`…ほか${result.order.length - finalOrder.length}枚`);
  return [
    "ワードスケール プレイログ",
    `チーム得点 ${room.totalPoints}/3点`,
    ...rounds,
    result ? `最終並び：全${result.cards.length}枚・並び違い${result.inversions}組` : "",
    ...finalOrder,
    "#GameFields",
  ].filter(Boolean).join("\n");
}

export const clueHasNumber = (clue: string) => /[0-9０-９〇零一二三四五六七八九十百]/.test(clue);
