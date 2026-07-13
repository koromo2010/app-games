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
};

export type HodoaiPhase = "lobby" | "clue" | "arrange" | "result";

export type HodoaiConfig = {
  roundsTotal: number;
  clueTimeLimitSeconds: number;
  arrangeTimeLimitSeconds: number;
  debugMode: boolean;
};

export type HodoaiRoundResult = {
  round: number;
  theme: HodoaiTheme;
  inversions: number;
  points: number;
  order: string[];
  values: Record<string, number>;
  clues: Record<string, string>;
};

export type HodoaiRoom = HodoaiConfig & {
  code: string;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: HodoaiPhase;
  players: HodoaiPlayer[];
  gameNumber: number;
  round: number;
  theme: HodoaiTheme | null;
  values: Record<string, number>;
  clues: Record<string, string>;
  order: string[];
  totalPoints: number;
  history: HodoaiRoundResult[];
  phaseStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type HodoaiRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type HodoaiRoomAction =
  | { type: "join-room"; actorId: string; player: HodoaiPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "update-config"; actorId: string; config: Omit<HodoaiConfig, "debugMode"> }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "start-game"; actorId: string }
  | { type: "submit-clue"; actorId: string; round: number; text: string }
  | { type: "reorder"; actorId: string; round: number; order: string[] }
  | { type: "score-round"; actorId: string; round: number; force?: boolean }
  | { type: "next-round"; actorId: string; round: number }
  | { type: "reset-game"; actorId: string }
  | { type: "debug-fill-clues"; actorId: string; round: number }
  | { type: "debug-sort"; actorId: string; round: number }
  | { type: "debug-add-player"; actorId: string };

export const defaultHodoaiConfig: HodoaiConfig = {
  roundsTotal: 3,
  clueTimeLimitSeconds: 0,
  arrangeTimeLimitSeconds: 0,
  debugMode: false,
};

// 0～120の重複しない目盛りは最大121人分あるが、同期量と画面操作を守る安全上限は50人とする。
export const hodoaiTechnicalPlayerLimit = 50;

export function normalizeHodoaiConfig(value: unknown): HodoaiConfig {
  const parsed = value && typeof value === "object" ? value as Partial<HodoaiConfig> : {};
  const rounds = typeof parsed.roundsTotal === "number" ? Math.floor(parsed.roundsTotal) : 3;
  const normalizeTime = (seconds: unknown) => {
    const number = typeof seconds === "number" && Number.isFinite(seconds) ? Math.floor(seconds) : 0;
    return Math.max(0, Math.min(3600, number));
  };
  return {
    roundsTotal: Math.max(1, Math.min(4, rounds)),
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

export function pickHodoaiTheme(history: HodoaiRoundResult[]) {
  const used = new Set(history.map((result) => result.theme.id));
  const unused = hodoaiThemes.filter((theme) => !used.has(theme.id));
  const candidates = unused.length > 0 ? unused : hodoaiThemes;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? hodoaiThemes[0];
}

export function dealHodoaiValues(players: HodoaiPlayer[]) {
  const values = shuffleHodoai(Array.from({ length: 121 }, (_, index) => index)).slice(0, players.length);
  return Object.fromEntries(players.map((player, index) => [player.id, values[index]]));
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

export function hodoaiFinalMessage(points: number, maxPoints: number) {
  const ratio = maxPoints > 0 ? points / maxPoints : 0;
  if (ratio >= 0.85) return "息ぴったり！ 言葉の距離感がよくそろいました。";
  if (ratio >= 0.5) return "いい塩梅！ 次は満点が狙えそうです。";
  if (ratio >= 0.2) return "伸びしろ十分。意外な感じ方も楽しめました。";
  return "大発見の連続！ みんなの違いがよく見えました。";
}

export const clueHasNumber = (clue: string) => /[0-9０-９]/.test(clue);
