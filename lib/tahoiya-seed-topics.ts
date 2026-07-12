import type { GameGenerationMeta } from "@/lib/game-ai-types";
import type { TahoiyaTopic } from "@/lib/tahoiya-types";

export type TahoiyaCatalogDifficulty = "easy" | "standard" | "extreme";

export type TahoiyaSeedTopic = {
  topic: TahoiyaTopic;
  difficulty: TahoiyaCatalogDifficulty;
  genre: string;
  sourceLibrary: string;
  sourceUrl: string;
  difficultyReason: string;
  difficultyJudgedBy: "llm-curation-2026-07";
};

const seedGeneration: GameGenerationMeta = {
  provider: "local",
  model: "curated-open-vocabulary-seed-v1",
  mode: "local",
  promptVersion: "tahoiya-open-vocabulary-seed-v1",
  latencyMs: 0,
  retrievedFeedbackIds: [],
};

function seed(input: Omit<TahoiyaSeedTopic, "difficultyJudgedBy">): TahoiyaSeedTopic {
  return {
    ...input,
    difficultyJudgedBy: "llm-curation-2026-07",
    topic: { ...input.topic, generation: seedGeneration },
  };
}

export const tahoiyaSeedTopics: TahoiyaSeedTopic[] = [
  seed({
    topic: {
      word: "犬追物",
      reading: "いぬおうもの",
      realDefinition: "騎馬で犬を追い、傷つけにくい矢で射る武芸。",
      note: "字面から内容を推測しやすいため、簡単すぎる候補。",
      sourceDetail: "JMdictの見出し語・読みと国立国会図書館の歴史資料探索を基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "easy",
    genre: "日本史・武芸",
    sourceLibrary: "JMdict / 国立国会図書館デジタルコレクション",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
    difficultyReason: "構成漢字が行為をほぼ説明しており、未見でも推測しやすい。",
  }),
  seed({
    topic: {
      word: "逃散",
      reading: "ちょうさん",
      realDefinition: "農民が抵抗のため集団で居住地を離れること。",
      note: "日本史用語だが読みと制度的意味の両方が知られにくい。",
      sourceDetail: "JMdictの見出し語・読みと国立国会図書館の歴史資料探索を基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "extreme",
    genre: "日本史・社会史",
    sourceLibrary: "JMdict / 国立国会図書館デジタルコレクション",
    sourceUrl: "https://www.ndl.go.jp/use/reproduction",
    difficultyReason: "一般的でない読みを持ち、単なる逃亡とは異なる歴史的意味が必要。",
  }),
  seed({
    topic: {
      word: "失行",
      reading: "しっこう",
      realDefinition: "運動機能が保たれていても目的動作ができない状態。",
      note: "神経学では基本語だが、一般語の字面からは意味が定まりにくい。",
      sourceDetail: "NLM MeSHの神経学概念とJMdictの日本語見出しを基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "standard",
    genre: "医学・神経学",
    sourceLibrary: "NLM MeSH / JMdict",
    sourceUrl: "https://meshb.nlm.nih.gov/",
    difficultyReason: "医療関係者には既知だが、一般参加者には意味を推測しにくい。",
  }),
  seed({
    topic: {
      word: "弛張熱",
      reading: "しちょうねつ",
      realDefinition: "一日の体温差が大きく、平熱までは下がらない熱型。",
      note: "症状名ではなく熱型の分類語で、医学知識がないと難しい。",
      sourceDetail: "NLMの医学用語体系とJMdictの日本語見出しを基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "extreme",
    genre: "医学・診断学",
    sourceLibrary: "NLM MeSH / JMdict",
    sourceUrl: "https://www.nlm.nih.gov/databases/download/terms_and_conditions.html",
    difficultyReason: "読みも意味も専門的で、漢字から熱型の条件までは推測できない。",
  }),
  seed({
    topic: {
      word: "鼓腸",
      reading: "こちょう",
      realDefinition: "腸内にガスがたまり、腹部が張った状態。",
      note: "短い字面から意味を連想しにくい古典的な医学語。",
      sourceDetail: "NLMの消化器系概念とJMdictの日本語見出しを基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "standard",
    genre: "医学・消化器学",
    sourceLibrary: "NLM MeSH / JMdict",
    sourceUrl: "https://meshb.nlm.nih.gov/",
    difficultyReason: "一般には知られにくいが、医療・介護分野では比較的使われる。",
  }),
  seed({
    topic: {
      word: "エンタブラチュア",
      reading: "えんたぶらちゅあ",
      realDefinition: "古典建築で柱頭の上に載る水平な上部構造。",
      note: "建築史の基本語だが、一般にはほとんど知られていない。",
      sourceDetail: "Getty AATの建築語彙とJMdictの日本語表記を基にゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "extreme",
    genre: "建築史",
    sourceLibrary: "Getty Art & Architecture Thesaurus / JMdict",
    sourceUrl: "https://www.getty.edu/research/tools/vocabularies/obtain/download.html",
    difficultyReason: "外来語の音から機能を推測できず、建築専門知識が必要。",
  }),
  seed({
    topic: {
      word: "スパンドレル",
      reading: "すぱんどれる",
      realDefinition: "アーチ外側とそれを囲む枠の間にできる部分。",
      note: "建築以外にも意味が広がるが、ここでは建築用語として収録。",
      sourceDetail: "Getty AATの建築語彙を基に、代表的な意味をゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "standard",
    genre: "建築・美術",
    sourceLibrary: "Getty Art & Architecture Thesaurus",
    sourceUrl: "https://vocab.getty.edu/",
    difficultyReason: "専門外では難しい一方、建築・デザイン分野では一定の知名度がある。",
  }),
  seed({
    topic: {
      word: "ヘミオラ",
      reading: "へみおら",
      realDefinition: "三拍子二小節を三つの二拍として感じさせるリズム。",
      note: "演奏経験があっても名称を知らない場合が多い音楽理論語。",
      sourceDetail: "JMdictの音楽用語見出しを基に、意味をゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "extreme",
    genre: "音楽理論",
    sourceLibrary: "JMdict",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
    difficultyReason: "語形から意味を推測できず、音楽理論の用語知識が必要。",
  }),
  seed({
    topic: {
      word: "托葉",
      reading: "たくよう",
      realDefinition: "葉柄の付け根に生じる葉状の付属物。",
      note: "学校生物より一段専門的だが、植物好きには知られる語。",
      sourceDetail: "JMdictの植物学用語見出しを基に、意味をゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "standard",
    genre: "植物学",
    sourceLibrary: "JMdict",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
    difficultyReason: "読みは素直だが、植物形態学を知らないと正確な意味は難しい。",
  }),
  seed({
    topic: {
      word: "輪蔵",
      reading: "りんぞう",
      realDefinition: "経典を納め、回転できるようにした書架。",
      note: "寺院建築と仏教文化にまたがる、字面だけでは分かりにくい語。",
      sourceDetail: "JMdictの仏教・建築語彙見出しを基に、意味をゲーム用に要約。",
      source: "fallback",
    },
    difficulty: "extreme",
    genre: "仏教・寺院建築",
    sourceLibrary: "JMdict",
    sourceUrl: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
    difficultyReason: "構成漢字から保管設備までは想像できても、回転構造が推測しにくい。",
  }),
];
