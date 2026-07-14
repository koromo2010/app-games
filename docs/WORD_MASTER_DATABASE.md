# 共通ワードマスターDB

最終更新: 2026-07-15

## この段階の目的

共通語彙をPostgreSQL（Neon）へ置くための土台だけを作る。既存のワードウルフ・たほい屋の出題経路、Redisカタログ、既出判定はこの段階では変更しない。したがって初期化・初回取込に失敗しても本番ゲームは従来どおり動く。

実装:

- スキーマ: `lib/word-master-schema.ts`
- 初期化: `npm run word-db:init`
- ローカル取込: `scripts/import-word-master.py`
- ローカル依存: `requirements/word-master.txt`

## 正本と責務

| 対象 | この移行後の正本 | 移行前／一時状態 |
| --- | --- | --- |
| 単語、品詞、読み、Zipf、出典 | PostgreSQL `words` | まだ未登録 |
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

`source_entry_id` はその辞書版の中で安定したIDにする。行番号やランダムUUIDを使わない。原典のCSVレイアウトは辞書ごとに違うため、次の作業でSudachiDict Coreの配布版を固定し、その版専用の「原典CSV → 正規化CSV」アダプタを作る。今回のインポーターはライセンス・版・帰属を必須引数として `word_sources` に保存する。

`wordfreq.zipf_frequency(surface, "ja")` はローカル実行だけで計算する。Zipf値は再計算可能な客観メタデータとして保存し、利用者評価では更新しない。

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
