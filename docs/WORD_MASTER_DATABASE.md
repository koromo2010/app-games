# 共通ワードマスターDB

最終更新: 2026-07-19

## この段階の目的

共通語彙をPostgreSQL（Neon）へ置くための土台と、Docker上のローカル検証用取込を作る。既存のワードウルフ・たほい屋の出題経路、Redisカタログ、既出判定はこの段階では変更しない。したがってローカル初期化・取込の成否は本番ゲームに影響しない。

実装:

- スキーマ: `lib/word-master-schema.ts`
- 初期化: `npm run word-db:init`
- ローカルDB: `compose.yaml`、`docs/LOCAL_WORD_DATABASE.md`
- ローカル取込: `scripts/import-word-master.py`
- JMdict四字熟語原本取込: `scripts/import-jmdict-source.py`
- JMdict全件統合取込: `scripts/import-jmdict-all.py`
- ローカル依存: `requirements/word-master.txt`
- SudachiDict変換: `scripts/prepare-sudachidict-core.py`
- 外国人名照合: `scripts/enrich-wikidata-person-names.py`
- 固定版マニフェスト: `config/word-sources/sudachidict-core-20260428.json`

## 正本と責務

| 対象 | この移行後の正本 | 移行前／一時状態 |
| --- | --- | --- |
| 単語、品詞、読み、Zipf、出典 | PostgreSQL `words` | ローカル検証済み。本番は未登録 |
| ゲーム別可否・難易度 | PostgreSQL `game_word_settings` | 現行ゲームのRedis判定は維持 |
| たほい屋語釈・ライセンス確認 | PostgreSQL `word_definitions` | Redisカタログ内の短い説明 |
| たほい屋既出 | PostgreSQL `user_seen_tahoiya_words` | 現在は候補JSON中の `experiencedPlayerIds` |
| ワードウルフのペア在庫・評価 | PostgreSQL `wordwolf_pairs` | 現在はRedisカタログ |
| ワードウルフ日次・30日履歴 | 後続段階でPostgreSQLへ移行可否を判断 | 現在のRedis v3履歴を維持 |
| ルーム、時計、ロック | Redis | 継続 |

## 初期化

このスキーマはデプロイだけでは作成されない。PostgreSQL接続情報のある開発環境または運用環境で明示的に実行する。

```bash
npm run word-db:init
```

環境変数は既存の `DATABASE_URL`、`database_DATABASE_URL`、`database_POSTGRES_URL`、`POSTGRES_URL` のいずれかを使う。初期化は冪等であり、`pgvector` 拡張とテーブル・索引を `IF NOT EXISTS` で作成する。

`words.embedding` は次の段階でモデルを一つに決めて登録するまで空のままにする。型は無次元の `vector` とし、モデル別のANN索引は次の段階で `embedding_model` と次元を固定して追加する。これにより、モデル未決定のまま全単語を再埋め込みする事故を避ける。

### ローカル検証環境

本番Neonの無料枠を消費せずに辞書全件を処理するため、Dockerで固定版のPostgreSQL 16とpgvector 0.8.2を起動できる。起動、停止、初期化、Git対象外ファイルの扱いは `docs/LOCAL_WORD_DATABASE.md` を正本とする。

ローカルDBを候補生成・分類・審査の作業場所とし、当面は各ゲームで採用した単語、語釈、ペアだけをNeonへ同期する。将来DB全体を移行する場合も、辞書原本、CSV、DBダンプをGitへコミットしない。

## 初回取込

取込は本番サーバーではなくローカルのPythonで行う。辞書全件やwordfreqの結果をGitへコミットしない。

```bash
python -m venv .venv-word-master
. .venv-word-master/bin/activate
pip install -r requirements/word-master.txt

python scripts/import-word-master.py \
  --database-url "$DATABASE_URL" \
  --source-key sudachidict-core \
  --source-name "SudachiDict Core" \
  --source-version "<確認した版>" \
  --source-url "<一次配布元URL>" \
  --license "<確認したライセンス>" \
  --attribution "<ライセンス指定の帰属表示>" \
  --input /outside-repository/sudachidict-core.normalized.csv
```

Windowsでは仮想環境の有効化を `.venv-word-master\\Scripts\\Activate.ps1` に読み替える。

### 正規化CSVの契約

必須列:

```text
source_entry_id,surface,reading,primary_part_of_speech
```

任意列:

```text
normalized_form,part_of_speech_details,proper_noun_status,proper_noun_type
```

`source_entry_id` はその辞書版の中で安定したIDにする。行番号やランダムUUIDを使わない。SudachiDict Coreは20260428版に固定し、専用アダプタが公式19列CSVを検証して正規化CSVへ変換する。配布URL、SHA-256、ライセンス、帰属は固定版マニフェストを正本とし、インポーターは版・ライセンス・帰属を `word_sources` に保存する。具体的な取得・変換・取込コマンドと検証済み件数は `docs/LOCAL_WORD_DATABASE.md` を参照する。

`wordfreq.zipf_frequency(surface, "ja")` はローカル実行だけで計算する。Zipf値は再計算可能な客観メタデータとして保存し、利用者評価では更新しない。

### 出典固有エントリーの保持

正規化CSVは共通語彙へ載せるための投影であり、辞書原本の代替にはしない。JMdictのように一つのエントリーが複数の表記・読み・語義を持つ出典は、`word_source_entries`へ出典側の安定ID単位で完全なエントリーをJSONB保存する。`word_source_entry_links`が共通`words`行との多対多関係を保持する。

JMdict取込では`ent_seq`を出典側IDに使い、`k_ele`、`r_ele`、`sense`以下の全子要素、繰り返し、XML属性を`entry_payload`へ保存する。既知フィールドだけを列挙して捨てる方式にはせず、将来追加されたタグも同じ変換で保持する。表記・読みの共通投影と出典原本は別責務とし、同じJMdictエントリーを複数の`words`行から参照できる。

全件統合ではNFKC正規化後の表記が現行`words.normalized_form`と完全一致する場合、SudachiDict Coreを優先して既存IDへJMdictエントリーをリンクする。読みや品詞の違いだけでは新規IDを作らない。一致しない表記だけを`jmdict`出典の新しい`words.id`として追番し、実測できる表記だけ`zipf_frequency`を保存する。分割・未収録表記は`zipf_frequency = NULL`、`zipf_fallback = NULL`のまま保持する。異体表記は表記ごとの行とZipfを持つが、同じ`ent_seq`へ関連付く。

### 活用形フラグ

`jp-conjugation-form-v1` はSudachi由来の品詞詳細から、各語を `dictionary`（終止形）、`inflected`（未然・連用・仮定・命令など）、`non_inflecting`（名詞・副詞など）、`unknown`（情報不足）へ分類する。判定結果は `words.form_status`、根拠は `form_classification_reason`、ルール版は `form_policy_version` に保存する。

2026-07-15の全件判定は、`dictionary` 22,014語、`inflected` 114,813語、`non_inflecting` 1,048,995語、`unknown` 0語だった。この段階では既存の `game_word_settings.usable` を変更しない。後続のゲーム別フィルターで、人間が承認済みの設定を保護しながら `inflected` を除外する。

### 姓・名フラグ

`sudachi-person-name-v1` はSudachiの人名詳細から、`surname_only`（姓だけ）、`given_name_only`（名だけ）、`general_person`（一般の人物名）、`not_person`、`unknown` へ分類する。姓だけ・名だけの場合のみ `words.is_name_fragment = true` とし、一般の人物名と不明なものは将来の著名人照合や人手確認のために残す。判定結果は `person_name_status`、ルール版は `person_name_policy_version` に保存する。

2026-07-15の全件判定は、姓99,402件、名127,413件、一般の人物名32,966件だった。姓・名の合計226,815件に除外フラグが付き、人物名259,781件のうち32,966件が著名人判定候補として残る。この段階では既存の `game_word_settings.usable` を変更しない。

### 外国人名のフルネーム照合

`wikidata-person-name-v2` は、Sudachiで `general_person` とされたカタカナ単独名をWikidataの日本語データと照合する。次の条件をすべて満たす場合だけ、日本人名の姓・名と同じ `is_name_fragment = true` を付ける。

1. 対象が区切り記号を含まないカタカナ語である。
2. Wikidataで姓・名の項目として完全一致するか、日本語Wikipedia記事を持つ人物の日本語ラベル・別名として完全一致する。
3. その人物の日本語正式名を `・`、`＝`、空白で分割した構成要素に対象語が完全一致する。
4. 対応する正式名の単語を先にDBへ登録または既存語から確認できる。

正式名の末尾要素は `surname_only`、先頭・中間要素は言語ごとの姓名順を推測せず `name_only` とする。Wikidataが姓・名を明示している場合は `surname_only` または `given_name_only` を使う。単なるニックネーム一致は除外しない。人物実体は `person_entities`、短い名前・正式名との対応は `word_person_entity_links` に保存し、Sudachiを再取込してもWikidata判定を保持する。

新規追加した正式名は3ゲームとも `usable = false` で開始する。既存語のゲーム設定もこの処理では変更せず、ゲーム側の候補抽出時に日本人名と共通の `is_name_fragment` 条件で除外する。取得応答キャッシュは `.word-master-local/` に置き、辞書原本・CSV・DBダンプと同様にGitへ入れない。

2026-07-15は高頻度側500候補と確認用候補を照合し、厳格条件を満たす34件へフラグを付与し、対応する正式名34件を有効にした。試行中の緩い別名一致23件は人物実体、リンク、追加正式名を無効化した。これは全候補の完走件数ではなく、処理はキャッシュから再開できる。

### 表層品質フラグ

`surface-quality-v3` は、難語・古語を残したまま、単独のゲーム用ワードとして不適切な表記を理由付きで分離する。判定結果は `surface_quality_status`、複数の理由は `surface_quality_flags`、ルール版は `surface_quality_policy_version` に保存する。元の単語は削除せず、既存のゲーム設定も変更しない。

自動除外理由は次のとおり。

- `place_name`: Sudachiが地名と分類した固有名詞
- `organization_name`: Sudachiが組織名と分類した固有名詞
- `facility_name`: 固有名詞かつ、接頭部分を伴って駅・大学・病院・空港・公園などの施設語尾で終わるもの
- `enumeration`: 人物名以外で、区切り記号による構成要素が3つ以上ある列挙表現
- `repeated_noise`: 同一1文字だけが4回以上反復するもの
- `numeric_only`: NFKC正規化後の表記が半角数字だけのもの
- `truncated_ending`: 感動詞以外で、4文字以上かつ小さい「っ」で終わるもの
- `latin_script`: 半角・全角英字を含むもの
- `emoticon_symbols`: 顔文字で多用される記号を含むもの
- `non_kanji_compound`: 固有名詞ではなく、wordfreqが2トークン以上へ分割し、表記が漢字だけではないもの

一般語の「駅」「大学」は施設名にせず、人物のフルネームに含まれる `・` も列挙扱いしない。`ぽたりぽたり`のような通常の擬態語は `repeated_noise` にしないが、v2では複数トークンなら `non_kanji_compound` による暫定除外の対象になる。辞書形と判定できる古語・難語は、ほかの除外条件に当たらない限り残す。

`non_kanji_compound` は候補選別の簡易実装として導入した暫定除外である。有効なカタカナ複合語、複合動詞、送り仮名を含む複合名詞も除外される。将来は品詞・活用形・構成トークンの長さなどを使って再選別し、必要な語を復帰させる。漢字だけの複合語と固有名詞はこの理由では除外しない。

2026-07-15のローカル全件再分類では、有効1,185,856語のうち `clean` 566,862語、`exclude` 618,994語となった。理由は重複可能で、地名565,386件、英字19,603件、施設名17,881件、不完全語尾16,934件、顔文字記号626件、列挙583件、単一文字反復19件だった。

2026-07-16に `surface-quality-v2` を全有効1,185,856件へ適用し、`clean` 455,804件、`exclude` 730,052件となった。`non_kanji_compound` は既存理由との重複を含め131,598件で、この理由だけで新たに除外されたのは111,058件だった。

2026-07-19に `surface-quality-v3` で `numeric_only` を追加し、ローカルDBの数字のみ163件を除外した。全角数字はNFKC正規化後に同じ理由へまとめ、漢数字を含む通常語や数字を一部に含む表記はこの理由では除外しない。

### センシティブ語フラグ

`word-content-safety-v1` は、単独のお題として明確に不適切な既知語だけを完全一致で事前除外する。判定結果は `content_safety_status`、理由は `content_safety_flags`、ルール版は `content_safety_policy_version` に保存する。部分一致は使わず、科学用語など別の語まで巻き込まない。該当語は物理削除せず、3ゲームの `game_word_settings` を `usable = false`、`review_status = disabled` にする。

完全一致リストにない語は安全と断定せず `unreviewed` とする。将来のワードウルフ相方生成では、最初の単語がセンシティブかの判定と、安全な相方の生成を同じLLMリクエストで行う。応答は `decision`、`safetyFlags`、`partner` の構造化形式とし、`reject` の場合は相方を生成せず、最初の単語へ `llm-*` 版の判定を保存して次回以降の抽出から外す。`accept` の場合だけ安全な相方を返すため、存在しない却下相方をDBへ保存する専用管理は作らない。

辞書の再取込では決定的な `exclude` を常に優先する一方、既に保存した `llm-*` 判定は、より新しい決定的除外に該当しない限り維持する。本番カタログ同期も `content_safety_status = exclude` を対象外にする。

### ゲーム標準語彙の別評価

一般ゲーム向けの語彙適性はマスター語の品質とは分け、`word_pool_evaluations` に保存する。`pool_key = standard-game`、`policy_version = standard-game-ichi1-safe-v3` とし、原本の `words` や既存ゲーム設定は変更しない。複数の除外理由を `eligibility_flags`、判定根拠を `evidence` に残すため、後から理由単位で語を復帰できる。採用語には `general_game_pool` と `difficulty_easy` / `difficulty_normal` / `difficulty_hard` のいずれかを付け、`evidence` に `standard-game-familiarity-v1` の点数と根拠を保持する。

`standard-game-ichi1-safe-v3` は取りこぼしを許容する安全側の構成とし、JMdictで正確な表記に `ichi1` が付き、品詞集合が普通名詞だけであることを要求する。Zipf下限と文字数上限は設けず、かなだけの2文字以下、数字だけ、派生・活用形、名称に関するメタ語、状況依存・相対的位置、敬称・呼称、古語・廃語・俗語、人物だけを表す語、抽象語、浅い階層に多数の下位概念を持つ上位語を理由付きで除外する。同一表記に複数の `ichi1` エントリーが競合する場合も除外する。

同じ共通語レコードに表記揺れがある場合は、wordfreqが単語全体として認識する表記だけを比較し、より高いZipfの表記を一般ゲーム向け表示として `evidence.display_surface` に保存する。分割測定値は0扱いとし、元のZipf列は変更しない。`publication` 階層全体は除外せず、単行本・週刊誌のような出版形式・分類語だけを `format_or_classification_term` で除外する。女王は人物以外にチェス駒などの具体的語義も持つ確認済み語として残す。

2026-07-20のローカルDB適用では、DB側の既存品質・安全条件を通った `ichi1` 普通名詞2,247語を評価し、`eligible` 347語、`exclude` 1,900語となった。347語の内訳は easy 119語、normal 165語、hard 63語である。


## 初期ゲーム分類

`zipf-game-classification-v1` を `word_db_policies` へ保存する。初回取込時の分類は次のとおり。

| Zipf | ワードウルフ | ニゴイチ | たほい屋 |
| --- | --- | --- | --- |
| 4.5以上 | easy・使用可 | easy・使用可 | 使用不可 |
| 3.5〜4.5 | normal・使用可 | normal・使用可 | 使用不可 |
| 2.5〜3.5 | hard・使用可 | hard・使用可 | easy・使用可 |
| 1.0〜2.5 | 要レビュー | 要レビュー | normal・使用可 |
| 1.0未満／0 | 要レビュー | 要レビュー | hard候補・使用不可 |

Zipf 0のたほい屋語は、確認済みで利用可能な語釈を `word_definitions` へ追加してからだけ、`usable = true` にする。

## chiVeペア候補アダプタ

ワードウルフの意味近傍候補にはchiVe `v1.3 mc90`をローカル専用で試用する。モデル原本と生成ペアは `.word-master-local/` にだけ保存し、本番には審査済みペアだけを将来同期する。固定値は `config/word-sources/chive-1.3-mc90.json`、取得・一致率集計は `scripts/prepare-chive.py`、未審査ペア生成は `scripts/generate-chive-wordwolf-pairs.py` を正本とする。

本番カタログと同じ197,040候補に対する初回収録率は65.05%（128,183件）だった。Zipf 3以上8未満の名詞67,071件では44,239件が一致した。chiVe単体の近傍には同義語、上下関係、対義語、複合語の一部が混ざるため、生成物は `unreviewed` とし、そのまま `wordwolf_pairs` へ登録しない。Sudachi同義語辞書による近すぎる組の除外と、日本語WordNetによる兄弟概念の加点を後段に置く。

Sudachi同義語辞書はCoreと同じ `20260428` へ固定し、`scripts/prepare-sudachi-synonyms.py` で有効見出し索引を作る。展開制御2の削除履歴は除外判定に使わない。同じグループかつ同じ語彙素は表記違い・略称等の `same_lexeme`、同じグループの別語彙素は `synonym` として区別し、どちらもワードウルフ候補から除外する。固定版は有効見出し66,948件、共通候補との一致35,890件（18.21%）。chiVe初回100組には3組の同義語があり除外した。

日本語WordNetは公式SQLite版 `1.1` を固定し、`scripts/prepare-japanese-wordnet.py` が取得済みファイルのSHA-256検証、展開、SQLite整合性検査、収録率集計を行う。`scripts/analyze-wordwolf-pairs-japanese-wordnet.py` は同一synset・直接の類似関係・直接の上下関係を除外候補にし、直接の上位概念を共有する組を `sibling` として残す。共通候補との一致は42,970件（21.81%）。Sudachi除外後97組では同一synset 2組を除外し、兄弟語3組を含む95組が残った。片方以上が未収録の組が83組あるため、WordNetは補助判定とし、生成物をそのまま `wordwolf_pairs` へ登録しない。原本・展開DB・判定JSONはローカル専用で、公開利用時の帰属表記は `config/word-sources/japanese-wordnet-1.1.json` を正本とする。

既定条件の全件走査ではchiVe一致44,239語から16,025組・32,050語を一回だけ組み、Sudachiで410組、WordNetで298組を除外した。辞書工程を通過したのは15,317組・30,634語。このうち積極的な適合根拠があるWordNet兄弟概念は167組・334語で、残り15,150組は最終審査待ちである。除外後の再ペアリングは未実装なので、この数字を最終収容量とは扱わない。

## 移行順

1. このスキーマを初期化し、SudachiDict Coreの固定版を正規化CSVとして初回取込する。
2. 件数、品詞、Zipf分布、重複、固有名詞推定をレポートしてからゲーム可否を調整する。
3. 既存たほい屋100語を `words` と `word_definitions` へ**未検証**として取り込む。各レコードの外部出典・ライセンスを確認後にだけ `verified` を立てる。
4. 既存 `experiencedPlayerIds` を `user_seen_tahoiya_words` へ反転移行し、新規記録をPostgreSQLへ切替える。Redis旧配列は照合完了まで削除しない。
5. ニゴイチを共通DB抽出へ接続する。
6. Embeddingモデルを決定し、全単語へ一度だけ付与してpgvector索引を追加する。
7. ワードウルフの候補検索、LLM審査、ペア在庫を `wordwolf_pairs` へ移す。
8. 単語・ペアのフィードバック集計と自動レビュー移行を追加する。

## たほい屋のクールダウン

PostgreSQLへ切り替える時点で、`TAHOIYA_WORD_COOLDOWN_DAYS`（既定90）を読み、参加者の誰か一人でも期間内に見た語を除外する。履歴は物理削除しない。候補枯渇時は「完全未見 → 期間外 → 最終閲覧が古い順 → 警告付き再利用」の順に緩和する。

## 検証基準

初回取込後に必ず確認する。

- 入力行数、挿入数、更新数、除外数が説明できる。
- `source_entry_id` の重複がない。
- `zipf_frequency` がNULLまたは想定外に偏っていない。
- 全ゲーム設定が各単語へ3件ずつ作成されている。
- たほい屋で `usable = true` の語に、確認済み語釈を要求する選択クエリを実装するまで本番出題へ接続しない。
- ランダム抽出と全員既出判定は実データで `EXPLAIN ANALYZE` を取ってから有効化する。

## 本番の共通ワードカタログ

2026-07-16 に、ローカルで審査した候補だけを本番 Neon の `shared_word_catalog` へ初回同期した。初回結果は `active = true` が197,040件、全体も197,040件、非アクティブ化0件。本番DB全体は同期後51,273,728 bytesだった。

同期対象は `active = true`、`form_status <> 'inflected'`、`is_name_fragment = false`、`surface_quality_status = 'clean'`、`content_safety_status <> 'exclude'` をすべて満たすローカル `words` 行とする。

本番へ置くゲーム向けの主フィールドは `word_master_id`、`surface`、`reading`、`zipf_frequency`、`active` の5つ。同期管理用に `catalog_policy_version`、`last_seen_sync_id`、作成・更新日時も保持する。`normalized_form`、辞書原本、正規化CSV、ローカル判定理由、DBダンプは本番へ送らない。

2026-07-20に、全カタログ置換を行わない選定プール差分同期で、一般ゲーム347語と、安全・表記品質条件を通るJMdict四字熟語2,168語を本番へ追加・更新した。本番の `shared_word_pool_evaluations` には `standard-game` または `yojijukugo` の所属、一般語の3段階難易度、評価フラグ、ポリシー版だけを保持する。未測定Zipfは本番向け投影で0とし、ローカルマスターの元列は変更しない。再同期には `scripts/publish-selected-word-pools.py` を使う。

`word_master_id` はローカル `words.id` をそのまま永久IDとして使う。行の物理削除、番号の詰め直し、欠番の再利用は禁止する。利用停止は `active = false` とし、同じ語を復帰させる場合は同じIDを使う。テーブルにはDELETE拒否トリガーを置く。

## 単独単語ゲームの共通選択プロトコル

単独単語を起点にするゲームは `lib/word-selection-protocol.ts` の `word-selection-v1` を共通利用する。元の `zipf_frequency` は変更せず、実行時に次を合成する。

```text
共通実質Zipf = 元Zipf - LLMの使用頻度補正 + 単語の知名度フィードバック補正
ゲーム実質Zipf = 共通実質Zipf - ゲーム固有の適性補正
```

初期ハイパーパラメータは easy=6.0、normal=5.0、hard=4.0、幅0.5、LLM補正段階は0/0.5/1.0/1.5、フィードバック補正上限は±0.5、反映開始は5件、LLMバッチ数は3件。これらは固定DB値ではなく設定として差し替え可能にする。

ワードウルフの一般単語モードは、本番 `shared_word_catalog` から難易度中心に重み付けして3語を取り、1回の共通LLMリクエストで各語を独立に審査する。応答は各 `word_master_id` ごとに、採否、安全フラグ、使用頻度補正、ワードウルフ適性補正、相方、表示用理由、理由コードを返す。相方が共通カタログに存在すればIDも保持し、存在しなければ相方文字列だけを保持する。村側・狼側の向きは採用時にランダム化する。

デバッグ中のホストが「ワード生成だけテスト」を使った場合だけ、候補ごとの元Zipf、保存済み補正、今回のLLM減点、フィードバック補正、実質Zipf、抽選重み、採否、DB保存成否を `debugTrace` としてレスポンスへ付ける。通常プレイのレスポンス、部屋データ、Vercelログには診断内容を残さない。

過去のGood/Badは既存の `game-feedback` Redis索引から、ゲーム、タスク、難易度、距離、単語ID、単語表記をタグとして検索し、命令ではない参考例としてプロンプトへ加える。「知名度がちょうどよい」と「片方がマイナー」は同じ起点語に5件以上集まってから共通補正へ反映する。距離・会話・型の評価は単語の知名度を直接変更せず、ペア再利用順位へ反映する。

本番の差分同期スキーマには `shared_word_game_evaluations` と `shared_wordwolf_pairs` を含める。前者は単語ID別・ゲーム別の補正と採否、後者は起点ID、任意の相方ID、相方文字列、計算時スコア、生成モデル・プロンプト版を保持する。辞書原本、正規化CSV、ローカルDBダンプ、ローカル専用判定理由は同期しない。既存本番DBでは次回 `word-db:publish` が追加テーブルを作るまで、生成自体は動作するがPostgreSQLへの補正・ペア保存は省略される。

ゲーム別の難易度や「秘境」「魔境」は本番カタログへ固定保存せず、ゲーム側が `zipf_frequency` から導出する。たほいやの説明文は別テーブルで、既存説明を優先し、未作成の語は初回利用時に生成・保存する。

差分同期は `scripts/upload-shared-word-catalog.py` を使う。全候補へ同期IDを付けた後に、今回の同期に現れなかった既存行だけを非アクティブ化する。Vercel連携でSensitive指定されたNeon URLはCLIでも値を取得できないため、初回同期は公開鍵署名で保護した一時プレビューFunctionから実行し、完了後にFunction、プレビュー、秘密鍵を削除した。恒久的な無認証アップロードAPIは置かない。
