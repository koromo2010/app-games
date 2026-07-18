# 開発・本番DB分離と共通単語DB

最終更新: 2026-07-17

## 正本となる境界

| 資源 | Production | Preview / develop |
| --- | --- | --- |
| アプリPostgreSQL | `app-games-neon` | `dev-neon` |
| Redis | 本番Redis | `dev-redis` |
| Blob | 本番Blob | `dev-games-blob` |
| 単語カタログ | `word-master-neon` | 同じ`word-master-neon` |

アカウント、メール、認証情報、戦績、レーティング、プレイバック、既出履歴、評価生データ、問い合わせは環境別に保存する。単語、語釈、ペア、連想グループと本番評価から作る品質集計だけを共通DBへ置く。別DB間のID参照はUUIDによる論理参照であり、外部キーではない。

## 必須環境変数

```text
APP_ENV=production|development
APP_DATABASE_URL=...
APP_DATABASE_ENV=production|development
VOCABULARY_DATABASE_URL=...
VOCABULARY_ADMIN_DATABASE_URL=... # 管理画面だけ。vocabulary_adminロールを使用
LEGACY_WORD_DATABASE_URL=...      # 初回移行だけ。旧カタログの読取専用ロールをdevelop Previewへ一時設定
REDIS_ENV=production|development
BLOB_ENV=production|development
APP_REDIS_URL=... # Redis Cloud等のredis:// / rediss://接続
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

`APP_DATABASE_URL`をアプリDBの正本とする。Redis Cloud等は`APP_REDIS_URL`、Upstash RESTは`UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を使う。既存`DATABASE_URL`、`REDIS_URL`等は移行中の互換読取に限る。新しい正本を使う場合、`VERCEL_ENV`、`APP_ENV`、`APP_DATABASE_ENV`が一致しなければ接続を拒否する。RedisとBlobはそれぞれ`REDIS_ENV`、`BLOB_ENV`を設定した時点から同じ検査を有効にする。

## 共通DBの安全境界

- 接続文字列を`NEXT_PUBLIC_*`、Client Component、レスポンス、ログへ出さない。
- ブラウザからNeonへ直接接続せず、サーバーRepositoryだけを経由する。
- 本番ゲームは`active_*` viewと品質集計の読取専用で、draftを読む権限も持たない。
- 開発ゲームと生成バッチはdraft追加だけを許可する。
- activeへの昇格、既存activeの編集、物理削除、schema変更は管理ロールだけに許可する。
- API認証に加えてDBロールとtriggerでも制約する。
- draft作成APIには管理・デバッグ認証、レート制限、入力長・件数制限、監査ログを必須とする。

初期schemaは`db/vocabulary/001_catalog.sql`、ロール権限は`db/vocabulary/002_roles.sql`、レビュー機能は`db/vocabulary/003_review_workflow.sql`、ワードウルフRAGと距離集計は`db/vocabulary/004_wordwolf_rag.sql`に置く。接続パスワードはNeon/Vercelだけで管理し、ファイルへ実値を保存しない。`VOCABULARY_DATABASE_URL`はゲーム実行用、`VOCABULARY_ADMIN_DATABASE_URL`は管理画面の候補確認・採否専用とし、ブラウザへ公開しない。

ワードウルフの距離は、生成時指定の`requested_pair_distance`と、プレイヤーフィードバック集計後の現在値`pair_distance`を分ける。個別フィードバックで即時更新せず、5件以上の集計をbatch/admin処理で反映する。生成・取込・Preview確認の詳細は`docs/WORDWOLF_RAG.md`を参照する。

## 移行順

1. `word-master-neon`を作成し、管理ロールでschemaを適用する。
2. 用途別ロールを作成し、Vercel環境別に対応する接続URLだけを登録する。
3. 既存候補をUUID付きでコピーし、正規化重複と件数を照合する。
4. Repository読取と旧Redisフォールバックを併用する。
5. 既出履歴を環境別RedisまたはアプリDBへ移す。
6. 抽出結果を照合後、旧候補への書込みを停止する。

本番ゲームの停止を伴う一括切替は行わない。

開発Redisの既存ワードウルフ・たほい屋候補は、接続変数をローカルの一時環境へ設定してから`npm run vocabulary:migrate`でdraft受付箱へ移せる。deduplication keyを使うため再実行しても重複しない。本番Redisからの移行は、開発接続を本番へ向けず、管理・batchロールを使う専用ジョブとして別途実行する。
