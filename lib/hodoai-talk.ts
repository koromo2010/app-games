export type HodoaiTheme = {
  id: string;
  title: string;
  lowLabel: string;
  highLabel: string;
};

export type HodoaiPlayer = {
  id: string;
  name: string;
  value: number;
  clue: string;
};

export type HodoaiPhase = "clue" | "arrange" | "result" | "finished";

export type HodoaiRoundResult = {
  round: number;
  theme: HodoaiTheme;
  inversions: number;
  points: number;
};

export type HodoaiGameState = {
  round: number;
  phase: HodoaiPhase;
  theme: HodoaiTheme;
  players: HodoaiPlayer[];
  cluePlayerIndex: number;
  order: string[];
  totalPoints: number;
  history: HodoaiRoundResult[];
};

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

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createHodoaiRound(names: string[], round = 1, totalPoints = 0, history: HodoaiRoundResult[] = []): HodoaiGameState {
  const previousThemeId = history.at(-1)?.theme.id;
  const candidates = hodoaiThemes.filter((theme) => theme.id !== previousThemeId);
  const theme = candidates[Math.floor(Math.random() * candidates.length)] ?? hodoaiThemes[0];
  const values = shuffle(Array.from({ length: 121 }, (_, index) => index)).slice(0, names.length);
  const players = names.map((name, index) => ({ id: `p-${round}-${index}`, name, value: values[index], clue: "" }));
  return {
    round,
    phase: "clue",
    theme,
    players,
    cluePlayerIndex: 0,
    order: shuffle(players.map((player) => player.id)),
    totalPoints,
    history,
  };
}

export function countHodoaiInversions(state: HodoaiGameState) {
  const values = state.order.map((id) => state.players.find((player) => player.id === id)?.value ?? 0);
  let inversions = 0;
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (values[left] > values[right]) inversions += 1;
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

export function hodoaiFinalMessage(points: number) {
  if (points >= 8) return "息ぴったり！ 言葉の距離感がよくそろいました。";
  if (points >= 5) return "いい塩梅！ 次は満点が狙えそうです。";
  if (points >= 2) return "伸びしろ十分。意外な感じ方も楽しめました。";
  return "大発見の連続！ みんなの違いがよく見えました。";
}

export const clueHasNumber = (clue: string) => /[0-9０-９]/.test(clue);
