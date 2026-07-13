import { normalizeCommonTimeLimit } from "@/lib/game-room-config";

export type KotobaSenpukuTheme = {
  id: string;
  title: string;
  guide: string;
};

export type KotobaSenpukuPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
  isDummy?: boolean;
};

export type KotobaSenpukuConfig = {
  roundsTotal: number;
  secretTimeLimitSeconds: number;
  turnTimeLimitSeconds: number;
  debugMode: boolean;
};

export type KotobaSenpukuRoundResult = {
  round: number;
  theme: KotobaSenpukuTheme;
  secrets: Record<string, string>;
  signals: Record<string, number>;
  survivalBonus: Record<string, number>;
  calledKana: string[];
};

export type KotobaSenpukuPhase = "lobby" | "secret" | "battle" | "result";

export type KotobaSenpukuRoom = KotobaSenpukuConfig & {
  code: string;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: KotobaSenpukuPhase;
  players: KotobaSenpukuPlayer[];
  round: number;
  theme: KotobaSenpukuTheme | null;
  secrets: Record<string, string>;
  submittedIds: string[];
  masks: Record<string, string>;
  calledKana: string[];
  exposedIds: string[];
  roundSignals: Record<string, number>;
  totalScores: Record<string, number>;
  activePlayerIndex: number;
  turnNumber: number;
  history: KotobaSenpukuRoundResult[];
  log: string[];
  phaseStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type KotobaSenpukuRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  roundsTotal: number;
  hasPassphrase: boolean;
  updatedAt: number;
};

export type KotobaSenpukuRoomAction =
  | { type: "join-room"; actorId: string; player: KotobaSenpukuPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "update-config"; actorId: string; config: Omit<KotobaSenpukuConfig, "debugMode"> }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "debug-add-player"; actorId: string }
  | { type: "start-game"; actorId: string }
  | { type: "submit-secret"; actorId: string; round: number; word: string }
  | { type: "scan-kana"; actorId: string; round: number; kana: string }
  | { type: "challenge-word"; actorId: string; round: number; targetId: string; guess: string }
  | { type: "debug-fill-secrets"; actorId: string; round: number }
  | { type: "debug-auto-turn"; actorId: string; round: number }
  | { type: "next-round"; actorId: string; round: number }
  | { type: "reset-game"; actorId: string };

export const defaultKotobaSenpukuConfig: KotobaSenpukuConfig = {
  roundsTotal: 3,
  secretTimeLimitSeconds: 0,
  turnTimeLimitSeconds: 0,
  debugMode: false,
};

export const kotobaSenpukuMaximumPlayers = 8;
export const kotobaSenpukuMaximumCalls = 18;

export const kotobaSenpukuKana = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を", "ん",
] as const;

export const kotobaSenpukuThemes: KotobaSenpukuTheme[] = [
  { id: "meal", title: "食卓にありそうなもの", guide: "料理、飲み物、食器など" },
  { id: "outing", title: "休みの日に行きたい場所", guide: "施設、自然、町の中など" },
  { id: "animal", title: "動物や空想の生き物", guide: "実在でも空想でもOK" },
  { id: "tool", title: "家や学校で使う道具", guide: "手に持てるものを中心に" },
  { id: "weather", title: "空や天気から連想するもの", guide: "現象、季節、身につける物など" },
  { id: "town", title: "町で見かけるもの", guide: "建物、乗り物、人の役割など" },
  { id: "hobby", title: "趣味や遊びに関係するもの", guide: "活動、道具、場所など" },
  { id: "gift", title: "もらったら少しうれしいもの", guide: "高価でなくてもOK" },
];

export const kotobaSenpukuDebugWords: Record<string, string[]> = {
  meal: ["おにぎり", "すーぷ", "さらだ", "ぷりん", "やきそば", "こっぷ", "みそしる", "たまご"],
  outing: ["こうえん", "としょかん", "みずうみ", "えきまえ", "ゆうえんち", "すなはま", "ぼくじょう", "てんぼうだい"],
  animal: ["きつね", "ぺんぎん", "かぶとむし", "どらごん", "はりねずみ", "くらげ", "ふくろう", "やぎ"],
  tool: ["えんぴつ", "はさみ", "じょうぎ", "すいとう", "でんたく", "ほうき", "かさ", "のーと"],
  weather: ["にじ", "かみなり", "こなゆき", "たいふう", "ゆうやけ", "こもれび", "ながぐつ", "つらら"],
  town: ["しんごう", "ぱんや", "しょうぼうしゃ", "こうさてん", "ほんや", "ふんすい", "びょういん", "たわー"],
  hobby: ["つり", "しょうぎ", "えいが", "ぬりえ", "さんぽ", "えんそう", "りょうり", "どくしょ"],
  gift: ["はなたば", "てがみ", "くっきー", "きーほるだー", "しゃしん", "まふらー", "こうちゃ", "しおり"],
};

export function normalizeKotobaSenpukuConfig(value: unknown): KotobaSenpukuConfig {
  const parsed = value && typeof value === "object" ? value as Partial<KotobaSenpukuConfig> : {};
  const rounds = typeof parsed.roundsTotal === "number" && Number.isFinite(parsed.roundsTotal)
    ? Math.floor(parsed.roundsTotal)
    : defaultKotobaSenpukuConfig.roundsTotal;
  return {
    roundsTotal: Math.max(1, Math.min(5, rounds)),
    secretTimeLimitSeconds: normalizeCommonTimeLimit(parsed.secretTimeLimitSeconds),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    debugMode: parsed.debugMode === true,
  };
}

export function normalizeKotobaSenpukuWord(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function isValidKotobaSenpukuWord(value: unknown) {
  const word = normalizeKotobaSenpukuWord(value);
  return (
    word.length >= 2 &&
    word.length <= 8 &&
    /^[ぁ-んー]+$/.test(word) &&
    /[ぁ-ん]/.test(word)
  );
}

export function kotobaSenpukuKanaKey(character: string) {
  const base = character.normalize("NFD").replace(/[\u3099\u309A]/g, "");
  const smallKana: Record<string, string> = {
    "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
    "っ": "つ", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ",
  };
  return smallKana[base] ?? base;
}

export function maskKotobaSenpukuWord(word: string, calledKana: string[], exposed = false) {
  const called = new Set(calledKana);
  return [...word].map((character) => exposed || character === "ー" || called.has(kotobaSenpukuKanaKey(character)) ? character : "●").join("");
}

export function pickKotobaSenpukuTheme(history: KotobaSenpukuRoundResult[]) {
  const used = new Set(history.map((result) => result.theme.id));
  const candidates = kotobaSenpukuThemes.filter((theme) => !used.has(theme.id));
  const pool = candidates.length ? candidates : kotobaSenpukuThemes;
  return pool[Math.floor(Math.random() * pool.length)] ?? kotobaSenpukuThemes[0];
}
