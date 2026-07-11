export type TopicDictionarySource = "ja-daily" | "en-common" | "curated-pairs" | "llm" | "proper-noun";
export type TopicPairDistance = "near" | "balanced" | "wide";

export type TopicSourceMode =
  | "ja-daily-near"
  | "ja-daily-balanced"
  | "ja-daily-wide"
  | "en-common-near"
  | "en-common-balanced"
  | "en-common-wide"
  | "curated-pairs"
  | "llm"
  | "proper-noun";

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

const properNounNearPairTopics: TopicCandidate[] = [
  { villageWord: "横浜ランドマークタワー", wolfWord: "あべのハルカス", reason: "有名な高層ビルだが、地域や施設の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "京都", wolfWord: "奈良", reason: "歴史ある観光地だが、街の規模や代表的な見どころが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "セブン-イレブン", wolfWord: "ローソン", reason: "有名なコンビニブランドだが、商品や店舗の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "読売ジャイアンツ", wolfWord: "阪神タイガース", reason: "有名なプロ野球チームだが、本拠地やファン文化が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "YouTube", wolfWord: "TikTok", reason: "動画サービスとして有名だが、視聴体験や投稿文化が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "iPhone", wolfWord: "Pixel", reason: "有名なスマートフォンだが、メーカーや使い心地が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "縄文時代", wolfWord: "弥生時代", reason: "学校で学ぶ日本史の時代区分だが、暮らしや文化の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "鎌倉幕府", wolfWord: "室町幕府", reason: "日本史で有名な武家政権だが、時代や政治の特徴が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "微分", wolfWord: "積分", reason: "数学で並んで学ぶ単元だが、扱う考え方や使いどころが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
];

const properNounBalancedPairTopics: TopicCandidate[] = [
  { villageWord: "箱根", wolfWord: "日光", reason: "有名な観光地だが、地域や旅の目的が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "任天堂", wolfWord: "ソニー", reason: "有名な日本企業だが、ゲームでの立ち位置や主力事業が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "週刊少年ジャンプ", wolfWord: "週刊少年マガジン", reason: "有名な漫画雑誌だが、連載作品や読者の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "鬼滅の刃", wolfWord: "呪術廻戦", reason: "近年有名な漫画作品だが、世界観や戦い方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "Amazon", wolfWord: "楽天市場", reason: "有名な通販サービスだが、買い物体験や運営の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "東京ディズニーランド", wolfWord: "ユニバーサル・スタジオ・ジャパン", reason: "有名なテーマパークだが、地域や作品の方向性が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "関ヶ原の戦い", wolfWord: "桶狭間の戦い", reason: "日本史で有名な合戦だが、時代背景や勝敗の語られ方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "大化の改新", wolfWord: "明治維新", reason: "日本史の大きな政治改革だが、時代や社会への影響が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "日米和親条約", wolfWord: "日米修好通商条約", reason: "幕末に学ぶ条約だが、内容や日本社会への影響が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "万有引力", wolfWord: "相対性理論", reason: "理科で触れる有名な物理の考え方だが、扱う現象や時代が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
];

const properNounWidePairTopics: TopicCandidate[] = [
  { villageWord: "Nintendo Switch", wolfWord: "PlayStation 5", reason: "有名なゲーム機だが、メーカーや遊ばれ方の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "トヨタ", wolfWord: "ホンダ", reason: "有名な自動車メーカーだが、ブランドイメージや得意分野が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "東京大学", wolfWord: "早稲田大学", reason: "有名な大学だが、設立背景や校風が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "スターバックス", wolfWord: "ドトール", reason: "有名なカフェチェーンだが、価格帯や店内の雰囲気が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "東海道新幹線", wolfWord: "山手線", reason: "有名な鉄道路線だが、移動距離や使う場面が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "紅白歌合戦", wolfWord: "M-1グランプリ", reason: "有名なテレビ番組・イベントだが、内容や楽しみ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "フランス革命", wolfWord: "産業革命", reason: "世界史で有名な変革だが、政治中心か経済・技術中心かが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "国際連盟", wolfWord: "国際連合", reason: "世界史・公民で学ぶ国際組織だが、成立時期や仕組みが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "古事記", wolfWord: "万葉集", reason: "国語や日本史で出る古典だが、内容の性格や読まれ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
];

const hintTopicGroups: Array<{
  aliases: readonly string[];
  candidates: readonly TopicCandidate[];
}> = [
  {
    aliases: ["将棋", "shogi"],
    candidates: [
      { villageWord: "飛車", wolfWord: "角行", reason: "将棋の大駒だが、動き方と使われ方が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "王将", wolfWord: "玉将", reason: "将棋の中心となる駒だが、呼び方や使われる場面の印象が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "居飛車", wolfWord: "振り飛車", reason: "将棋の戦型だが、飛車を置く場所と序盤の考え方が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "矢倉", wolfWord: "美濃囲い", reason: "将棋の囲いだが、形や相性のよい戦型が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "名人戦", wolfWord: "竜王戦", reason: "将棋の大きなタイトル戦だが、制度や序列の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
      { villageWord: "羽生善治", wolfWord: "藤井聡太", reason: "将棋で非常に有名な棋士だが、活躍した時代や語られ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
    ],
  },
  {
    aliases: ["歴史", "日本史", "世界史", "社会", "勉強", "学習", "受験", "テスト"],
    candidates: [
      ...properNounNearPairTopics.slice(-3),
      ...properNounBalancedPairTopics.slice(-4),
      ...properNounWidePairTopics.slice(-3),
    ],
  },
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

  return pickFromCandidates(candidates, excludeKeys, excludeWords);
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
  "proper-noun": {
    near: properNounNearPairTopics,
    balanced: properNounBalancedPairTopics,
    wide: properNounWidePairTopics,
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
