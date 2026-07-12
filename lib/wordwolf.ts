import { additionalProperNounNearPairTopics, additionalProperNounWidePairTopics, createHintTopicGroups } from "@/lib/wordwolf-topic-data";
import type { TopicCandidate, TopicDictionarySource, TopicPairDistance, TopicSourceMode, WordWolfTopic } from "@/lib/wordwolf-topic-types";

export type { TopicDictionarySource, TopicPairDistance, TopicSourceMode, WordWolfTopic } from "@/lib/wordwolf-topic-types";

type TopicLayer = "object" | "place" | "activity" | "person" | "living";

type TopicSet = {
  id: string;
  label: string;
  layer: TopicLayer;
  words: readonly string[];
};

type TopicGroup = {
  label: string;
  setIds: readonly string[];
};

const curatedPairTopics: TopicCandidate[] = [
  { villageWord: "カレー", wolfWord: "ハンバーグ", reason: "家庭料理の定番だが、香りや食べ方が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "映画館", wolfWord: "カラオケ", reason: "休日に屋内で楽しむ場所だが、受け身か参加型かが違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "コーヒー", wolfWord: "紅茶", reason: "休憩中に飲む定番だが、香りと作り方が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "キャンプ", wolfWord: "バーベキュー", reason: "屋外で楽しむ活動だが、泊まりや準備の規模が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "ラーメン", wolfWord: "牛丼", reason: "気軽な外食の定番だが、料理の形と店の雰囲気が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "図書館", wolfWord: "本屋", reason: "本が集まる場所だが、借りる場所と買う場所で違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "温泉", wolfWord: "ホテル", reason: "旅行で使う場所だが、入浴中心か宿泊中心かが違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "水族館", wolfWord: "動物園", reason: "生き物を見る施設だが、展示される環境が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "バス", wolfWord: "タクシー", reason: "道路を走る移動手段だが、乗り方と自由度が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
  { villageWord: "スーパー", wolfWord: "市場", reason: "食材を買う場所だが、売り方と雰囲気が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
];

const curatedNearPairTopics: TopicCandidate[] = [
  { villageWord: "コーヒー", wolfWord: "紅茶", reason: "休憩中に飲む温かい飲み物だが、香りや抽出方法が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "図書館", wolfWord: "本屋", reason: "本を探す場所だが、借りる場所と買う場所で違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "水族館", wolfWord: "動物園", reason: "生き物を見る施設だが、水中生物中心か陸上動物中心かが違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "バス", wolfWord: "タクシー", reason: "道路を走る移動手段だが、乗り方と自由度が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "スーパー", wolfWord: "コンビニ", reason: "日用品を買う店だが、品ぞろえと使う場面が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "ホテル", wolfWord: "旅館", reason: "泊まる施設だが、雰囲気や過ごし方が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "ラーメン", wolfWord: "うどん", reason: "麺料理だが、麺の種類や味の方向性が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
  { villageWord: "映画館", wolfWord: "劇場", reason: "客席で作品を見る場所だが、映像か生の上演かが違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
];

const curatedWidePairTopics: TopicCandidate[] = [
  { villageWord: "カレー", wolfWord: "ピザ", reason: "食事の定番だが、味の方向性と食べ方が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "映画館", wolfWord: "美術館", reason: "休日に行く施設だが、作品の楽しみ方が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "コーヒー", wolfWord: "ジュース", reason: "飲み物だが、飲む場面と味の印象が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "キャンプ", wolfWord: "ホテル", reason: "旅行に関係するが、過ごし方と準備が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "ラーメン", wolfWord: "寿司", reason: "外食の定番だが、料理の形と店の雰囲気が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "図書館", wolfWord: "公園", reason: "公共の場所だが、静かに使う場所と体を動かす場所で違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "温泉", wolfWord: "水族館", reason: "旅行先で楽しむ場所だが、体験の中心が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "バス", wolfWord: "飛行機", reason: "移動手段だが、距離感と乗り方が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
  { villageWord: "スーパー", wolfWord: "コンビニ", reason: "買い物をする場所だが、品ぞろえと使う場面が違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
];

const properNounNearPairTopics: TopicCandidate[] = [
  { villageWord: "横浜ランドマークタワー", wolfWord: "東京タワー", reason: "都市を代表する展望施設だが、地域や建物の役割が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "京都", wolfWord: "金沢", reason: "歴史的な街並みで知られる観光都市だが、地域や文化の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "ローソン", wolfWord: "ドン・キホーテ", reason: "身近な小売チェーンだが、店の規模や利用場面が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "読売ジャイアンツ", wolfWord: "福岡ソフトバンクホークス", reason: "全国的に知られるプロ野球チームだが、リーグや本拠地が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "ABEMA", wolfWord: "Netflix", reason: "映像をネットで見るサービスだが、番組構成や視聴スタイルが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "iPhone", wolfWord: "Nintendo Switch", reason: "日常的に持ち歩くデジタル機器だが、通信とゲームで中心用途が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "縄文時代", wolfWord: "平安時代", reason: "学校で学ぶ日本史の時代区分だが、社会や文化の特徴が大きく違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "鬼滅の刃", wolfWord: "名探偵コナン", reason: "広く知られた漫画作品だが、時代設定や物語の型が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "フェルマー", wolfWord: "パスカル", reason: "フランスの数学史で知られる人物だが、代表的な業績の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
];

const properNounBalancedPairTopics: TopicCandidate[] = [
  { villageWord: "箱根", wolfWord: "長崎", reason: "旅行先として有名だが、温泉地と港町で旅の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "任天堂", wolfWord: "カプコン", reason: "日本のゲーム企業だが、代表作品や得意分野の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "週刊少年ジャンプ", wolfWord: "モーニング", reason: "漫画雑誌として知られるが、主な読者層や作品傾向が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ドラえもん", wolfWord: "進撃の巨人", reason: "有名な漫画作品だが、対象年代や世界観が大きく違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "Amazon", wolfWord: "メルカリ", reason: "ネットで商品を買えるサービスだが、販売主体や取引方法が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "東京ディズニーランド", wolfWord: "ハウステンボス", reason: "大型観光施設だが、作品世界と街並みで体験の中心が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "関ヶ原の戦い", wolfWord: "西南戦争", reason: "日本史の大きな武力衝突だが、時代と政治背景が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "大化の改新", wolfWord: "廃藩置県", reason: "日本史の統治制度を変えた出来事だが、時代と改革内容が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "日米和親条約", wolfWord: "ベルサイユ条約", reason: "歴史で学ぶ国際条約だが、締結時代や目的が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ファラデー", wolfWord: "メンデル", reason: "科学史で有名な人物だが、物理と生物で研究分野が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
];

const properNounWidePairTopics: TopicCandidate[] = [
  { villageWord: "Nintendo Switch", wolfWord: "Kindle", reason: "手元で使う娯楽系デバイスだが、遊ぶ機器と読む機器で体験が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "トヨタ", wolfWord: "無印良品", reason: "日本発の有名ブランドだが、移動手段と生活用品で連想が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "京都大学", wolfWord: "東京藝術大学", reason: "有名な大学だが、総合大学と芸術系大学で語られ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "スターバックス", wolfWord: "成城石井", reason: "街で見かける食品系チェーンだが、飲食店と食品スーパーで体験が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "東海道新幹線", wolfWord: "山手線", reason: "有名な鉄道路線だが、移動距離や使う場面が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "紅白歌合戦", wolfWord: "M-1グランプリ", reason: "有名なテレビ番組・イベントだが、内容や楽しみ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "フランス革命", wolfWord: "明治維新", reason: "社会体制を大きく変えた歴史的事件だが、国や変革の進み方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "国際連盟", wolfWord: "欧州連合", reason: "複数国が参加する国際組織だが、成立目的や統合の深さが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "古事記", wolfWord: "源氏物語", reason: "日本の古典作品だが、神話・歴史と物語文学で性格が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
];

const hintTopicGroups = createHintTopicGroups(properNounNearPairTopics, properNounBalancedPairTopics, properNounWidePairTopics);

const jaDailySets: TopicSet[] = [
  { id: "food", label: "日本語日常: 食べ物", layer: "object", words: ["カレー", "ラーメン", "ピザ", "寿司", "天ぷら", "弁当", "サンドイッチ", "お好み焼き", "牛丼", "焼肉"] },
  { id: "outing", label: "日本語日常: 外出先", layer: "place", words: ["映画館", "図書館", "本屋", "水族館", "動物園", "美術館", "温泉", "ホテル", "カラオケ", "ゲームセンター"] },
  { id: "transport-vehicles", label: "日本語日常: 乗り物", layer: "object", words: ["電車", "バス", "タクシー", "自転車", "新幹線", "飛行機", "レンタカー", "フェリー", "地下鉄", "バイク"] },
  { id: "transport-places", label: "日本語日常: 移動する場所", layer: "place", words: ["駅", "空港", "バス停", "港", "駐車場", "改札", "ホーム", "ターミナル", "サービスエリア", "レンタカー店"] },
  { id: "home", label: "日本語日常: 暮らし", layer: "object", words: ["冷蔵庫", "洗濯機", "掃除機", "電子レンジ", "エアコン", "テレビ", "財布", "鍵", "傘", "カレンダー"] },
  { id: "work-tasks", label: "日本語日常: 学校・仕事の行動", layer: "activity", words: ["宿題", "会議", "発表", "面接", "打ち合わせ", "研修", "プレゼン", "試験", "面談", "復習"] },
  { id: "study-items", label: "日本語日常: 学校・仕事の道具", layer: "object", words: ["資料", "ノート", "教科書", "プリント", "参考書", "問題集", "辞書", "ファイル", "名刺", "履歴書"] },
  { id: "daily-activities", label: "日本語日常: 日常の行動", layer: "activity", words: ["買い物", "散歩", "旅行", "読書", "料理", "運動", "掃除", "勉強", "ゲーム", "昼寝"] },
  { id: "drink", label: "日本語日常: 飲み物", layer: "object", words: ["コーヒー", "紅茶", "緑茶", "ジュース", "牛乳", "炭酸水", "味噌汁", "スープ", "水", "スポーツドリンク"] },
];

const jaDailyWideGroups: TopicGroup[] = [
  { label: "食事と休憩", setIds: ["food", "drink"] },
  { label: "生活のもの", setIds: ["home", "study-items"] },
  { label: "移動のもの", setIds: ["transport-vehicles", "home"] },
  { label: "外出する場所", setIds: ["outing", "transport-places"] },
  { label: "行動全般", setIds: ["work-tasks", "daily-activities"] },
];

const enCommonSets: TopicSet[] = [
  { id: "animals", label: "English common: animals", layer: "living", words: ["dog", "cat", "horse", "rabbit", "lion", "tiger", "bear", "monkey", "penguin", "dolphin"] },
  { id: "sports", label: "English common: sports", layer: "activity", words: ["baseball", "basketball", "tennis", "golf", "swimming", "running", "boxing", "skiing", "volleyball", "cycling"] },
  { id: "tools", label: "English common: tools", layer: "object", words: ["hammer", "scissors", "knife", "spoon", "camera", "phone", "laptop", "printer", "clock", "backpack"] },
  { id: "places", label: "English common: places", layer: "place", words: ["school", "hospital", "airport", "museum", "library", "restaurant", "beach", "park", "station", "theater"] },
  { id: "nature", label: "English common: nature", layer: "place", words: ["mountain", "river", "forest", "ocean", "flower", "rain", "snow", "wind", "island", "desert"] },
  { id: "jobs", label: "English common: jobs", layer: "person", words: ["doctor", "teacher", "chef", "driver", "artist", "engineer", "farmer", "pilot", "nurse", "writer"] },
];

const enCommonWideGroups: TopicGroup[] = [
  { label: "active things", setIds: ["animals", "sports"] },
  { label: "public life", setIds: ["places", "jobs"] },
  { label: "daily objects", setIds: ["tools", "places"] },
  { label: "outdoor places", setIds: ["places", "nature"] },
  { label: "human and nature", setIds: ["jobs", "nature"] },
];

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function sampleTwo<T>(items: readonly T[]) {
  const firstIndex = Math.floor(Math.random() * items.length);
  let secondIndex = Math.floor(Math.random() * (items.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;

  return [items[firstIndex], items[secondIndex]] as const;
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function combineTopicSourceMode(
  dictionarySource: TopicDictionarySource,
  pairDistance: TopicPairDistance,
): TopicSourceMode {
  if (dictionarySource === "curated-pairs" || dictionarySource === "llm" || dictionarySource === "proper-noun") {
    return dictionarySource;
  }
  return `${dictionarySource}-${pairDistance}`;
}

export function splitTopicSourceMode(mode: TopicSourceMode): {
  dictionarySource: TopicDictionarySource;
  pairDistance: TopicPairDistance;
} {
  if (mode === "ja-daily-near") return { dictionarySource: "ja-daily", pairDistance: "near" };
  if (mode === "ja-daily-balanced") return { dictionarySource: "ja-daily", pairDistance: "balanced" };
  if (mode === "ja-daily-wide") return { dictionarySource: "ja-daily", pairDistance: "wide" };
  if (mode === "en-common-near") return { dictionarySource: "en-common", pairDistance: "near" };
  if (mode === "en-common-balanced") return { dictionarySource: "en-common", pairDistance: "balanced" };
  if (mode === "en-common-wide") return { dictionarySource: "en-common", pairDistance: "wide" };

  return { dictionarySource: mode, pairDistance: "balanced" };
}

export function normalizeTopicSourceMode(value: unknown): TopicSourceMode {
  if (
    value === "ja-daily-near" ||
    value === "ja-daily-balanced" ||
    value === "ja-daily-wide" ||
    value === "en-common-near" ||
    value === "en-common-balanced" ||
    value === "en-common-wide" ||
    value === "curated-pairs" ||
    value === "llm" ||
    value === "proper-noun"
  ) {
    return value;
  }

  if (value === "ja-daily") return "ja-daily-balanced";
  if (value === "en-common") return "en-common-balanced";
  return "llm";
}

export function normalizeTopicDictionarySource(value: unknown): TopicDictionarySource {
  if (
    value === "ja-daily" ||
    value === "en-common" ||
    value === "curated-pairs" ||
    value === "llm" ||
    value === "proper-noun"
  ) {
    return value;
  }

  return splitTopicSourceMode(normalizeTopicSourceMode(value)).dictionarySource;
}

export function normalizeTopicPairDistance(value: unknown): TopicPairDistance {
  if (value === "near" || value === "balanced" || value === "wide") return value;
  return splitTopicSourceMode(normalizeTopicSourceMode(value)).pairDistance;
}

export function normalizeTopicWord(word: string) {
  return word.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getTopicWords(topic: Pick<WordWolfTopic, "villageWord" | "wolfWord">) {
  return [normalizeTopicWord(topic.villageWord), normalizeTopicWord(topic.wolfWord)].filter(Boolean);
}

export function normalizeGuess(word: string) {
  return normalizeTopicWord(word).replace(/[ 　・･、。,.!！?？]/g, "");
}

export function getTopicKey(topic: Pick<WordWolfTopic, "villageWord" | "wolfWord">) {
  return [normalizeTopicWord(topic.villageWord), normalizeTopicWord(topic.wolfWord)].sort().join("::");
}

export function isValidWordWolfTopic(topic: Pick<WordWolfTopic, "villageWord" | "wolfWord">) {
  const villageWord = normalizeTopicWord(topic.villageWord);
  const wolfWord = normalizeTopicWord(topic.wolfWord);

  return villageWord.length > 0 && wolfWord.length > 0 && villageWord !== wolfWord;
}

function pickFromCandidates(
  candidates: TopicCandidate[],
  excludeKeys: string[],
  excludeWords: string[] = [],
): WordWolfTopic {
  const excluded = new Set(excludeKeys);
  const excludedWords = new Set(excludeWords.map(normalizeTopicWord).filter(Boolean));
  const validCandidates = candidates.filter(isValidWordWolfTopic);
  const freshCandidates = validCandidates.filter(
    (topic) => !excluded.has(getTopicKey(topic)) && getTopicWords(topic).every((word) => !excludedWords.has(word)),
  );
  const fallbackExhausted = freshCandidates.length === 0;
  const pool = fallbackExhausted ? (validCandidates.length > 0 ? validCandidates : curatedPairTopics) : freshCandidates;
  const topic = randomItem(pool);
  return {
    ...topic,
    reason: fallbackExhausted ? `候補が尽きたため、使用済み候補を再利用しています。${topic.reason}` : topic.reason,
    source: "fallback",
    fallbackExhausted,
  };
}

function pickFreshFromCandidates(
  candidates: TopicCandidate[],
  excludeKeys: string[],
  excludeWords: string[] = [],
): WordWolfTopic | null {
  const excluded = new Set(excludeKeys);
  const excludedWords = new Set(excludeWords.map(normalizeTopicWord).filter(Boolean));
  const freshCandidates = candidates
    .filter(isValidWordWolfTopic)
    .filter((topic) => !excluded.has(getTopicKey(topic)) && getTopicWords(topic).every((word) => !excludedWords.has(word)));

  if (freshCandidates.length === 0) return null;

  const topic = randomItem(freshCandidates);
  return { ...topic, source: "fallback" };
}

function orderedFallbackDistances(pairDistance: TopicPairDistance): TopicPairDistance[] {
  return [
    pairDistance,
    ...(["near", "balanced", "wide"] as const).filter((distance) => distance !== pairDistance),
  ];
}

function normalizeHint(value: string) {
  return normalizeTopicWord(value).replace(/[ 　・･、。,.!！?？]/g, "");
}

function candidateMatchesHint(topic: TopicCandidate, hint: string) {
  const searchText = normalizeHint(`${topic.villageWord} ${topic.wolfWord} ${topic.reason}`);
  return searchText.includes(hint);
}

function uniqueCandidates(candidates: TopicCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((topic) => {
    const key = `${getTopicKey(topic)}:${topic.pairDistance ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getHintCandidates(localSource: TopicDictionarySource, topicHint: string) {
  const hint = normalizeHint(topicHint);
  if (!hint) return [];

  const explicitCandidates = hintTopicGroups
    .filter((group) => group.aliases.some((alias) => normalizeHint(alias).includes(hint) || hint.includes(normalizeHint(alias))))
    .flatMap((group) => group.candidates);
  const localCandidates = Object.values(localTopicDecks[localSource])
    .flat()
    .filter((topic) => candidateMatchesHint(topic, hint));

  return uniqueCandidates([...explicitCandidates, ...localCandidates]);
}

function pickHintedTopic(
  candidates: TopicCandidate[],
  pairDistance: TopicPairDistance,
  excludeKeys: string[],
  excludeWords: string[],
) {
  if (candidates.length === 0) return null;

  const strictTopic = orderedFallbackDistances(pairDistance)
    .map((distance) => pickFreshFromCandidates(candidates.filter((topic) => topic.pairDistance === distance), excludeKeys, excludeWords))
    .find((topic): topic is WordWolfTopic => Boolean(topic));

  if (strictTopic) return strictTopic;

  return null;
}

function makeNearCandidates(sets: readonly TopicSet[], dictionarySource: TopicDictionarySource) {
  const candidates: TopicCandidate[] = [];
  const pairDistance: TopicPairDistance = "near";

  for (const set of sets) {
    for (let index = 0; index < set.words.length; index += 1) {
      const villageWord = set.words[index];
      const wolfWord = set.words[(index + 1) % set.words.length];
      candidates.push({
        villageWord,
        wolfWord,
        reason: `${set.label}: 共通点が分かりやすい近い言葉だが、細かい場面や使い方が違う`,
        dictionarySource,
        pairDistance,
        sourceMode: combineTopicSourceMode(dictionarySource, pairDistance),
      });
    }
  }

  return candidates;
}

function makeWideCandidates(
  sets: readonly TopicSet[],
  groups: readonly TopicGroup[],
  dictionarySource: TopicDictionarySource,
) {
  const candidates: TopicCandidate[] = [];
  const setMap = new Map(sets.map((set) => [set.id, set]));
  const pairDistance: TopicPairDistance = "wide";

  for (const group of groups) {
    const groupSets = group.setIds.map((id) => setMap.get(id)).filter((set): set is TopicSet => Boolean(set));
    if (groupSets.length < 2) continue;

    const layerGroups = new Map<TopicLayer, TopicSet[]>();
    for (const set of groupSets) {
      layerGroups.set(set.layer, [...(layerGroups.get(set.layer) ?? []), set]);
    }

    const alignedSetGroups = [...layerGroups.values()].filter((setsInLayer) => setsInLayer.length >= 2);
    if (alignedSetGroups.length === 0) continue;

    const [firstSet, secondSet] = sampleTwo(randomItem(alignedSetGroups));
    const shuffledFirst = shuffle(firstSet.words);
    const shuffledSecond = shuffle(secondSet.words);
    const pairCount = Math.min(shuffledFirst.length, shuffledSecond.length, 4);

    for (let index = 0; index < pairCount; index += 1) {
      candidates.push({
        villageWord: shuffledFirst[index],
        wolfWord: shuffledSecond[index],
        reason: `${group.label}: 大きな共通文脈はあるが、分類や体験が違う`,
        dictionarySource,
        pairDistance,
        sourceMode: combineTopicSourceMode(dictionarySource, pairDistance),
      });
    }
  }

  return candidates;
}

function makeVeryWideCandidates(sets: readonly TopicSet[], dictionarySource: TopicDictionarySource) {
  const candidates: TopicCandidate[] = [];
  const pairDistance: TopicPairDistance = "wide";
  const setsByLayer = new Map<TopicLayer, TopicSet[]>();

  for (const set of sets) {
    setsByLayer.set(set.layer, [...(setsByLayer.get(set.layer) ?? []), set]);
  }

  for (const sameLayerSets of setsByLayer.values()) {
    if (sameLayerSets.length < 2) continue;

    for (let setIndex = 0; setIndex < sameLayerSets.length; setIndex += 1) {
      const firstSet = sameLayerSets[setIndex];
      const secondSet = sameLayerSets[(setIndex + 1) % sameLayerSets.length];
      if (firstSet.id === secondSet.id) continue;

      const shuffledFirst = shuffle(firstSet.words);
      const shuffledSecond = shuffle(secondSet.words);
      const pairCount = Math.min(shuffledFirst.length, shuffledSecond.length, 3);

      for (let index = 0; index < pairCount; index += 1) {
        candidates.push({
          villageWord: shuffledFirst[index],
          wolfWord: shuffledSecond[index],
          reason: `${firstSet.label} / ${secondSet.label}: 間に一つ共通語を置くとつながる広い関係`,
          dictionarySource,
          pairDistance,
          sourceMode: combineTopicSourceMode(dictionarySource, pairDistance),
        });
      }
    }
  }

  return candidates;
}

function asDistance(topics: readonly TopicCandidate[], pairDistance: TopicPairDistance) {
  return topics.map((topic) => ({
    ...topic,
    pairDistance,
    sourceMode: combineTopicSourceMode(topic.dictionarySource ?? "curated-pairs", pairDistance),
  }));
}

const localTopicDecks: Record<TopicDictionarySource, Record<TopicPairDistance, TopicCandidate[]>> = {
  "curated-pairs": {
    near: curatedNearPairTopics,
    balanced: asDistance(curatedWidePairTopics, "balanced"),
    wide: curatedWidePairTopics,
  },
  "ja-daily": {
    near: makeNearCandidates(jaDailySets, "ja-daily"),
    balanced: asDistance(makeWideCandidates(jaDailySets, jaDailyWideGroups, "ja-daily"), "balanced"),
    wide: makeVeryWideCandidates(jaDailySets, "ja-daily"),
  },
  "en-common": {
    near: makeNearCandidates(enCommonSets, "en-common"),
    balanced: asDistance(makeWideCandidates(enCommonSets, enCommonWideGroups, "en-common"), "balanced"),
    wide: makeVeryWideCandidates(enCommonSets, "en-common"),
  },
  llm: {
    near: makeNearCandidates(jaDailySets, "ja-daily"),
    balanced: asDistance(makeWideCandidates(jaDailySets, jaDailyWideGroups, "ja-daily"), "balanced"),
    wide: makeVeryWideCandidates(jaDailySets, "ja-daily"),
  },
  "proper-noun": {
    near: [...properNounNearPairTopics, ...additionalProperNounNearPairTopics],
    balanced: asDistance([...properNounWidePairTopics, ...additionalProperNounWidePairTopics], "balanced"),
    wide: [...properNounWidePairTopics, ...additionalProperNounWidePairTopics],
  },
};

export function pickFallbackTopic(
  excludeKeys: string[] = [],
  dictionarySource: TopicDictionarySource = "curated-pairs",
  pairDistance: TopicPairDistance = "balanced",
  excludeWords: string[] = [],
  topicHint = "",
): WordWolfTopic {
  const localSource = normalizeTopicDictionarySource(dictionarySource);
  const distance = normalizeTopicPairDistance(pairDistance);
  const hintedTopic = pickHintedTopic(getHintCandidates(localSource, topicHint), distance, excludeKeys, excludeWords);
  if (hintedTopic) return hintedTopic;

  const strictTopic = orderedFallbackDistances(distance)
    .map((candidateDistance) => pickFreshFromCandidates(localTopicDecks[localSource][candidateDistance], excludeKeys, excludeWords))
    .find((topic): topic is WordWolfTopic => Boolean(topic));

  if (strictTopic) return strictTopic;

  return pickFromCandidates(localTopicDecks[localSource][distance], excludeKeys, excludeWords);
}
