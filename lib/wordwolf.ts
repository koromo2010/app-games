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

const additionalProperNounNearPairTopics: TopicCandidate[] = [
  { villageWord: "早稲田大学", wolfWord: "慶應義塾大学", reason: "有名な私立大学だが、校風やイメージが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "東京駅", wolfWord: "新宿駅", reason: "東京の代表的な駅だが、街の性格や使われ方が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "東京タワー", wolfWord: "東京スカイツリー", reason: "東京の有名な電波塔だが、時代や眺めの印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "伊勢神宮", wolfWord: "出雲大社", reason: "有名な神社だが、地域や信仰のイメージが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "東大寺", wolfWord: "法隆寺", reason: "奈良の有名な寺院だが、建物や歴史の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "織田信長", wolfWord: "豊臣秀吉", reason: "戦国時代の有名人物だが、出自や統一への関わり方が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "紫式部", wolfWord: "清少納言", reason: "平安文学で有名な人物だが、作品や作風の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "夏目漱石", wolfWord: "芥川龍之介", reason: "近代文学の有名作家だが、作品の雰囲気や時代の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "源氏物語", wolfWord: "枕草子", reason: "古典で有名な作品だが、物語と随筆で読み味が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "古墳時代", wolfWord: "飛鳥時代", reason: "日本史の時代区分だが、政治や文化の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "DNA", wolfWord: "RNA", reason: "生物で学ぶ遺伝に関わる用語だが、役割や構造の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "光合成", wolfWord: "呼吸", reason: "生物で学ぶエネルギーに関わる働きだが、向きや場面が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "英検", wolfWord: "TOEIC", reason: "英語力を測る試験だが、対象や使われ方が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "Windows", wolfWord: "macOS", reason: "有名なPC用OSだが、メーカーや操作感が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "Slack", wolfWord: "Discord", reason: "コミュニケーションツールだが、仕事寄りかコミュニティ寄りかの印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "LINE", wolfWord: "Instagram", reason: "身近なスマホアプリだが、会話中心か投稿中心かが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "Netflix", wolfWord: "Amazon Prime Video", reason: "動画配信サービスだが、作品の探し方やサービス全体の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "ピカチュウ", wolfWord: "イーブイ", reason: "ポケモンで有名なキャラクターだが、見た目や進化の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "マリオ", wolfWord: "ルイージ", reason: "任天堂の有名キャラクターだが、主役感やキャラクター性が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "ドラえもん", wolfWord: "アンパンマン", reason: "国民的キャラクターだが、作品世界や助け方の印象が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "山手線", wolfWord: "大阪環状線", reason: "都市を環状に走る有名路線だが、地域や使われ方が違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
  { villageWord: "札幌市", wolfWord: "仙台市", reason: "地方の中心都市だが、気候や街のイメージが違う", dictionarySource: "proper-noun", pairDistance: "near", sourceMode: "proper-noun" },
];

const additionalProperNounBalancedPairTopics: TopicCandidate[] = [
  { villageWord: "徳川家康", wolfWord: "豊臣秀吉", reason: "天下統一に関わる有名人物だが、政権の作り方や人物像が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "源頼朝", wolfWord: "足利尊氏", reason: "幕府を開いた人物だが、時代や武士政権の性格が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "西郷隆盛", wolfWord: "坂本龍馬", reason: "幕末維新期の有名人物だが、立場や行動の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ペリー", wolfWord: "マッカーサー", reason: "日本史で学ぶ外国人だが、関わった時代と影響が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ナポレオン", wolfWord: "カエサル", reason: "世界史で有名な軍事・政治指導者だが、時代や国家の背景が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ガリレオ", wolfWord: "ニュートン", reason: "科学史で有名な人物だが、扱った現象や功績の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "エジソン", wolfWord: "ライト兄弟", reason: "発明で有名な人物だが、電気と飛行で分野が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "地動説", wolfWord: "進化論", reason: "科学史で有名な考え方だが、宇宙観と生命観で分野が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "確率", wolfWord: "統計", reason: "数学で関係する単元だが、予測とデータ整理で使い方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "方程式", wolfWord: "関数", reason: "数学でよく出る単元だが、未知数を解く考え方と対応関係を見る考え方で違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "平安時代", wolfWord: "江戸時代", reason: "日本史の時代区分だが、政治や文化の中心が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "江戸幕府", wolfWord: "明治政府", reason: "日本の政治体制だが、身分制中心か近代国家形成かが違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "松尾芭蕉", wolfWord: "与謝蕪村", reason: "俳句で有名な人物だが、作風や時代の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "平家物語", wolfWord: "徒然草", reason: "古典で学ぶ作品だが、軍記物と随筆で性格が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "北海道", wolfWord: "沖縄県", reason: "観光地として有名な地域だが、気候や文化の印象が大きく違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "札幌", wolfWord: "福岡", reason: "地方の大都市だが、地域性や食文化の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "大阪城", wolfWord: "姫路城", reason: "有名な城だが、歴史背景や建物の見られ方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "甲子園球場", wolfWord: "東京ドーム", reason: "野球で有名な球場だが、雰囲気や使われ方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "ドラゴンクエスト", wolfWord: "ファイナルファンタジー", reason: "有名なRPGシリーズだが、世界観や遊び心地が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "スプラトゥーン", wolfWord: "フォートナイト", reason: "対戦ゲームとして有名だが、画面の印象や勝ち方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "iPad", wolfWord: "Surface", reason: "有名なタブレット端末だが、用途やメーカーの印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "名人戦", wolfWord: "王将戦", reason: "将棋のタイトル戦だが、制度や注目され方が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "棋聖戦", wolfWord: "王位戦", reason: "将棋のタイトル戦だが、開催時期や番勝負の印象が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
  { villageWord: "NHK", wolfWord: "日本テレビ", reason: "有名なテレビ局だが、公共放送と民放で立ち位置が違う", dictionarySource: "proper-noun", pairDistance: "balanced", sourceMode: "proper-noun" },
];

const additionalProperNounWidePairTopics: TopicCandidate[] = [
  { villageWord: "ローマ帝国", wolfWord: "モンゴル帝国", reason: "世界史で有名な大帝国だが、地域や拡大の仕方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "大航海時代", wolfWord: "ルネサンス", reason: "世界史で重要な時代の動きだが、海洋進出と文化復興で焦点が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "第一次世界大戦", wolfWord: "第二次世界大戦", reason: "世界史で有名な大戦だが、原因や戦後体制の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "冷戦", wolfWord: "キューバ危機", reason: "現代史で学ぶ国際対立だが、長期構造と具体的事件で違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "アメリカ独立宣言", wolfWord: "フランス人権宣言", reason: "近代史で有名な宣言だが、背景となる革命や内容の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "資本主義", wolfWord: "社会主義", reason: "社会科で学ぶ経済・政治の考え方だが、重視する仕組みが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "国会", wolfWord: "最高裁判所", reason: "公民で学ぶ国家機関だが、立法と司法で役割が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "日本国憲法", wolfWord: "民法", reason: "法律として有名だが、国家の基本ルールと生活上の権利関係で違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "需要", wolfWord: "供給", reason: "経済で対になる考え方だが、買う側と売る側で視点が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "インフレ", wolfWord: "デフレ", reason: "経済で学ぶ物価の動きだが、上昇と下落で社会への影響が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "プレートテクトニクス", wolfWord: "火山活動", reason: "地学で学ぶ現象だが、地球の大きな仕組みと具体的な活動で違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "太陽系", wolfWord: "銀河系", reason: "宇宙で学ぶまとまりだが、スケールが大きく違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "元素周期表", wolfWord: "化学反応式", reason: "化学でよく見るものだが、元素の整理と反応の表現で役割が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "平安京", wolfWord: "平城京", reason: "古代日本の都だが、時代や街のイメージが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "シルクロード", wolfWord: "万里の長城", reason: "世界史・地理で有名な中国周辺の用語だが、交易路と防衛施設で違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "ナイル川", wolfWord: "アマゾン川", reason: "世界地理で有名な大河だが、地域や自然環境が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "太平洋", wolfWord: "大西洋", reason: "世界の大洋だが、接する地域や歴史上のイメージが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "ノーベル賞", wolfWord: "アカデミー賞", reason: "世界的に有名な賞だが、学術・平和と映画で分野が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "オリンピック", wolfWord: "FIFAワールドカップ", reason: "世界的なスポーツ大会だが、競技数や盛り上がり方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "WBC", wolfWord: "FIFAワールドカップ", reason: "国代表のスポーツ大会だが、野球とサッカーで文化が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "YouTube", wolfWord: "ニコニコ動画", reason: "動画サービスとして有名だが、文化やコメント体験が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "GitHub", wolfWord: "Stack Overflow", reason: "開発者が使う有名サービスだが、コード管理と質問回答で役割が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "ChatGPT", wolfWord: "Gemini", reason: "有名なAIサービスだが、提供元や使われ方の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
  { villageWord: "京都大学", wolfWord: "東京大学", reason: "有名な国立大学だが、地域や校風のイメージが違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
];

const hintTopicGroups: Array<{
  aliases: readonly string[];
  candidates: readonly TopicCandidate[];
}> = [
  {
    aliases: ["将棋", "shogi"],
    candidates: [
      { villageWord: "歩", wolfWord: "香車", reason: "将棋の駒だが、動き方と使い方が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "桂馬", wolfWord: "銀将", reason: "将棋の駒だが、動き方や攻め方の印象が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "金将", wolfWord: "銀将", reason: "将棋の金駒だが、守りや攻めでの使われ方が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "飛車", wolfWord: "角行", reason: "将棋の大駒だが、動き方と使われ方が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "王将", wolfWord: "玉将", reason: "将棋の中心となる駒だが、呼び方や使われる場面の印象が違う", dictionarySource: "curated-pairs", pairDistance: "near", sourceMode: "curated-pairs" },
      { villageWord: "居飛車", wolfWord: "振り飛車", reason: "将棋の戦型だが、飛車を置く場所と序盤の考え方が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "矢倉", wolfWord: "美濃囲い", reason: "将棋の囲いだが、形や相性のよい戦型が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "王手", wolfWord: "詰み", reason: "将棋の終盤で出る言葉だが、危機の段階と終了条件で違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "定跡", wolfWord: "手筋", reason: "将棋の上達で使う言葉だが、序盤の型と局面の技で違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "棋譜", wolfWord: "感想戦", reason: "対局後に関わる言葉だが、記録と振り返りで役割が違う", dictionarySource: "curated-pairs", pairDistance: "balanced", sourceMode: "curated-pairs" },
      { villageWord: "詰将棋", wolfWord: "次の一手", reason: "将棋の問題形式だが、終盤の詰みと局面判断で違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
      { villageWord: "持ち駒", wolfWord: "成駒", reason: "将棋の駒に関わる仕組みだが、手元の駒と成った駒で違う", dictionarySource: "curated-pairs", pairDistance: "wide", sourceMode: "curated-pairs" },
      { villageWord: "名人戦", wolfWord: "竜王戦", reason: "将棋の大きなタイトル戦だが、制度や序列の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
      { villageWord: "叡王戦", wolfWord: "棋王戦", reason: "将棋のタイトル戦だが、歴史や開催形式の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
      { villageWord: "羽生善治", wolfWord: "藤井聡太", reason: "将棋で非常に有名な棋士だが、活躍した時代や語られ方が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
      { villageWord: "渡辺明", wolfWord: "佐藤天彦", reason: "将棋の有名棋士だが、棋風やタイトル歴の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
      { villageWord: "森内俊之", wolfWord: "谷川浩司", reason: "将棋の有名棋士だが、世代や語られ方の印象が違う", dictionarySource: "proper-noun", pairDistance: "wide", sourceMode: "proper-noun" },
    ],
  },
  {
    aliases: ["歴史", "日本史", "世界史", "社会", "勉強", "学習", "受験", "テスト", "学校", "教科"],
    candidates: [
      ...properNounNearPairTopics.slice(-3),
      ...properNounBalancedPairTopics.slice(-4),
      ...properNounWidePairTopics.slice(-3),
      ...additionalProperNounNearPairTopics.filter((topic) => /時代|時|文学|物語|枕草子|DNA|RNA|光合成|呼吸|英検|TOEIC/.test(`${topic.villageWord}${topic.wolfWord}${topic.reason}`)),
      ...additionalProperNounBalancedPairTopics.filter((topic) => /史|時代|幕府|人物|科学|数学|俳句|古典|大学/.test(`${topic.villageWord}${topic.wolfWord}${topic.reason}`)),
      ...additionalProperNounWidePairTopics.filter((topic) => /世界史|公民|法律|経済|地学|宇宙|化学|地理|大学/.test(`${topic.villageWord}${topic.wolfWord}${topic.reason}`)),
    ],
  },
  {
    aliases: ["理科", "科学", "物理", "化学", "生物", "地学", "数学", "算数"],
    candidates: [
      ...properNounNearPairTopics.filter((topic) => /微分|積分/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...properNounBalancedPairTopics.filter((topic) => /万有引力|相対性理論/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounNearPairTopics.filter((topic) => /DNA|RNA|光合成|呼吸/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounBalancedPairTopics.filter((topic) => /ガリレオ|ニュートン|エジソン|ライト兄弟|地動説|進化論|確率|統計|方程式|関数/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounWidePairTopics.filter((topic) => /プレートテクトニクス|火山活動|太陽系|銀河系|元素周期表|化学反応式/.test(`${topic.villageWord}${topic.wolfWord}`)),
    ],
  },
  {
    aliases: ["ゲーム", "任天堂", "ポケモン", "マリオ", "RPG", "switch", "スイッチ"],
    candidates: [
      ...properNounWidePairTopics.filter((topic) => /Nintendo|PlayStation/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounNearPairTopics.filter((topic) => /ピカチュウ|イーブイ|マリオ|ルイージ/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounBalancedPairTopics.filter((topic) => /ドラゴンクエスト|ファイナルファンタジー|スプラトゥーン|フォートナイト/.test(`${topic.villageWord}${topic.wolfWord}`)),
    ],
  },
  {
    aliases: ["IT", "アプリ", "SNS", "動画", "AI", "パソコン", "スマホ", "開発"],
    candidates: [
      ...properNounNearPairTopics.filter((topic) => /YouTube|TikTok|iPhone|Pixel/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounNearPairTopics.filter((topic) => /Windows|macOS|Slack|Discord|LINE|Instagram|Netflix|Amazon Prime Video/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounWidePairTopics.filter((topic) => /YouTube|ニコニコ動画|GitHub|Stack Overflow|ChatGPT|Gemini/.test(`${topic.villageWord}${topic.wolfWord}`)),
    ],
  },
  {
    aliases: ["地理", "旅行", "観光", "都市", "駅", "鉄道", "路線"],
    candidates: [
      ...properNounNearPairTopics.filter((topic) => /京都|奈良|横浜ランドマークタワー|あべのハルカス/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...properNounBalancedPairTopics.filter((topic) => /箱根|日光|東京ディズニーランド|ユニバーサル/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...properNounWidePairTopics.filter((topic) => /東海道新幹線|山手線/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounNearPairTopics.filter((topic) => /東京駅|新宿駅|東京タワー|東京スカイツリー|山手線|大阪環状線|札幌市|仙台市/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounBalancedPairTopics.filter((topic) => /北海道|沖縄県|札幌|福岡|大阪城|姫路城/.test(`${topic.villageWord}${topic.wolfWord}`)),
      ...additionalProperNounWidePairTopics.filter((topic) => /ナイル川|アマゾン川|太平洋|大西洋|平安京|平城京/.test(`${topic.villageWord}${topic.wolfWord}`)),
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
    near: [...properNounNearPairTopics, ...additionalProperNounNearPairTopics],
    balanced: [...properNounBalancedPairTopics, ...additionalProperNounBalancedPairTopics],
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
