# 共通ワードマスターDB

最終更新: 2026-07-15

## この段階の目的

共通語彙をPostgreSQL（Neon）へ置くための土台と、Docker上のローカル検証用取込を作る。既存のワードウルフ・たほい屋の出題経路、Redisカタログ、既出判定はこの段階では変更しない。したがってローカル初期化・取込の成否は本番ゲームに影響しない。

実装:

- スキーマ: `lib/word-master-schema.ts`
- 初期化: `npm run word-db:init`
- ローカルDB: `compose.yaml`、`docs/LOCAL_WORD_DATABASE.md`
- ローカル取込: `scripts/import-word-master.py`
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

`surface-quality-v1` は、難語・古語を残したまま、単独のゲーム用ワードとして不適切な表記を理由付きで分離する。判定結果は `surface_quality_status`、複数の理由は `surface_quality_flags`、ルール版は `surface_quality_policy_version` に保存する。元の単語は削除せず、既存のゲーム設定も変更しない。

自動除外理由は次のとおり。

- `place_name`: Sudachiが地名と分類した固有名詞
- `organization_name`: Sudachiが組織名と分類した固有名詞
- `facility_name`: 固有名詞かつ、接頭部分を伴って駅・大学・病院・空港・公園などの施設語尾で終わるもの
- `enumeration`: 人物名以外で、区切り記号による構成要素が3つ以上ある列挙表現
- `repeated_noise`: 同一1文字だけが4回以上反復するもの
- `truncated_ending`: 感動詞以外で、4文字以上かつ小さい「っ」で終わるもの
- `latin_script`: 半角・全角英字を含むもの
- `emoticon_symbols`: 顔文字で多用される記号を含むもの

一般語の「駅」「大学」は施設名にせず、人物のフルネームに含まれる `・` も列挙扱いしない。`ぽたりぽたり`のような通常の擬態語、辞書形と判定できる古語・難語は残す。

2026-07-15のローカル全件再分類では、有効1,185,856語のうち `clean` 566,862語、`exclude` 618,994語となった。理由は重複可能で、地名565,386件、英字19,603件、施設名17,881件、不完全語尾16,934件、顔文字記号626件、列挙583件、単一文字反復19件だった。


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
