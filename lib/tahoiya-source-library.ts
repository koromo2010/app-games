export type TahoiyaSourceEntry = {
  id: string;
  word: string;
  reading?: string;
  hint: string;
  genre: string;
  sourceLibrary: string;
  sourceUrl: string;
};

const source = (
  id: string,
  word: string,
  reading: string,
  hint: string,
  genre: string,
  sourceLibrary: string,
  sourceUrl: string,
): TahoiyaSourceEntry => ({ id, word, reading, hint, genre, sourceLibrary, sourceUrl });

// This is a source shelf, not the playable catalog. Entries become playable only
// after an LLM verifies their existence/meaning and assigns an absolute difficulty.
export const tahoiyaSourceLibrary: TahoiyaSourceEntry[] = [
  source("hist-inuoumono", "犬追物", "いぬおうもの", "騎射の武芸", "日本史・武芸", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("hist-chosan", "逃散", "ちょうさん", "農民の集団的抵抗", "日本史・社会史", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("hist-kendengaku", "検田使", "けんでんし", "中世の土地調査", "日本史・制度史", "NDL", "https://www.ndl.go.jp/"),
  source("hist-shikimoku", "式目", "しきもく", "中世の法規", "日本史・法制史", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("hist-gekokujou", "下剋上", "げこくじょう", "身分秩序の逆転", "日本史", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("med-shikkou", "失行", "しっこう", "目的動作の障害", "医学・神経学", "NLM MeSH", "https://meshb.nlm.nih.gov/"),
  source("med-shichounetsu", "弛張熱", "しちょうねつ", "体温変動の熱型", "医学・診断学", "NLM / JMdict", "https://www.nlm.nih.gov/"),
  source("med-kochou", "鼓腸", "こちょう", "消化器の症候", "医学・消化器学", "NLM MeSH", "https://meshb.nlm.nih.gov/"),
  source("med-chia-noze", "チアノーゼ", "ちあのーぜ", "皮膚や粘膜の色調変化", "医学・症候学", "NLM MeSH", "https://meshb.nlm.nih.gov/"),
  source("med-jokuso", "褥瘡", "じょくそう", "圧迫による皮膚障害", "医学・看護", "NLM MeSH", "https://meshb.nlm.nih.gov/"),
  source("arch-entablature", "エンタブラチュア", "えんたぶらちゅあ", "古典建築の上部構造", "建築史", "Getty AAT", "https://vocab.getty.edu/"),
  source("arch-spandrel", "スパンドレル", "すぱんどれる", "アーチ周辺の建築部分", "建築・美術", "Getty AAT", "https://vocab.getty.edu/"),
  source("arch-triforium", "トリフォリウム", "とりふぉりうむ", "教会堂内部の通廊", "建築史", "Getty AAT", "https://vocab.getty.edu/"),
  source("art-grisaille", "グリザイユ", "ぐりざいゆ", "単色系の絵画技法", "美術史", "Getty AAT", "https://vocab.getty.edu/"),
  source("art-anamorphosis", "アナモルフォーシス", "あなもるふぉーしす", "歪像の表現技法", "美術史", "Getty AAT", "https://vocab.getty.edu/"),
  source("music-hemiola", "ヘミオラ", "へみおら", "拍節を変化させるリズム", "音楽理論", "JMdict", "https://www.edrdg.org/"),
  source("music-organa", "オルガヌム", "おるがぬむ", "中世西洋の多声音楽", "音楽史", "JMdict / NDL", "https://www.edrdg.org/"),
  source("music-isorhythm", "イソリズム", "いそりずむ", "中世音楽の作曲技法", "音楽理論", "NDL", "https://www.ndl.go.jp/"),
  source("bot-takuyou", "托葉", "たくよう", "葉柄基部の付属物", "植物学", "JMdict", "https://www.edrdg.org/"),
  source("bot-houshiunou", "胞子嚢", "ほうしのう", "胞子を形成する器官", "植物学・菌類学", "JMdict", "https://www.edrdg.org/"),
  source("bot-mukago", "零余子", "むかご", "栄養繁殖に使われる芽", "植物学", "JMdict", "https://www.edrdg.org/"),
  source("bot-tokusa", "木賊", "とくさ", "研磨にも使われた植物", "植物学・民俗", "JMdict", "https://www.edrdg.org/"),
  source("zoo-ukibukuro", "鰾", "うきぶくろ", "魚類の浮力器官", "動物学", "JMdict", "https://www.edrdg.org/"),
  source("zoo-radula", "歯舌", "しぜつ", "軟体動物の摂食器官", "動物学", "JMdict", "https://www.edrdg.org/"),
  source("buddh-rinzou", "輪蔵", "りんぞう", "回転式の経典書架", "仏教・建築", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("buddh-zushi", "厨子", "ずし", "像などを安置する小型の建物状容器", "仏教美術", "Getty AAT / JMdict", "https://vocab.getty.edu/"),
  source("folk-mogaribue", "虎落笛", "もがりぶえ", "冬の風が作る音", "民俗・季語", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("folk-mukabaki", "行縢", "むかばき", "脚を保護する古い装具", "民俗・服飾", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("folk-kougai", "笄", "こうがい", "髪に挿す細長い道具", "服飾史", "Getty AAT / JMdict", "https://vocab.getty.edu/"),
  source("geo-yardang", "ヤルダン", "やるだん", "風食でできる地形", "地形学", "Getty TGN / NDL", "https://vocab.getty.edu/"),
  source("geo-solifluction", "ソリフラクション", "そりふらくしょん", "寒冷地の土壌移動", "地形学", "NDL", "https://www.ndl.go.jp/"),
  source("geo-kame", "カメ", "かめ", "氷河堆積物による丘", "地形学", "Getty TGN", "https://vocab.getty.edu/"),
  source("archae-cahokia", "カホキア", "かほきあ", "北米の先住民都市遺跡", "考古学", "Getty TGN", "https://vocab.getty.edu/"),
  source("archae-chatal", "チャタル・ヒュユク", "ちゃたる・ひゅゆく", "新石器時代の集落遺跡", "考古学", "Getty TGN", "https://vocab.getty.edu/"),
  source("astr-analemma", "アナレンマ", "あなれんま", "太陽位置の年間軌跡", "天文学", "NDL", "https://www.ndl.go.jp/"),
  source("astr-occultation", "掩蔽", "えんぺい", "天体が別の天体を隠す現象", "天文学", "JMdict / NDL", "https://www.edrdg.org/"),
  source("lit-honkadori", "本歌取り", "ほんかどり", "古歌を踏まえる和歌技法", "文学史", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("lit-engo", "縁語", "えんご", "関連語を配する和歌技法", "文学史", "JMdict / NDL", "https://www.ndl.go.jp/"),
  source("phil-epoche", "エポケー", "えぽけー", "判断を保留する哲学的方法", "哲学", "NDL", "https://www.ndl.go.jp/"),
  source("print-incunabula", "インキュナブラ", "いんきゅなぶら", "活版印刷初期の刊本", "書誌学", "Getty AAT / NDL", "https://vocab.getty.edu/"),
];
