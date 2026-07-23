import type { GameDebugLogEntry } from "@/lib/game-debug-log";
import type { RoomLobbyReturnAction, RoomLobbyReturnState } from "./room-lobby-return.ts";
import { projectOrderedGameResult } from "./game-result-presentation.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";
import type { PlayerTimeoutFields } from "./player-timeout-policy.ts";
import { runtimeHyperparameterNumber } from "./runtime-hyperparameters-core.ts";
import type { AppLocale } from "./app-locale.ts";

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

export type HodoaiRoom = HodoaiConfig & PlayerTimeoutFields & {
  code: string;
  contentLocale?: AppLocale;
  debugReplayEnabled: boolean;
  revision: number;
  hostId: string;
  sorterId: string;
  ownerId?: string;
  passphrase: string;
  phase: HodoaiPhase;
  players: HodoaiPlayer[];
  lobbyReturn?: RoomLobbyReturnState;
  gameNumber: number;
  gameStartedAt?: number | null;
  round: number;
  theme: HodoaiTheme | null;
  cards: HodoaiCard[];
  values: Record<string, number>;
  clues: Record<string, string>;
  clueHistory: HodoaiClueRound[];
  order: string[];
  totalPoints: number;
  scorePerfect: number;
  scoreOne: number;
  scoreFew: number;
  scoreFewMax: number;
  history: HodoaiRoundResult[];
  debugLog: GameDebugLogEntry[];
  phaseStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type HodoaiRoomChoice = {
  code: string;
  contentLocale?: AppLocale;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  cardsPerPlayer: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type HodoaiRoomAction = RoomLobbyReturnAction
  | { type: "join-room"; actorId: string; player: HodoaiPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "recover-player"; actorId: string }
  | { type: "update-config"; actorId: string; config: Omit<HodoaiConfig, "debugMode"> }
  | { type: "set-sorter"; actorId: string; sorterId: string }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "start-game"; actorId: string }
  | { type: "submit-clue"; actorId: string; round: number; cardId: string; text: string }
  | { type: "submit-clues"; actorId: string; round: number; clues: Record<string, string> }
  | { type: "submit-timeout-clues"; actorId: string; round: number; clues: Record<string, string> }
  | { type: "reorder"; actorId: string; round: number; order: string[] }
  | { type: "score-round"; actorId: string; round: number; force?: boolean }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "debug-fill-clues"; actorId: string; round: number }
  | { type: "debug-sort"; actorId: string; round: number }
  | { type: "debug-add-player"; actorId: string }
  | { type: "debug-remove-player"; actorId: string; targetPlayerId: string };

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
  { id: "movie", title: "映画館で観たい物語", lowLabel: "配信を待つ", highLabel: "初日に観たい" },
  { id: "dessert", title: "食後に食べたい甘いもの", lowLabel: "ひと口で十分", highLabel: "別腹で食べたい" },
  { id: "museum", title: "博物館でじっくり見たい展示", lowLabel: "通り過ぎる", highLabel: "時間を忘れて見る" },
  { id: "party", title: "パーティーにあると盛り上がるもの", lowLabel: "なくても平気", highLabel: "主役になる" },
  { id: "pet", title: "一緒に暮らしてみたい生き物", lowLabel: "眺めるだけでよい", highLabel: "家族に迎えたい" },
  { id: "season", title: "その季節に楽しみなこと", lowLabel: "少し感じたい", highLabel: "毎年待ち遠しい" },
  { id: "school", title: "学校にあったら楽しい授業", lowLabel: "見学でよい", highLabel: "毎週受けたい" },
  { id: "office", title: "仕事場にあるとうれしい設備", lowLabel: "たまに使う", highLabel: "毎日欠かせない" },
  { id: "adventure", title: "冒険に持っていきたいもの", lowLabel: "置いていく", highLabel: "最優先で持つ" },
  { id: "relax", title: "疲れた日にしたいこと", lowLabel: "余裕があれば", highLabel: "真っ先にしたい" },
  { id: "town", title: "住む町の近くにほしい場所", lowLabel: "遠くてもよい", highLabel: "徒歩圏内にほしい" },
  { id: "souvenir", title: "旅先から持ち帰りたいお土産", lowLabel: "写真だけでよい", highLabel: "必ず買いたい" },
  { id: "game", title: "みんなで遊びたいゲーム", lowLabel: "一度で満足", highLabel: "何度も遊びたい" },
  { id: "garden", title: "庭やベランダで育てたいもの", lowLabel: "見るだけでよい", highLabel: "毎日世話したい" },
  { id: "concert", title: "生で聴いてみたい音", lowLabel: "録音で十分", highLabel: "会場で浴びたい" },
  { id: "night", title: "眠る前にしたいこと", lowLabel: "しなくてもよい", highLabel: "習慣にしたい" },
  { id: "discovery", title: "発見したらわくわくするもの", lowLabel: "少し気になる", highLabel: "大ニュースになる" },
  { id: "future", title: "未来に実現してほしいもの", lowLabel: "あれば便利", highLabel: "ぜひ実現してほしい" },
  { id: "collection", title: "集めてみたいもの", lowLabel: "ひとつで満足", highLabel: "ずっと集めたい" },
  { id: "celebration", title: "お祝いの日にしたいこと", lowLabel: "普段どおりでよい", highLabel: "盛大に楽しみたい" },
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

export function pickRandomHodoaiSorter(players: HodoaiPlayer[], random = Math.random) {
  if (players.length === 0) throw new Error("HODOAI_NOT_ENOUGH_PLAYERS");
  return players[Math.min(players.length - 1, Math.floor(random() * players.length))]?.id ?? players[0].id;
}

export function canViewHodoaiCardValue(card: Pick<HodoaiCard, "ownerId">, viewerId: string, revealAll = false) {
  return revealAll || card.ownerId === viewerId;
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

export type HodoaiScoring = { scorePerfect: number; scoreOne: number; scoreFew: number; scoreFewMax: number };
export const defaultHodoaiScoring = { scorePerfect: 3, scoreOne: 2, scoreFew: 1, scoreFewMax: 3 } as const satisfies HodoaiScoring;

export function hodoaiRuntimeScoring() {
  return {
    scorePerfect: runtimeHyperparameterNumber("scale-score-perfect", defaultHodoaiScoring.scorePerfect),
    scoreOne: runtimeHyperparameterNumber("scale-score-one", defaultHodoaiScoring.scoreOne),
    scoreFew: runtimeHyperparameterNumber("scale-score-few", defaultHodoaiScoring.scoreFew),
    scoreFewMax: runtimeHyperparameterNumber("scale-score-few-max", defaultHodoaiScoring.scoreFewMax),
  };
}

export function pointsForInversions(inversions: number, scoring: Partial<HodoaiScoring> = defaultHodoaiScoring) {
  if (inversions === 0) return scoring.scorePerfect ?? defaultHodoaiScoring.scorePerfect;
  if (inversions === 1) return scoring.scoreOne ?? defaultHodoaiScoring.scoreOne;
  if (inversions <= (scoring.scoreFewMax ?? defaultHodoaiScoring.scoreFewMax)) return scoring.scoreFew ?? defaultHodoaiScoring.scoreFew;
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

export type HodoaiResultRow = {
  id: string;
  rank: number;
  value: number;
  cardNumber: number;
  playerName: string;
  sharePlayerName: string;
  expressions: string[];
};

export function hodoaiResultPresentation(
  result: HodoaiRoundResult,
  players: Pick<HodoaiPlayer, "id" | "name" | "shareNameAllowed">[],
) {
  return projectOrderedGameResult({
    storedOrder: result.order,
    displayOrder: "descending",
    rowForId: (id, index): HodoaiResultRow | null => {
      const card = result.cards.find((item) => item.id === id);
      const value = result.values[id];
      if (!card || typeof value !== "number") return null;
      return {
        id,
        rank: index + 1,
        value,
        cardNumber: card.cardNumber,
        playerName: players.find((player) => player.id === card.ownerId)?.name ?? "Unknown",
        sharePlayerName: hodoaiSharePlayerLabel(players, card.ownerId),
        expressions: result.clueRounds.map((clueRound) => clueRound.clues[id]).filter((clue): clue is string => Boolean(clue)),
      };
    },
  });
}

export function hodoaiGameShareText(room: Pick<HodoaiRoom, "totalPoints" | "history" | "players">) {
  const result = room.history.at(-1);
  const rounds = result?.clueRounds.map((clueRound) => `ことば${clueRound.round}「${clueRound.theme.title}」`) ?? [];
  const presentation = result ? hodoaiResultPresentation(result, room.players) : null;
  const finalOrder = presentation?.rows.slice(0, 20).map((row) =>
    `${row.rank}. ${row.value}｜${row.expressions.join(" / ") || "ことばなし"}｜${row.sharePlayerName}・カード${row.cardNumber}`
  ) ?? [];
  if (presentation && presentation.rows.length > finalOrder.length) finalOrder.push(`…ほか${presentation.rows.length - finalOrder.length}枚`);
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

export function normalizeHodoaiClue(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function isValidHodoaiClue(value: string) {
  const clue = normalizeHodoaiClue(value);
  return clue.length > 0 && !clueHasNumber(clue);
}
