# ワードウルフ共通単語RAG

最終更新: 2026-07-17

## 目的

一般単語モードでは、共通単語DB `word-master-neon` の単語を起点にして相方を生成する。1リクエストで起点語を3件まとめて独立評価し、採用可能な候補をすべてdraftへ保存してから1組を重み付き抽選する。承認済みペアは新規生成より先に再利用する。

## 生成フロー

1. 難易度ごとのZipf中心（easy=6、normal=5、hard=4、幅0.5）に近いactive単語を3件抽出する。
2. 過去のGood/Badを、ゲーム・難易度・距離・単語ID・表記で検索する。
3. 1回のLLMリクエストで各単語を独立に審査し、安全性、一般使用頻度補正、ワードウルフ適性補正、相方、理由を構造化JSONで返す。
4. 却下を含む審査結果を `word_game_evaluations` へ追記する。
5. 採用可能なペアを `vocabulary_draft_submissions` へ保存し、実質Zipfの重みで今回の1組を選ぶ。
6. 管理画面で承認されたペアだけが `active_word_pairs` と出題対象へ反映される。

デバッグホストの「ワード生成だけテスト」では、3候補のZipf、LLM減点、抽選重み、採否、DB保存成否を表示する。通常プレイのレスポンスと部屋データには診断情報を残さない。

## 距離の扱い

距離と知名度は別軸である。

| 値 | 用途 |
| --- | --- |
| `requested_pair_distance` | 生成時にプレイヤーが指定した近い／普通／遠い。生成条件と監査用に固定する |
| `pair_distance` | フィードバック集計後の現在の距離分類。承認済みペア検索に使う |
| `word_pair_distance_stats` | 近すぎる／ちょうどよい／遠すぎるの集計値 |

生成直後は現在値を指定値で初期化する。結果画面のプレイヤーフィードバックを集計し、5件以上かつ「近すぎる」または「遠すぎる」が60%以上になった場合だけ、batch/admin処理から `refresh_word_pair_distance(pair_id)` を呼んで1段階補正する。個別評価1件で距離を即時変更しない。

「知名度がちょうどよい」と「片方がマイナー」は起点語の知名度補正へ使う。「近すぎる」「遠すぎる」「ちょうどよい距離」「会話」「型」の評価は単語Zipfを変更せず、ペアの距離・再利用順位へ使う。

## DB適用と初期カタログ

`word-master-neon`へ次を順に適用する。

```text
db/vocabulary/003_review_workflow.sql
db/vocabulary/004_wordwolf_rag.sql
db/vocabulary/005_human_review_votes.sql
db/vocabulary/006_global_selection_zipf.sql
db/vocabulary/007_evaluation_final_reviews.sql
```

`words.zipf`は辞書・集計由来の原値として維持する。全ゲーム共通の選定補正は
`selection_zipf_override`へ保存し、実効Zipfを`COALESCE(selection_zipf_override, zipf)`で求める。
管理画面から一つ目の単語をたほい屋候補へ送ると、実効Zipfが3以上または未計測の場合だけ
2.9へ設定し、`word_game_eligibility(game_id = 'tahoiya')`を有効にする。

管理画面の最終採否は、ペアdraftの有無にかかわらず
`word_game_evaluation_reviews`へ追記する。相方未生成のrejectもAI評価結果として
正式採用または不採用を確定でき、どちらも選考済みとして一覧から除外する。
不採用の範囲はワードウルフのペア候補だけであり、`words`の状態、共通Zipf、
たほい屋や他ゲームの適格性は変更しない。紐づくpair draftが未審査の場合のみ、
正式採用で`active`、不採用で`rejected`へ連動する。

旧 `shared_word_catalog` の197,040語を共通DBへ移す場合は、接続URLを画面・ログ・チャットへ貼らず、一時環境変数で指定する。

```bash
npm run vocabulary:import-legacy-words
npm run vocabulary:import-legacy-words -- --apply
```

1回目はDB名と件数だけを表示するdry-runである。`LEGACY_WORD_DATABASE_URL` は旧 `shared_word_catalog` の読取元、`VOCABULARY_ADMIN_DATABASE_URL` は `word-master-neon` の管理ロールを指定する。取込は単語をactiveにし、ワードウルフ用eligibilityを作る。原本辞書やローカルDBダンプは移さない。

初回移行中のdevelop Previewでは、管理画面の「単語候補」に一時取込パネルを表示できる。これは `VERCEL_ENV=preview`、`APP_ENV=development` の両方を満たす場合だけ動作し、`LEGACY_WORD_DATABASE_URL`（未設定時だけ `APP_DATABASE_URL`）の `shared_word_catalog` を読んで `VOCABULARY_ADMIN_DATABASE_URL` へ1,000件ずつ冪等にupsertする。NFKC正規化後に表記と読みが一致する旧レコードは1語へ統合し、完了判定も旧DBの行数ではなく正規化後の一意語数と取込由来のeligibility件数を照合する。`LEGACY_WORD_DATABASE_URL` は旧カタログへSELECTだけ可能な専用ロールを推奨し、develop branch限定のPreview Sensitive変数として一時設定する。管理者のフルセッションと直近5分以内のパスキー確認を必須とし、完了時だけ監査ログを残す。旧DB、本番アプリDBおよびProductionデプロイでは書込・実行を拒否する。移行完了・件数照合後は一時API、パネル、環境変数、専用ロールを削除する。

## Preview確認

1. migrationと初期カタログ取込後にdevelop Previewを再デプロイする。
2. 管理者かつデバッグ可能なプレイヤーでワードウルフ部屋を作る。
3. 一般単語、任意の距離・難易度を選び、「新規ワード生成」をONにして生成テストする。
4. 生成経路が `catalog-rag`、候補数が3になり、候補ごとの採否が表示されることを確認する。
5. `/admin` の単語候補に採用可能な複数ペアがdraftとして並ぶことを確認する。

mainへのマージとProduction環境変数の変更は、Preview確認後に別途明示的な許可を得て行う。
