# 開発・本番DB分離と共通単語DB

最終更新: 2026-07-16

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
REDIS_ENV=production|development
BLOB_ENV=production|development
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

`APP_DATABASE_URL`を正本とする。既存`DATABASE_URL`等は移行中の互換読取に限る。新しい正本を使う場合、`VERCEL_ENV`、`APP_ENV`、`APP_DATABASE_ENV`が一致しなければ接続を拒否する。RedisとBlobはそれぞれ`REDIS_ENV`、`BLOB_ENV`を設定した時点から同じ検査を有効にする。

## 共通DBの安全境界

- 接続文字列を`NEXT_PUBLIC_*`、Client Component、レスポンス、ログへ出さない。
- ブラウザからNeonへ直接接続せず、サーバーRepositoryだけを経由する。
- 本番ゲームは`active_*` viewと品質集計の読取専用で、draftを読む権限も持たない。
- 開発ゲームと生成バッチはdraft追加だけを許可する。
- activeへの昇格、既存activeの編集、物理削除、schema変更は管理ロールだけに許可する。
- API認証に加えてDBロールとtriggerでも制約する。
- draft作成APIには管理・デバッグ認証、レート制限、入力長・件数制限、監査ログを必須とする。

初期schemaは`db/vocabulary/001_catalog.sql`、ロール権限は`db/vocabulary/002_roles.sql`に置く。ロールSQLの仮パスワードは実行前に安全な値へ置換し、ファイルへ実値を保存しない。

## 移行順

1. `word-master-neon`を作成し、管理ロールでschemaを適用する。
2. 用途別ロールを作成し、Vercel環境別に対応する接続URLだけを登録する。
3. 既存候補をUUID付きでコピーし、正規化重複と件数を照合する。
4. Repository読取と旧Redisフォールバックを併用する。
5. 既出履歴を環境別RedisまたはアプリDBへ移す。
6. 抽出結果を照合後、旧候補への書込みを停止する。

本番ゲームの停止を伴う一括切替は行わない。

開発Redisの既存ワードウルフ・たほい屋候補は、接続変数をローカルの一時環境へ設定してから`npm run vocabulary:migrate`でdraft受付箱へ移せる。deduplication keyを使うため再実行しても重複しない。本番Redisからの移行は、開発接続を本番へ向けず、管理・batchロールを使う専用ジョブとして別途実行する。
