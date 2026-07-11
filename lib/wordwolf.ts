export type TopicDictionarySource = "ja-daily" | "en-common" | "curated-pairs" | "llm";
export type TopicPairDistance = "near" | "balanced" | "wide";

export type TopicSourceMode =
  | "ja-daily-near"
  | "ja-daily-balanced"
  | "ja-daily-wide"
  | "en-common-near"
  | "en-common-balanced"
  | "en-common-wide"
  | "curated-pairs"
  | "llm";

export type WordWolfTopic = {
  villageWord: string;
  wolfWord: string;
  reason: string;
  source: "llm" | "fallback";
  dictionarySource?: TopicDictionarySource;
  pairDistance?: TopicPairDistance;
  sourceMode?: TopicSourceMode;
};

type TopicCandidate = Omit<WordWolfTopic, "source">;

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

const jaDailySets: TopicSet[] = [
  { id: "food", label: "日本語日常: 食べ物", layer: "object", words: ["カレー", "ラーメン", "ピザ", "寿司", "天ぷら", "弁当", "サンドイッチ", "お好み焼き", "牛丼", "焼肉"] },
  { id: "outing", label: "日本語日常: 外出先", layer: "place", words: ["映画館", "図書館", "本屋", "水族館", "動物園", "美術館", "温泉", "ホテル", "カラオケ", "ゲームセンター"] },
  { id: "transport", label: "日本語日常: 移動", layer: "object", words: ["電車", "バス", "タクシー", "自転車", "新幹線", "飛行機", "駅", "空港", "レンタカー", "フェリー"] },
  { id: "home", label: "日本語日常: 暮らし", layer: "object", words: ["冷蔵庫", "洗濯機", "掃除機", "電子レンジ", "エアコン", "テレビ", "財布", "鍵", "傘", "カレンダー"] },
  { id: "work", label: "日本語日常: 学校・仕事", layer: "activity", words: ["宿題", "会議", "資料", "発表", "ノート", "メール", "名刺", "教科書", "面接", "締切"] },
  { id: "drink", label: "日本語日常: 飲み物", layer: "object", words: ["コーヒー", "紅茶", "緑茶", "ジュース", "牛乳", "炭酸水", "味噌汁", "スープ", "水", "スポーツドリンク"] },
];

const jaDailyWideGroups: TopicGroup[] = [
  { label: "日常レジャー", setIds: ["food", "outing"] },
  { label: "生活と移動", setIds: ["transport", "home"] },
  { label: "仕事と休憩", setIds: ["work", "drink"] },
  { label: "外出全般", setIds: ["outing", "transport"] },
  { label: "家と食事", setIds: ["home", "food"] },
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
  if (dictionarySource === "curated-pairs" || dictionarySource === "llm") return dictionarySource;
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
    value === "llm"
  ) {
    return value;
  }

  if (value === "ja-daily") return "ja-daily-balanced";
  if (value === "en-common") return "en-common-balanced";
  return "curated-pairs";
}

export function normalizeTopicDictionarySource(value: unknown): TopicDictionarySource {
  if (value === "ja-daily" || value === "en-common" || value === "curated-pairs" || value === "llm") {
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
  const unusedPairCandidates = validCandidates.filter((topic) => !excluded.has(getTopicKey(topic)));
  const pool =
    freshCandidates.length > 0
      ? freshCandidates
      : unusedPairCandidates.length > 0
        ? unusedPairCandidates
        : validCandidates.length > 0
          ? validCandidates
          : curatedPairTopics;
  const topic = randomItem(pool);
  return { ...topic, source: "fallback" };
}

function makeBalancedCandidates(sets: readonly TopicSet[], dictionarySource: TopicDictionarySource) {
  const candidates: TopicCandidate[] = [];
  const pairDistance: TopicPairDistance = "balanced";

  for (const set of sets) {
    for (let index = 0; index < set.words.length; index += 1) {
      const villageWord = set.words[index];
      const wolfWord = set.words[(index + 2) % set.words.length];
      candidates.push({
        villageWord,
        wolfWord,
        reason: `${set.label}: 同じカテゴリに入る言葉だが、場面や使い方が少し違う`,
        dictionarySource,
        pairDistance,
        sourceMode: combineTopicSourceMode(dictionarySource, pairDistance),
      });
    }
  }

  return candidates;
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
        reason: `${set.label}: かなり近いカテゴリに入る言葉だが、細かい場面や使い方が違う`,
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

const localTopicDecks: Record<TopicDictionarySource, Record<TopicPairDistance, TopicCandidate[]>> = {
  "curated-pairs": {
    near: curatedNearPairTopics,
    balanced: curatedPairTopics,
    wide: curatedWidePairTopics,
  },
  "ja-daily": {
    near: makeNearCandidates(jaDailySets, "ja-daily"),
    balanced: makeBalancedCandidates(jaDailySets, "ja-daily"),
    wide: makeWideCandidates(jaDailySets, jaDailyWideGroups, "ja-daily"),
  },
  "en-common": {
    near: makeNearCandidates(enCommonSets, "en-common"),
    balanced: makeBalancedCandidates(enCommonSets, "en-common"),
    wide: makeWideCandidates(enCommonSets, enCommonWideGroups, "en-common"),
  },
  llm: {
    near: makeNearCandidates(jaDailySets, "ja-daily"),
    balanced: makeBalancedCandidates(jaDailySets, "ja-daily"),
    wide: makeWideCandidates(jaDailySets, jaDailyWideGroups, "ja-daily"),
  },
};

export function pickFallbackTopic(
  excludeKeys: string[] = [],
  dictionarySource: TopicDictionarySource = "curated-pairs",
  pairDistance: TopicPairDistance = "balanced",
  excludeWords: string[] = [],
): WordWolfTopic {
  const localSource = dictionarySource === "llm" ? "llm" : normalizeTopicDictionarySource(dictionarySource);
  const distance = normalizeTopicPairDistance(pairDistance);

  return pickFromCandidates(localTopicDecks[localSource][distance], excludeKeys, excludeWords);
}
