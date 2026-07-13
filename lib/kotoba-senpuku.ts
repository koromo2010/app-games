import { normalizeCommonTimeLimit } from "./game-room-config.ts";

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
  continuousScan: boolean;
  allowWordGuess: boolean;
};

export type KotobaSenpukuRoundResult = {
  round: number;
  theme: KotobaSenpukuTheme;
  secrets: Record<string, string>;
  signals: Record<string, number>;
  survivalBonus: Record<string, number>;
  calledKana: string[];
  eliminatedIds: string[];
  winnerId: string | null;
  winnerIds: string[];
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
  gameNumber: number;
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
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string };

export const defaultKotobaSenpukuConfig: KotobaSenpukuConfig = {
  roundsTotal: 1,
  secretTimeLimitSeconds: 0,
  turnTimeLimitSeconds: 0,
  debugMode: false,
  continuousScan: true,
  allowWordGuess: true,
};


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
  "わ", "を", "ん", "ー",
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
  { id: "school", title: "学校にありそうなもの", guide: "教室、校庭、授業、行事など" },
  { id: "office", title: "仕事場にありそうなもの", guide: "道具、設備、人の役割など" },
  { id: "kitchen", title: "台所にありそうなもの", guide: "食材、調理器具、家電など" },
  { id: "bath", title: "お風呂や洗面所にあるもの", guide: "道具、日用品、設備など" },
  { id: "travel", title: "旅行へ持っていきたいもの", guide: "荷物、道具、服など" },
  { id: "station", title: "駅で見かけるもの", guide: "設備、乗り物、人など" },
  { id: "festival", title: "お祭りから連想するもの", guide: "食べ物、道具、催しなど" },
  { id: "sports", title: "スポーツに関係するもの", guide: "競技、道具、場所、人など" },
  { id: "music", title: "音楽に関係するもの", guide: "楽器、演奏、音など" },
  { id: "movie", title: "映画館で連想するもの", guide: "作品、設備、食べ物など" },
  { id: "book", title: "本や読書から連想するもの", guide: "種類、場所、道具など" },
  { id: "game", title: "ゲームや遊びに使うもの", guide: "道具、役割、場所など" },
  { id: "sea", title: "海から連想するもの", guide: "生き物、景色、乗り物など" },
  { id: "mountain", title: "山から連想するもの", guide: "自然、生き物、道具など" },
  { id: "space", title: "宇宙から連想するもの", guide: "天体、乗り物、現象など" },
  { id: "night", title: "夜に見かけるもの", guide: "空、町、家の中など" },
  { id: "summer", title: "夏から連想するもの", guide: "天気、食べ物、行事など" },
  { id: "winter", title: "冬から連想するもの", guide: "天気、服、食べ物など" },
  { id: "spring", title: "春から連想するもの", guide: "植物、行事、景色など" },
  { id: "autumn", title: "秋から連想するもの", guide: "食べ物、行事、景色など" },
  { id: "red", title: "赤いもの", guide: "自然、食べ物、道具など何でも" },
  { id: "round", title: "丸いもの", guide: "完全な円でなくてもOK" },
  { id: "soft", title: "やわらかいもの", guide: "触感や印象がやわらかいもの" },
  { id: "fast", title: "速いもの", guide: "生き物、乗り物、現象など" },
  { id: "small", title: "小さいもの", guide: "身近なものから想像上のものまで" },
  { id: "sound", title: "音が出るもの", guide: "道具、生き物、自然現象など" },
  { id: "smell", title: "においが印象的なもの", guide: "食べ物、植物、場所など" },
  { id: "cold", title: "冷たいもの", guide: "食べ物、場所、自然など" },
  { id: "warm", title: "あたたかいもの", guide: "食べ物、道具、場所など" },
  { id: "rain", title: "雨の日に関係するもの", guide: "道具、景色、過ごし方など" },
  { id: "celebration", title: "お祝いに関係するもの", guide: "食べ物、飾り、贈り物など" },
  { id: "future", title: "未来から連想するもの", guide: "技術、暮らし、乗り物など" },
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
  return {
    roundsTotal: 1,
    secretTimeLimitSeconds: normalizeCommonTimeLimit(parsed.secretTimeLimitSeconds),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    debugMode: parsed.debugMode === true,
    continuousScan: parsed.continuousScan !== false,
    allowWordGuess: parsed.allowWordGuess !== false,
  };
}

export function normalizeKotobaSenpukuWord(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function isValidKotobaSenpukuWord(value: unknown) {
  const word = normalizeKotobaSenpukuWord(value);
  return (
    word.length > 0 &&
    /^[ぁ-んー]+$/.test(word) &&
    /[ぁ-ん]/.test(word)
  );
}

export function minimumKotobaSenpukuWordLength(playerCount: number) {
  return playerCount === 2 ? 2 : 1;
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
  return [...word].filter((character) => exposed || called.has(kotobaSenpukuKanaKey(character))).join("");
}

export function isFullyRevealedKotobaSenpukuWord(word: string, calledKana: string[]) {
  const called = new Set(calledKana);
  return Boolean(word) && [...word].every((character) => called.has(kotobaSenpukuKanaKey(character)));
}

export function nextKotobaSenpukuSurvivorIndex(playerIds: string[], eliminatedIds: string[], currentIndex: number) {
  for (let offset = 1; offset <= playerIds.length; offset += 1) {
    const candidateIndex = (currentIndex + offset) % playerIds.length;
    if (!eliminatedIds.includes(playerIds[candidateIndex] ?? "")) return candidateIndex;
  }
  return currentIndex;
}

export function resolveKotobaSenpukuWinnerIds(
  playerIds: string[],
  eliminatedIds: string[],
  simultaneousEliminatedIds: string[],
  secrets: Record<string, string>,
) {
  const survivors = playerIds.filter((id) => !eliminatedIds.includes(id));
  if (survivors.length === 1) return survivors;
  if (survivors.length > 1 || simultaneousEliminatedIds.length === 0) return [];
  const shortestLength = Math.min(...simultaneousEliminatedIds.map((id) => [...(secrets[id] ?? "")].length));
  return simultaneousEliminatedIds.filter((id) => [...(secrets[id] ?? "")].length === shortestLength);
}

export function pickKotobaSenpukuTheme(history: KotobaSenpukuRoundResult[]) {
  const used = new Set(history.map((result) => result.theme.id));
  const candidates = kotobaSenpukuThemes.filter((theme) => !used.has(theme.id));
  const pool = candidates.length ? candidates : kotobaSenpukuThemes;
  return pool[Math.floor(Math.random() * pool.length)] ?? kotobaSenpukuThemes[0];
}
