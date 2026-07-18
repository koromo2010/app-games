import {
  generateGameLlmText,
  resolveGameLlmMode,
  type GameLlmMode,
  type GameLlmProvider,
} from "@/lib/game-llm";
import type { GameGenerationMeta } from "@/lib/game-ai-types";
import { formatGameFeedbackContext, retrieveGameFeedback } from "@/lib/game-feedback-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { emitObservabilityEvent, observabilityErrorCode } from "@/lib/observability";
import { loadStoredTahoiyaRoom } from "@/lib/tahoiya-room-store";
import {
  findReusableTahoiyaTopic,
  findUnexperiencedScreenedTahoiyaWordCandidates,
  findUnscreenedUnexperiencedTahoiyaWordCandidates,
  loadUnreviewedTahoiyaSources,
  rememberTahoiyaReviewedBatch,
  rememberTahoiyaTopicExperience,
  type TahoiyaReviewedCandidate,
  type TahoiyaWordCandidate,
} from "@/lib/tahoiya-topic-catalog";
import {
  addTahoiyaScreeningExclusion,
  saveTahoiyaDifficultyScreenings,
  saveTahoiyaScreenedTopic,
} from "@/lib/tahoiya-screening-repository";
import type { TahoiyaSourceEntry } from "@/lib/tahoiya-source-library";
import {
  tahoiyaDifficultyLabel,
  tahoiyaEffectiveZipfDescription,
} from "@/lib/tahoiya-difficulty";
import type { TahoiyaDifficulty, TahoiyaTopic } from "@/lib/tahoiya-types";
import { parseLlmJson } from "@/lib/llm-json";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { vocabularyDatabaseErrorCode } from "@/lib/vocabulary-postgres-store";
import { parseTahoiyaCatalogTopicGeneration } from "@/lib/tahoiya-catalog-topic-generation";
import { parseTahoiyaDifficultyScreening } from "@/lib/tahoiya-difficulty-screening";

const tahoiyaTopicPromptVersion = "tahoiya-effective-zipf-topic-v14";
const tahoiyaBatchPromptVersion = "tahoiya-effective-zipf-batch-v2";
const tahoiyaDifficultyScreeningPromptVersion = "tahoiya-difficulty-screening-v2";
const tahoiyaGenerationCandidateLimit = 3;
const tahoiyaScreeningBatchLimit = 3;
export const maxDuration = 180;
type DefinitionStyle = "brief" | "standard" | "detailed" | "long" | "extended" | "maximum";

const definitionStyleRules: Record<DefinitionStyle, { max: number; instruction: string }> = {
  brief: { max: 14, instruction: "10文字程度の短く端的な説明" },
  standard: { max: 25, instruction: "20文字程度の標準的な説明" },
  detailed: { max: 38, instruction: "30文字程度で特徴や用途を少し補った説明" },
  long: { max: 46, instruction: "40文字程度で特徴を自然に補った説明" },
  extended: { max: 55, instruction: "50文字程度で意味の理解に必要な情報を含めた説明" },
  maximum: { max: 60, instruction: "55文字から60文字以内の詳しい説明" },
};

function pickDefinitionStyle(): DefinitionStyle {
  const weightedStyles: Array<{ style: DefinitionStyle; weight: number }> = [
    { style: "brief", weight: 35 },
    { style: "standard", weight: 28 },
    { style: "detailed", weight: 20 },
    { style: "long", weight: 10 },
    { style: "extended", weight: 5 },
    { style: "maximum", weight: 2 },
  ];
  let roll = Math.random() * 100;
  for (const choice of weightedStyles) {
    roll -= choice.weight;
    if (roll < 0) return choice.style;
  }
  return "brief";
}

const fallbackTopics: TahoiyaTopic[] = [
  {
    word: "グリザイユ",
    reading: "ぐりざいゆ",
    realDefinition: "灰色の濃淡を中心に単色で描く絵画技法。",
    note: "実在するカタカナの美術用語で、意味を想像しにくい語。",
    sourceDetail: "ローカル収録候補。Tateの美術用語解説にある技法の説明をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "カホキア",
    reading: "かほきあ",
    realDefinition: "北米で栄えた大規模な先住民都市の遺跡。",
    note: "一般には知られにくい実在の歴史地名。",
    sourceDetail: "ローカル収録候補。UNESCO世界遺産センターの遺跡解説をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "キジ島",
    reading: "きじとう",
    realDefinition: "多くの丸屋根を持つ木造教会群で知られるロシアの島。",
    note: "字面から所在や特徴を推測しにくい実在の地名。",
    sourceDetail: "ローカル収録候補。UNESCO世界遺産センターの木造教会群の解説をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "虎落笛",
    reading: "もがりぶえ",
    realDefinition: "冬の強い風が竹垣などに当たって鳴る音。",
    note: "意味を知る人が少なく偽説明を作りやすい季語。",
    sourceDetail: "ローカル収録候補。国語辞典や季語辞典で扱われる語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "筌",
    reading: "うけ",
    realDefinition: "川や湖に仕掛け、入り込んだ魚を逃がさず捕らえる竹製の漁具。",
    note: "一般には知られにくい古い漁具の名称。",
    sourceDetail: "ローカル収録候補。国語辞典にある漁具としての語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "襤褸",
    reading: "らんる",
    realDefinition: "ぼろぼろになった衣服。",
    note: "日常語ではないが偽の意味を想像しやすい語。",
    sourceDetail: "ローカル収録候補。国語辞典にある衣服の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "鰾",
    reading: "うきぶくろ",
    realDefinition: "魚の体内にある袋状の器官で、気体量を変えて水中での浮力を調節するもの。",
    note: "実在する意味を知らなくても説明を捏造しやすい語。",
    sourceDetail: "ローカル収録候補。国語辞典や生物学辞典の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "衾",
    reading: "ふすま",
    realDefinition: "寝るときに体へ掛ける寝具。",
    note: "一般的な建具とは異なる意味を持つ古い寝具名。",
    sourceDetail: "ローカル収録候補。国語辞典にある寝具としての語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "笄",
    reading: "こうがい",
    realDefinition: "髪を整えて留めるために挿す細長い道具。",
    note: "用途を推測しにくい古い装身具の名称。",
    sourceDetail: "ローカル収録候補。国語辞典や服飾辞典にある語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "行縢",
    reading: "むかばき",
    realDefinition: "狩猟や旅で脚を守るため、腰から脚へ着けた革や布の覆い。",
    note: "現代ではほとんど使われない装具の名称。",
    sourceDetail: "ローカル収録候補。国語辞典にある古い装具の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "鐙",
    reading: "あぶみ",
    realDefinition: "馬の鞍から下げ、乗る人が足を掛ける道具。",
    note: "字面から用途を推測しにくい馬具の名称。",
    sourceDetail: "ローカル収録候補。国語辞典や馬具辞典にある語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "甃",
    reading: "いしだたみ",
    realDefinition: "石を敷き詰めて作った道や庭の表面。",
    note: "読みと字面の距離がある古い表記。",
    sourceDetail: "ローカル収録候補。国語辞典にある石敷きの語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "紙縒",
    reading: "こより",
    realDefinition: "細く切った紙をひねって作るひも。",
    note: "実物は身近でも表記と名称が知られにくい語。",
    sourceDetail: "ローカル収録候補。国語辞典にある紙紐の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "木賊",
    reading: "とくさ",
    realDefinition: "節のある細い茎を持ち、表面が硬く物を磨くのにも使われた常緑の植物。",
    note: "植物名としての意味が推測しにくい語。",
    sourceDetail: "ローカル収録候補。国語辞典や植物辞典にある語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "零余子",
    reading: "むかご",
    realDefinition: "植物の葉の付け根などにでき、地に落ちると新しい株になる小さな芽。",
    note: "食材として知っていても表記と成り立ちが知られにくい語。",
    sourceDetail: "ローカル収録候補。国語辞典や植物辞典にある語義をゲーム用に簡潔化。",
    source: "fallback",
  },
];

const extremeFallbackTopics: TahoiyaTopic[] = [
  {
    word: "タッシリ・ナジェール",
    reading: "たっしり・なじぇーる",
    realDefinition: "先史時代の岩絵が多数残るサハラの高原。",
    note: "難語好きでも意味を知る人が少ない実在の地名。",
    sourceDetail: "ローカル収録候補。UNESCO世界遺産センターの岩絵群の解説をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "チャタル・ヒュユク",
    reading: "ちゃたる・ひゅゆく",
    realDefinition: "密集した住居跡が残るトルコの新石器時代集落。",
    note: "実在確認ができ、一般にはほとんど知られていない遺跡名。",
    sourceDetail: "ローカル収録候補。UNESCO世界遺産センターの新石器時代集落の解説をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "アナモルフォーシス",
    reading: "あなもるふぉーしす",
    realDefinition: "特定の角度や器具を通すと正しく見える歪像技法。",
    note: "長いカタカナ語であり、意味を類推しにくい美術用語。",
    sourceDetail: "ローカル収録候補。美術館の技法解説にある歪像の説明をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "侘傺",
    reading: "たてい",
    realDefinition: "失意のまま進退に迷うさま。",
    note: "日常ではまず使われず、字面から意味を推測しにくい語。",
    sourceDetail: "ローカル収録候補。漢語辞典にある失意の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "齏粉",
    reading: "せいふん",
    realDefinition: "細かく砕かれて粉々になること。",
    note: "読みも意味も一般にはほとんど知られていない語。",
    sourceDetail: "ローカル収録候補。国語辞典にある粉砕の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "罅隙",
    reading: "かげき",
    realDefinition: "物にできた割れ目やすき間。",
    note: "構成する字からも読みと意味を当てにくい語。",
    sourceDetail: "ローカル収録候補。国語辞典にある裂け目の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "縕袍",
    reading: "おんぽう",
    realDefinition: "古い綿を入れて作った粗末な着物。",
    note: "古典由来で現代の一般語彙から大きく外れる衣服名。",
    sourceDetail: "ローカル収録候補。古語辞典にある衣服の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "輓近",
    reading: "ばんきん",
    realDefinition: "現在に近い過去の時期。",
    note: "意味の手掛かりが少ない古い漢語。",
    sourceDetail: "ローカル収録候補。国語辞典にある近年の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "倥偬",
    reading: "こうそう",
    realDefinition: "物事に追われて慌ただしいこと。",
    note: "読みも用法も一般にはなじみが薄い漢語。",
    sourceDetail: "ローカル収録候補。国語辞典にある多忙の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "灑掃",
    reading: "さいそう",
    realDefinition: "水をまいてから掃き清めること。",
    note: "古い生活動作を表し、現代ではほぼ使われない語。",
    sourceDetail: "ローカル収録候補。漢語辞典にある清掃の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
  {
    word: "飆風",
    reading: "ひょうふう",
    realDefinition: "急に激しく吹き起こる風。",
    note: "気象語としても非常に使用頻度が低い語。",
    sourceDetail: "ローカル収録候補。国語辞典にある強風の語義をゲーム用に簡潔化。",
    source: "fallback",
  },
];

function normalizeTopicWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function getFeedbackBlockedWords(records: Awaited<ReturnType<typeof retrieveGameFeedback>>) {
  const blockingReasons = new Set([
    "existence-questionable",
    "definition-questionable",
    "want-harder-word",
    "homophone-too-easy",
    "too-easy",
    "too-famous",
  ]);
  return records.flatMap((record) => {
    if (record.rating !== "bad" || !record.reasonTags.some((tag) => blockingReasons.has(tag))) return [];
    const match = record.artifactText.match(/(?:^|\s\/\s)単語=([^/]+)/);
    return match?.[1]?.trim() ? [normalizeTopicWord(match[1])] : [];
  });
}

export function pickFallbackTopic(usedWords: string[], difficulty: TahoiyaDifficulty) {
  const used = new Set(usedWords.map(normalizeTopicWord));
  const source = difficulty === "extreme" ? extremeFallbackTopics : fallbackTopics;
  const candidates = source.filter((topic) => !used.has(normalizeTopicWord(topic.word)));
  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function simplifyDefinition(value: unknown) {
  const text = String(value ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^[^、。]{1,20}と読み、/, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = text.split("。").map((part) => part.trim()).find(Boolean);
  return firstSentence ? `${firstSentence}。` : "";
}

function parseTopic(text: string): TahoiyaTopic | null {
    const parsed = parseLlmJson<Partial<TahoiyaTopic>>(text);
    if (!parsed) return null;
    const realDefinition = simplifyDefinition(parsed.realDefinition);
    const definitionLength = Array.from(realDefinition.replace(/。$/, "")).length;
    if (!parsed.word || !realDefinition || definitionLength < 4 || definitionLength > 60) return null;

    return {
      word: String(parsed.word).trim(),
      reading: parsed.reading ? String(parsed.reading).trim() : undefined,
      realDefinition,
      note: String(parsed.note || "LLMが選んだ辞書風のお題です。"),
      sourceDetail: String(parsed.sourceDetail || "LLMによる生成後、別の校閲プロンプトで読みと意味を再確認。"),
      source: "llm",
    };
}

function parseVerifiedTopic(text: string): TahoiyaTopic | null {
  const parsed = parseLlmJson<Partial<TahoiyaTopic> & { valid?: boolean }>(text);
  if (!parsed || parsed.valid !== true) return null;
  return parseTopic(JSON.stringify(parsed));
}

function parseTopicCandidates(text: string) {
    const parsed = parseLlmJson<{ candidates?: unknown } & Partial<TahoiyaTopic>>(text);
    if (!parsed) return [];
    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [parsed];
    const candidates = rawCandidates
      .map((candidate) => parseTopic(JSON.stringify(candidate)))
      .filter((candidate): candidate is TahoiyaTopic => Boolean(candidate));
    return [...new Map(candidates.map((candidate) => [normalizeTopicWord(candidate.word), candidate])).values()].slice(0, 3);
}

function independentReviewerProvider(provider: GameLlmProvider): GameLlmProvider {
  if (provider === "openai") return "gemini";
  if (provider === "gemini") return "groq";
  return "openai";
}

async function generateTopicFromCatalogWords(
  mode: Exclude<GameLlmMode, "local">,
  difficulty: TahoiyaDifficulty,
  candidates: TahoiyaWordCandidate[],
  retrievedFeedbackIds: string[],
) {
  if (candidates.length === 0) return null;
  for (const candidate of candidates) {
    const definitionStyle = pickDefinitionStyle();
    const definitionRule = definitionStyleRules[definitionStyle];
    const prompt = [
      `共通単語DBで選定済みの見出し語「${candidate.word}」に、国語辞典を使ったパーティーゲーム『たほい屋』の本物の説明を付けてください。`,
      "あなたの役割は、一般向けゲームに不適切なセンシティブ語かの判定と、センシティブでない場合の読み・正解文の作成だけです。",
      "この見出し語の実在性、難易度、珍しさ、偽説明の作りやすさ、ゲームへの向き不向きはDB側で確定済みです。再判定せず、別の語を選んだり表記を変えたりしないでください。",
      "差別的、露骨に性的、または残虐な語義で一般向けゲームに不適切な場合だけsensitiveをtrueにしてください。単に難しい、意味に自信がない、暗い内容という理由ではtrueにしないでください。",
      candidate.reading
        ? `DBの読みは「${candidate.reading}」です。readingにはこの値をそのまま返してください。`
        : "readingには見出し語の読みをひらがなで書いてください。",
      "sensitiveがfalseの場合、realDefinitionには意味だけを自然な日本語一文で書いてください。読み、語源、用例、括弧、複数の語義は含めないでください。",
      `${definitionRule.instruction}を目安とし、最大60文字以内にしてください。自然な説明を優先してください。`,
      "選定理由、出典、確信度、解説、候補一覧は不要です。",
      "JSONのみで返してください: {\"sensitive\":trueまたはfalse,\"reading\":\"...\",\"realDefinition\":\"...\"}",
    ].join("\n\n");
    const generated = await generateGameLlmText(prompt, mode, { quality: "high" });
    const parsed = parseTahoiyaCatalogTopicGeneration(generated.text, candidate, difficulty);
    if (parsed.status !== "accepted") {
      emitObservabilityEvent(parsed.status === "unsafe" ? "info" : "warn", "ai.generation", {
        game: "tahoiya",
        operation: parsed.status === "unsafe" ? "catalog-sensitive-filter" : "catalog-definition-format",
        provider: generated.provider,
        model: generated.model,
        outcome: "rejected",
      });
      if (parsed.status === "unsafe") {
        await addTahoiyaScreeningExclusion(candidate.id, "sensitive").catch(() => false);
      }
      continue;
    }
    return {
      candidate,
      topic: {
        ...parsed.topic,
        generation: {
          provider: generated.provider,
          model: generated.model,
          mode: generated.mode,
          billingSource: generated.billingSource,
          promptVersion: tahoiyaTopicPromptVersion,
          latencyMs: generated.latencyMs,
          retrievedFeedbackIds,
        },
      },
    };
  }
  return null;
}

export async function generateTopic(
  mode: Exclude<GameLlmMode, "local">,
  difficulty: TahoiyaDifficulty,
  feedbackContext: string,
  retrievedFeedbackIds: string[],
  usedWords: string[],
) {
  const definitionStyle = pickDefinitionStyle();
  const definitionRule = definitionStyleRules[definitionStyle];
  const difficultyRules = difficulty === "extreme"
    ? [
        "今回は魔境モードです。難語好きや読書家でも意味を知らない可能性が高い、使用頻度が極端に低い見出し語だけを選んでください。",
        "古語辞典、漢語辞典、専門辞典、信頼できる百科事典に載る語を対象にし、短い語義を正確に示せるものに限ります。",
        "難しい漢字で書いた身近な物の名前、一般語の異表記、有名な難読語、漢字から意味を容易に推測できる語は除外してください。",
      ]
    : ["今回は秘境モードです。一般的な日本人の大人がまず意味を知らない難語を選んでください。"];
  const instructions = [
    "国語辞典を使ったパーティーゲーム『たほい屋』用のお題候補を3つ作ってください。",
    ...difficultyRules,
    "よく知られた物を難しい漢字で書いただけの語ではなく、言葉や意味そのものが広く知られていないものを優先してください。",
    "参加者がもっともらしい偽説明を複数考えられる語を選んでください。造語や実在が確認できない語は禁止です。",
    "一般名詞だけでなく、実在する固有名詞とカタカナの専門語・外来語も候補に含めてください。",
    "固有名詞は、一般には知られていない歴史上の場所、遺跡、地形、文化、作品、過去の人物などから選べます。現代人物名、企業名、商品名、流行語は避けてください。",
    "カタカナ語は、単に英語を音写しただけの有名語ではなく、日本語の辞書や専門辞典で意味を確認できる使用頻度の低い語にしてください。",
    "3候補をすべて同種にせず、一般語、固有名詞、固有名詞ではないカタカナ語を各1候補ずつ出してください。差別語、性的または残虐な語は避けてください。",
    "realDefinitionには意味だけを書き、読み方、語源、用例、別名、漢字の説明を含めないでください。",
    "realDefinitionは括弧を使わず、一文にしてください。複数の意味を並べないでください。",
    `今回は${definitionRule.instruction}を目安とし、${definitionRule.max}文字以内にしてください。意味を自然に説明できることを優先し、文字数を合わせるための不要な言い換えや情報追加はしないでください。`,
    "readingは専用フィールドにだけ入れてください。noteは選定理由を短く書いてください。",
    "sourceDetailには、その語と語義を確認できる辞書名・辞典の種類・典拠など、確実な確認情報を短く書いてください。不確かな辞書名を創作しないでください。",
    "3候補は互いに異なる分野・字面・意味にし、最終校閲者が比較して最良の1つを選べるようにしてください。",
    usedWords.length > 0 ? `過去出題済みまたはBad評価のため、絶対に使わない見出し語NGリスト: ${usedWords.slice(0, 500).join("、")}` : "",
    "JSONのみで返してください: {\"candidates\":[{\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\",\"sourceDetail\":\"...\"},{...},{...}]}",
  ].filter(Boolean).join("\n");
  const prompt = [instructions, feedbackContext].filter(Boolean).join("\n\n");

  const generated = await generateGameLlmText(prompt, mode, { quality: "high" });
  const blocked = new Set(usedWords.map(normalizeTopicWord));
  const topics = parseTopicCandidates(generated.text).filter((candidate) => !blocked.has(normalizeTopicWord(candidate.word)));
  if (topics.length === 0) return null;

  const verificationPrompt = [
    "あなたは日本語辞書の厳格な校閲者です。次のたほい屋用候補を比較し、事実性・難しさ・偽説明の作りやすさが最も優れた1候補だけを選んでください。",
    difficulty === "extreme"
      ? "魔境モードなので、難語に詳しい人でも意味を知る可能性が低い語だけを有効とし、有名な難読語や身近な物の難しい表記は無効にしてください。"
      : "秘境モードとして、一般的な大人が意味を知らない十分な難しさがあるか確認してください。",
    "見出し語が日本語の辞書・専門辞典・信頼できる百科事典で確認できる一般語、固有名詞、カタカナ語であり、readingが正しく、realDefinitionがその意味に正確に対応する場合だけvalidをtrueにしてください。",
    "単なる当て字、読みと意味の取り違え、存在が不確かな語、一般人が意味を知っている語、説明が不正確な候補はvalidをfalseにしてください。",
    "少しでも確信がなければvalidをfalseにしてください。推測で修正や補完をしないでください。",
    "実在・読み・語義・典拠に疑いがある候補は除外してください。複数が有効なら、一般的な大人が意味を知らず、字面だけでは意味を推測しにくく、偽説明を作りやすい候補を優先してください。",
    "固有名詞は現代人物・企業・商品ではないこと、カタカナ語は日本語で実際に用いられる見出し語であることも確認してください。",
    `validがtrueの場合も、realDefinitionは意味だけの一文とし、${definitionRule.instruction}を目安に${definitionRule.max}文字以内にしてください。自然な説明を無理に引き延ばさず、読み方、語源、用例、別名、漢字の説明、括弧を含めないでください。`,
    "sourceDetailの辞書名や確認情報が不確か、または創作の可能性がある場合もvalidをfalseにしてください。",
    "JSONのみで返してください: {\"valid\":trueまたはfalse,\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\",\"sourceDetail\":\"...\"}",
    `検証候補一覧: ${JSON.stringify(topics)}`,
  ].join("\n");
  const verified = await generateGameLlmText(verificationPrompt, mode, {
    quality: "high",
    preferredProvider: independentReviewerProvider(generated.provider),
    excludedProviders: generated.attemptedProviders.filter((provider) => provider !== generated.provider),
  });
  const verifiedTopic = parseVerifiedTopic(verified.text);
  const selectedTopic = verifiedTopic
    ? topics.find((candidate) => normalizeTopicWord(candidate.word) === normalizeTopicWord(verifiedTopic.word))
    : null;
  return verifiedTopic && selectedTopic
    ? {
        ...verifiedTopic,
        generation: {
          provider: generated.provider,
          model: generated.model,
          mode: generated.mode,
          billingSource: generated.billingSource,
          promptVersion: tahoiyaTopicPromptVersion,
          latencyMs: generated.latencyMs + verified.latencyMs,
          retrievedFeedbackIds,
          reviewProvider: verified.provider,
          reviewModel: verified.model,
        },
      }
    : null;
}

type BatchReviewItem = {
  sourceId: string;
  accepted: boolean;
  word: string;
  reading: string;
  realDefinition: string;
  note: string;
};

type ParsedBatchReviewItem = BatchReviewItem & {
  source: TahoiyaSourceEntry;
  difficulty: TahoiyaDifficulty;
  difficultyReason: string;
};

function difficultyAnchorTags(difficulty: TahoiyaDifficulty) {
  if (difficulty === "extreme") return ["too-difficult", "hard-to-fake"];
  return ["difficulty-good", "appropriately-obscure", "easy-to-fake"];
}

function parseBatchReview(
  text: string,
  sources: TahoiyaSourceEntry[],
  difficulty: TahoiyaDifficulty,
): ParsedBatchReviewItem[] {
    const parsed = parseLlmJson<{ items?: unknown[] }>(text);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    const byId = new Map(sources.map((source) => [source.id, source]));
    return parsed.items.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Partial<BatchReviewItem>;
      const source = item.sourceId ? byId.get(item.sourceId) : undefined;
      const realDefinition = simplifyDefinition(item.realDefinition);
      const definitionLength = Array.from(realDefinition.replace(/。$/, "")).length;
      if (!source) return [];
      const reading = String(item.reading || "").trim();
      const wordMatches = normalizeTopicWord(String(item.word || "")) === normalizeTopicWord(source.word);
      const contentIsValid = Boolean(reading && realDefinition && definitionLength >= 4 && definitionLength <= 60);
      return [{
        source,
        sourceId: source.id,
        accepted: item.accepted === true && wordMatches && contentIsValid,
        word: source.word,
        reading,
        realDefinition,
        note: String(item.note || "共通単語DBの語をLLMで検証。"),
        difficulty,
        difficultyReason: `${source.hint || `${tahoiyaDifficultyLabel(difficulty)}・${tahoiyaEffectiveZipfDescription(difficulty)}`}から選定。`,
      }];
    });
}

async function reviewSourceBatch(
  mode: Exclude<GameLlmMode, "local">,
  sources: TahoiyaSourceEntry[],
  difficulty: TahoiyaDifficulty,
  feedbackContext: string,
  retrievedFeedbackIds: string[],
) {
  const compactSources = sources.map((source) => ({
    id: source.id,
    word: source.word.slice(0, 120),
    reading: source.reading?.slice(0, 120),
    selection: source.hint?.slice(0, 120),
    sourceLibrary: source.sourceLibrary.slice(0, 120),
  }));
  const prompt = [
    `共通単語DBから「${tahoiyaDifficultyLabel(difficulty)}（${tahoiyaEffectiveZipfDescription(difficulty)}）」として抽出した10語へ、読みと本物の説明を付けて各語独立に検証してください。語同士を相対比較して順位を付けてはいけません。`,
    "acceptedは、実在・読み・意味を典拠と素材の手掛かりから確信でき、たほい屋で偽説明を作れる語だけtrueにします。不確実、一般的すぎる、差別的、性的、残虐ならfalseです。",
    "入力のwordは共通単語DBの見出し語なので変更してはいけません。別の語への翻訳・言い換え・表記変更が必要ならaccepted=falseにしてください。",
    "難易度は実質Zipfからサーバー側ですでに確定しています。難易度の再判定や変更はせず、実在性・読み・語義・偽説明の作りやすさだけを審査してください。",
    "realDefinitionは意味だけを自然な日本語一文、60文字以内で書き、読み・語源・用例・括弧を含めません。",
    "入力のsourceIdを必ず維持し、入力全件を同じ順序で返してください。JSON以外は返さないでください。",
    "形式: {\"items\":[{\"sourceId\":\"...\",\"accepted\":true,\"word\":\"...\",\"reading\":\"...\",\"realDefinition\":\"...\",\"note\":\"...\"}]}",
    `素材: ${JSON.stringify(compactSources)}`,
    feedbackContext.slice(0, 1_500),
  ].filter(Boolean).join("\n\n");
  emitObservabilityEvent("info", "ai.generation", { game: "tahoiya", operation: "source-review", sourceCount: sources.length, outcome: "started" });
  const generated = await generateGameLlmText(prompt, mode, { quality: "standard", timeoutMs: 25_000 });
  const reviewed = parseBatchReview(generated.text, sources, difficulty);
  if (reviewed.length !== sources.length) throw new Error(`Batch review returned ${reviewed.length}/${sources.length} items`);
  const generation: GameGenerationMeta = {
    provider: generated.provider,
    model: generated.model,
    mode: generated.mode,
    billingSource: generated.billingSource,
    promptVersion: tahoiyaBatchPromptVersion,
    latencyMs: generated.latencyMs,
    retrievedFeedbackIds,
  };
  const candidates: TahoiyaReviewedCandidate[] = reviewed.filter((item) => item.accepted).map((item) => ({
    source: item.source,
    difficulty: item.difficulty,
    difficultyReason: item.difficultyReason,
    feedbackAnchorTags: difficultyAnchorTags(item.difficulty),
    topic: {
      word: item.word,
      reading: item.reading,
      realDefinition: item.realDefinition,
      note: item.note,
      sourceDetail: `${item.source.sourceLibrary}（${item.source.genre}）の素材をLLMで検証。`,
      source: "llm",
      generation,
    },
  }));
  return { reviewed, candidates, generation };
}

async function screenDifficultyCandidates(
  mode: Exclude<GameLlmMode, "local">,
  candidates: TahoiyaWordCandidate[],
  difficulty: TahoiyaDifficulty,
) {
  const compactCandidates = candidates.map((candidate) => ({
    sourceId: `word-master:${candidate.id}`,
    word: candidate.word,
    reading: candidate.reading,
  }));
  const prompt = [
    "あなたは辞書当てゲーム『たほい屋』の難易度審査員です。候補10語について、一般的な日本人の成人が見出し語の意味を知っている割合を推定してください。",
    "辞書・言語・候補語の専門家ではない20〜60代の成人を基準にします。あなた自身が意味を知っているかではなく、一般の参加者の認知を推定してください。読み方を知っていても意味を説明できない場合は『知っている』に数えません。",
    "この先行審査では説明を作らず、難易度だけを見ます。10語を相対順位にせず、各語を同じ絶対基準で独立判定してください。",
    "verdictは推定認知率に合わせ、known=30%以上、borderline=15%以上30%未満、ordinary-unknown=1%超15%未満、almost-nobody-knows=0〜1%のいずれかにしてください。境界に空白を作らないでください。",
    "一般向けゲームに不適切な差別的・露骨に性的・残虐な語ならsensitive、大学の正式名称または通称ならuniversity、企業・法人・商号ならcompany、国・地域・自治体・町域・山川・駅などの地名ならplaceをexclusionFlagsへ入れてください。複数該当時はすべて入れ、該当なしは空配列にしてください。",
    "confidenceは判定への確信度を0〜100で返します。reasonは一般認知の観点だけを80文字以内で書き、語義そのものは説明しないでください。",
    "入力のsourceIdを維持し、全件を入力順で1回ずつ返してください。JSON以外は返さないでください。",
    "形式: {\"items\":[{\"sourceId\":\"...\",\"verdict\":\"known|borderline|ordinary-unknown|almost-nobody-knows\",\"exclusionFlags\":[\"sensitive|university|company|place\"],\"estimatedRecognitionPercent\":8,\"confidence\":80,\"reason\":\"...\"}]}",
    `候補: ${JSON.stringify(compactCandidates)}`,
  ].join("\n\n");
  emitObservabilityEvent("info", "ai.generation", { game: "tahoiya", operation: "difficulty-screening", sourceCount: candidates.length, outcome: "started" });
  const generated = await generateGameLlmText(prompt, mode, { quality: "standard", timeoutMs: 25_000 });
  const screened = parseTahoiyaDifficultyScreening(generated.text, compactCandidates.map((candidate, index) => ({ id: candidate.sourceId, wordId: candidates[index].id, word: candidate.word })), difficulty);
  if (screened.length !== candidates.length) throw new Error(`Difficulty screening returned ${screened.length}/${candidates.length} items`);
  const generation: GameGenerationMeta = {
    provider: generated.provider,
    model: generated.model,
    mode: generated.mode,
    billingSource: generated.billingSource,
    promptVersion: tahoiyaDifficultyScreeningPromptVersion,
    latencyMs: generated.latencyMs,
    retrievedFeedbackIds: [],
  };
  return { screened, generation };
}

export async function generateTahoiyaTopicResponse(
  difficulty: TahoiyaDifficulty,
  playerIds: string[],
  previewOnly = false,
  forceNew = false,
  screenDifficultyOnly = false,
) {
  const feedbackRecords = await retrieveGameFeedback({
    game: "tahoiya",
    task: "tahoiya.topic",
    queryTags: [difficulty === "extreme" ? "extreme-difficulty" : "very-hard", "varied-definition-length", "no-parentheses"],
  }).catch(() => []);
  const feedbackBlockedWords = getFeedbackBlockedWords(feedbackRecords);
  const feedbackContext = formatGameFeedbackContext(feedbackRecords);
  const retrievedFeedbackIds = feedbackRecords.map((record) => record.id);
  if (screenDifficultyOnly) {
    try {
      const candidates = await findUnscreenedUnexperiencedTahoiyaWordCandidates(playerIds, feedbackBlockedWords, 10);
      if (candidates.length < 10) {
        return Response.json({ error: `参加者全員が未使用の未判定候補を10件揃えられませんでした（${candidates.length}件）。` }, { status: 503 });
      }
      const mode = await resolveGameLlmMode();
      if (mode === "local") return Response.json({ error: "難易度を審査できるAI APIがありません。" }, { status: 503 });
      const screening = await screenDifficultyCandidates(mode, candidates, difficulty);
      const persistedCount = await saveTahoiyaDifficultyScreenings(screening.screened, screening.generation);
      return Response.json({
        screening: screening.screened,
        acceptedCount: screening.screened.filter((item) => item.accepted).length,
        generation: screening.generation,
        persisted: persistedCount === screening.screened.length,
        persistedCount,
      });
    } catch (error) {
      emitObservabilityEvent("error", "ai.generation", { game: "tahoiya", operation: "difficulty-screening", outcome: "failed", errorCode: observabilityErrorCode(error), databaseCode: vocabularyDatabaseErrorCode(error) });
      return Response.json({ error: "候補10語の難易度先行審査に失敗しました。もう一度お試しください。" }, { status: 503 });
    }
  }
  const rememberExperience = async (topic: TahoiyaTopic) => {
    if (!previewOnly) await rememberTahoiyaTopicExperience(topic, difficulty, playerIds).catch(() => undefined);
  };
  if (!forceNew) {
    try {
      const reusable = await findReusableTahoiyaTopic(difficulty, playerIds, feedbackBlockedWords);
      if (reusable) {
        await rememberExperience(reusable);
        return Response.json(reusable);
      }

      let candidates = await findUnexperiencedScreenedTahoiyaWordCandidates(
        difficulty,
        playerIds,
        feedbackBlockedWords,
        tahoiyaGenerationCandidateLimit,
      );
      let screenedBatchCount = 0;
      let lastScreeningGeneration: GameGenerationMeta | undefined;
      let mode: Exclude<GameLlmMode, "local"> | null = null;
      while (candidates.length === 0 && screenedBatchCount < tahoiyaScreeningBatchLimit) {
        const rawCandidates = await findUnscreenedUnexperiencedTahoiyaWordCandidates(
          playerIds,
          feedbackBlockedWords,
          10,
        );
        if (rawCandidates.length < 10) break;
        if (!mode) {
          const selectedMode: GameLlmMode = await resolveGameLlmMode();
          if (selectedMode === "local") {
            return Response.json({ error: "判定済み候補がなく、難易度を審査できるAI APIもありません。" }, { status: 503 });
          }
          mode = selectedMode;
        }
        const screening = await screenDifficultyCandidates(mode, rawCandidates, difficulty);
        await saveTahoiyaDifficultyScreenings(screening.screened, screening.generation);
        lastScreeningGeneration = screening.generation;
        screenedBatchCount += 1;
        candidates = screening.screened
          .filter((item) => item.accepted)
          .map((item) => rawCandidates.find((candidate) => candidate.id === item.wordId))
          .filter((candidate): candidate is TahoiyaWordCandidate => Boolean(candidate))
          .slice(0, tahoiyaGenerationCandidateLimit);
      }
      if (candidates.length === 0) {
        return Response.json({ error: `未判定語を${screenedBatchCount * 10}語審査しましたが、参加者全員が未使用の${tahoiyaDifficultyLabel(difficulty)}候補が見つかりませんでした。もう一度お試しください。` }, { status: 503 });
      }
      const definitionMode = mode ?? await resolveGameLlmMode();
      if (definitionMode === "local") {
        return Response.json({ error: "正解文を生成できるAI APIがありません。" }, { status: 503 });
      }
      const generatedTopic = await generateTopicFromCatalogWords(
        definitionMode,
        difficulty,
        candidates,
        retrievedFeedbackIds,
      );
      if (!generatedTopic) {
        return Response.json({ error: `${tahoiyaDifficultyLabel(difficulty)}候補の読み・正解文を検証できませんでした。もう一度お試しください。` }, { status: 503 });
      }
      const topic = generatedTopic.topic;
      if (!topic.generation || !topic.reading) throw new Error("TAHOIYA_GENERATED_TOPIC_METADATA_MISSING");
      await saveTahoiyaScreenedTopic({
        wordId: generatedTopic.candidate.id,
        reading: topic.reading,
        realDefinition: topic.realDefinition,
        note: topic.note,
        sourceDetail: topic.sourceDetail,
        generation: topic.generation,
      });
      await rememberExperience(topic);
      return Response.json({
        ...topic,
        screening: lastScreeningGeneration ? { batchCount: screenedBatchCount, generation: lastScreeningGeneration } : undefined,
      });
    } catch (error) {
      emitObservabilityEvent("error", "ai.generation", {
        game: "tahoiya",
        operation: "catalog-definition",
        outcome: "failed",
        errorCode: observabilityErrorCode(error),
        databaseCode: vocabularyDatabaseErrorCode(error),
      });
      return Response.json({ error: `${tahoiyaDifficultyLabel(difficulty)}候補から正解文を生成できませんでした。もう一度お試しください。` }, { status: 503 });
    }
  }

  const mode = await resolveGameLlmMode();
  if (mode === "local") {
    return Response.json({ error: "候補DBに未使用語がなく、新規候補を審査できるAI APIもありません。" }, { status: 503 });
  }

  try {
    const sources = await loadUnreviewedTahoiyaSources(difficulty, 10);
    if (sources.length < 10) {
      return Response.json({ error: `${tahoiyaDifficultyLabel(difficulty)}に該当する未審査語を共通単語DBから10件揃えられませんでした（${sources.length}件）。` }, { status: 503 });
    }
    const batch = await reviewSourceBatch(mode, sources, difficulty, feedbackContext, retrievedFeedbackIds);
    await rememberTahoiyaReviewedBatch(
      sources.map((source) => source.id),
      batch.candidates,
      retrievedFeedbackIds,
    );
    return Response.json({
      batch: batch.reviewed.map((item) => ({
        sourceId: item.source.id,
        accepted: item.accepted,
        word: item.word,
        reading: item.reading,
        realDefinition: item.realDefinition,
        note: item.note,
        difficulty: item.difficulty,
        difficultyReason: item.difficultyReason,
        genre: item.source.genre,
        sourceLibrary: item.source.sourceLibrary,
      })),
      registeredCount: batch.candidates.length,
      generation: batch.generation,
    });
  } catch (error) {
    emitObservabilityEvent("error", "ai.generation", { game: "tahoiya", operation: "source-review", outcome: "failed", errorCode: observabilityErrorCode(error) });
    return Response.json({ error: "素材候補10件のAI審査に失敗しました。もう一度お試しください。" }, { status: 503 });
  }

}

export async function GET(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
    if (limited) return limited;
    const url = new URL(request.url);
    const roomCode = url.searchParams.get("roomCode")?.trim().toUpperCase() ?? "";
    const room = roomCode ? await loadStoredTahoiyaRoom(roomCode).catch(() => null) : null;
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    if (!room.debugMode || room.hostId !== player.id) {
      return Response.json({ error: "Topics are generated through the authenticated room action" }, { status: 403 });
    }
    const forceNew = url.searchParams.get("forceNew") === "1";
    const screenDifficultyOnly = url.searchParams.get("screenDifficulty") === "1";
    return generateTahoiyaTopicResponse(room.topicDifficulty, room.players.map((item) => item.id), true, forceNew, screenDifficultyOnly);
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    return Response.json({ error: "Failed to generate topic preview" }, { status: 500 });
  }
}
