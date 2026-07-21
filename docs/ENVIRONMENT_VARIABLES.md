# 環境変数管理台帳

最終更新: 2026-07-21

この文書を Game Fields の環境変数配置の正本とする。実値、接続文字列、APIキー、パスワードはGitへ保存しない。Vercel、Neon、Upstash、Blob、各API提供元だけで管理する。

## 環境構成

| 環境 | Vercelプロジェクト | ブランチ | URL | 用途 |
| --- | --- | --- | --- | --- |
| Production | `app-games` | `main` | `https://game-fields.com` | 一般公開 |
| Development | `app-games-dev` | `develop` | `https://dev.game-fields.com` | 内部開発・検証 |
| SDK | `app-games-sdk`（予定、Root Directory: `apps/sdk-portal`） | `main`で公開、`develop`はPreview | `https://sdk.game-fields.com` | 外部開発者・Developer Portal |

Vercel Teamは `game-fields`（Team ID: `team_Q3rGaf7bwfZZsjaj1vqCg5YO`）。共通秘密情報はTeam Shared Environment Variablesへ置き、環境別データ接続とURLは各Project Variablesへ置く。

SDKは`app-games`と同じGitリポジトリ内の別アプリとして管理するが、Vercel Project、Root Directory、環境変数、DB・Redis・Blobの名前空間は本番・開発から分離する。公開npm packageは`packages/game-sdk`から生成し、SDK用Vercel Projectへ本体の管理者権限や書込用秘密情報をリンクしない。

アプリ内の環境判定はVercelのDeployment種別ではなく、`VERCEL_GIT_COMMIT_REF`を優先する。`main`は`production`、`develop`は`development`として扱い、ブランチ情報がないローカル実行などでのみ`VERCEL_ENV`と`NODE_ENV`へフォールバックする。これにより、`app-games-dev`のProduction Deploymentである`develop`を本番アプリと誤認しない。

VercelのIgnored Build StepはProjectごとに次を設定済み。

- `app-games`: `if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; else exit 1; fi`
- `app-games-dev`: `if [ "$VERCEL_GIT_COMMIT_REF" != "develop" ]; then exit 0; else exit 1; fi`

VercelではIgnored Build Stepの終了コード`0`がスキップ、`1`がビルド実行を意味する。

ChatGPTのVercel Connectorは現在このTeam scopeを持たず、Project IDを直接指定しても `403 Forbidden` と `must re-authenticate to this scope` を返す。Project設定やTeam membershipの追加ではなく、Connectorを `game-fields` scopeへ再認証してからDeploy・Build Log・Runtime Log操作を再確認する。

## 命名と移行ルール

- 最終的な正式名は、原則としてコードが読む既存名を維持する。
- Project Variableと同名のShared Variableを同時作成できない場合、移行中だけ `SHARED_` 接頭辞を使う。
- コード側は移行期間中だけ `SHARED_* ?? 旧名` の順に読む。
- 全プロジェクトでShared版を確認後、旧Project版を削除し、必要なら正式名へ戻す。
- `VERCEL_ENV`などVercelのSystem Environment Variablesは手動登録しない。
- Sensitiveにした値は再表示できないため、移行時は各サービスで新しいキーを発行するか、元の安全な保管場所から取得する。

## Team Shared Variables

現在作成済み:

| 現在のキー | 最終候補 | Sensitive | Production | Development | SDK | 用途 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SHARED_OPENAI_API_KEY` | `OPENAI_API_KEY` | Yes | Link済み | Link済み | Link予定 | OpenAI API | 両Project Link済み・コード対応済み |
| `SHARED_GEMINI_API_KEY` | `GEMINI_API_KEY` | Yes | Link済み | Link済み | Link予定 | Gemini API | 両Project Link済み・コード対応済み |
| `SHARED_GROQ_API_KEY` | `GROQ_API_KEY` | Yes | Link済み | Link済み | Link予定 | Groq API | 両Project Link済み・コード対応済み |
| `SHARED_RESEND_API_KEY` | `RESEND_API_KEY` | Yes | Link済み | Link済み | Link予定 | Resendメール送信 | 両Project Link済み・コード対応済み |
| `SHARED_VOCABULARY_DATABASE_URL` | `VOCABULARY_DATABASE_URL` | Yes | Link済み | Link済み | Link予定 | 共通単語DB読取 | 両Project Link済み・コード対応済み |
| `SHARED_VOCABULARY_ADMIN_DATABASE_URL` | `VOCABULARY_ADMIN_DATABASE_URL` | Yes | Link済み | Link済み | 原則リンクしない | 共通単語DB管理 | 両Project Link済み・コード対応済み |

Shared化候補:

| キー | Sensitive | 用途 | Shared可否・注意 |
| --- | --- | --- | --- |
| `EMAIL_FROM` | No | 送信元メールアドレス | 全環境同一ならShared。dev/sdk用送信元を分けるならProject |
| `PRIVATE_GAME_ACCESS_KEY` | Yes | 非公開ゲームアクセス | 内部環境だけ共通ならShared。一般公開SDKへはリンクしない |
| `LLM_ACCESS_PASSWORD` | Yes | LLMアクセス制御 | Production/dev共通可。SDKは別値推奨 |
| `DEBUG_MODE_PASSWORD` | Yes | 旧デバッグ認証 | 管理者メール認証へ完全移行後は廃止候補 |
| `TURNSTILE_SECRET_KEY` | Yes | Bot対策 | 同一サイト設定を使う場合のみShared |
| `TURNSTILE_SITE_KEY` | No | Bot対策公開キー | 同一サイト設定を使う場合のみShared |
| `SENTRY_DSN` | No/運用次第 | エラー監視 | 環境タグを付けられるならShared可 |
| `SENTRY_AUTH_TOKEN` | Yes | Sentryビルド連携 | Shared可。ただし必要プロジェクトだけリンク |

## Project Variables: Production / Development / SDKで別値

### 環境識別

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `APP_ENV` | `production` | `development` | `sdk` または専用値を将来定義 | No | アプリ環境識別 |
| `APP_DATABASE_ENV` | `production` | `development` | `sdk` | No | アプリDB誤接続防止 |
| `REDIS_ENV` | `production` | `development` | `sdk` | No | Redis誤接続防止 |
| `BLOB_ENV` | `production` | `development` | `sdk` | No | Blob誤接続防止 |
| `APP_BASE_URL` | `https://game-fields.com` | `https://dev.game-fields.com` | `https://sdk.game-fields.com` | No | 絶対URL・メールリンク等 |

### PostgreSQL / Neon

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `APP_DATABASE_URL` | `app-games-neon` | `dev-neon` | SDK専用DB予定 | Yes | アプリDB正本 |
| `SHARED_VOCABULARY_DATABASE_URL`（旧 `VOCABULARY_DATABASE_URL`） | `word-master-neon` 読取用 | `word-master-neon` 開発用権限 | 原則読取専用 | Yes | 共通単語DB |
| `SHARED_VOCABULARY_ADMIN_DATABASE_URL`（旧 `VOCABULARY_ADMIN_DATABASE_URL`） | 管理者ロール | 管理・生成用ロール | 原則リンクしない | Yes | 採否・昇格・管理処理 |
| `LEGACY_WORD_DATABASE_URL` | 原則なし | 移行作業中だけ | なし | Yes | 旧語彙移行専用 |

互換変数として残っている可能性があるもの:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_HOST`
- `POSTGRES_DATABASE`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

新規コードは `APP_DATABASE_URL` を正本として使い、互換変数は段階的に廃止する。
Sensitive設定済みの互換変数をVercel上で複製できない移行期間は、`APP_DATABASE_ENV`を設定すれば
`DATABASE_URL`等の互換変数にも同じ誤接続ガードを適用する。

### Redis / Upstash

現在の契約は Vercel Storage上の `wy-app-games`、Upstash for Redis Fixed 250MB。

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `APP_REDIS_URL` | 本番Redis | 開発Redis | SDK名前空間または専用Redis | Yes | Redis接続文字列正本候補 |
| `UPSTASH_REDIS_REST_URL` | 本番 | 開発 | SDK専用または分離名前空間 | Yes | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | 本番 | 開発 | SDK専用 | Yes | Upstash REST Token |

互換変数として残っている可能性があるもの:

- `REDIS_URL`
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

### Vercel Blob

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | 本番Blob | `dev-games-blob` | SDK専用Blob予定 | Yes | Blob読み書き |

Blob Storeの現行候補:

- `app-games-avatars`（Public）
- `app-games-blob`（Private）
- 開発用Blobは別Storeを使う

### URL・メール・外部連携

| キー | 配置 | Sensitive | 用途・注意 |
| --- | --- | --- | --- |
| `EMAIL_FROM` | SharedまたはProject | No | dev/sdkで実送信を抑止する設計と合わせる |
| `SHARED_RESEND_API_KEY`（旧 `RESEND_API_KEY`） | Shared | Yes | SDK一般公開時は共通キーを直接リンクしない |
| `SITE_NAME` | Shared候補 | No | 全環境同一ならShared |
| `SITE_URL` | Project | No | `APP_BASE_URL`と役割が重なる場合は統合候補 |

## Vercel System Variables

次はVercelが自動提供する。手動作成しない。

- `VERCEL`
- `VERCEL_ENV`
- `VERCEL_URL`
- `VERCEL_PROJECT_PRODUCTION_URL`
- `VERCEL_GIT_COMMIT_REF`
- その他Vercel System Environment Variables

`VERCEL_GIT_COMMIT_REF`は`lib/storage-environment-guard.ts`が`main`／`develop`を識別するために使用する。これらのSystem Environment Variablesは手動で上書きしない。

## 移行チェックリスト

1. 新しいShared VariableをTeam側に作る。
2. `app-games` と `app-games-dev` にリンクする。
3. 必要ならコードを `SHARED_* ?? 旧名` 対応にする。
4. 両プロジェクトを再デプロイする。
5. API・メール・管理機能をテストする。
6. 旧Project Variableを削除する。
7. 再度デプロイして動作確認する。
8. 旧APIキーを提供元で失効する。
9. この台帳の状態欄を更新する。

環境変数の変更は既存Deploymentへ遡及しない。必ず新しいDeploymentを作成して確認する。

## 禁止事項

- 実値をGit、Issue、PR、チャットログ、スクリーンショットへ保存しない。
- `NEXT_PUBLIC_*` に秘密情報を入れない。
- ProductionのDB、Redis、BlobをdevまたはSDKへ流用しない。
- SDK一般公開環境へ管理者キー、メール実送信キー、語彙管理ロールをリンクしない。
- Shared Variableを全プロジェクトへ無条件でリンクしない。必要なプロジェクトだけ選ぶ。

## 未確認・更新が必要な項目

- Vercel上に存在する全Project Variableの完全な一覧
- `EMAIL_FROM`、各管理パスワードのShared移行状況
- `APP_REDIS_URL`とUpstash REST変数のどちらが現在の正本か
- Production / DevelopmentそれぞれのBlob Store名
- SDK環境のDB・Redis・Blob分離方式
- 旧互換変数を削除できる時期

Vercelの変数一覧を確認するたび、この文書へ変数名と配置だけを追記する。値は記載しない。
