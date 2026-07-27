# 環境変数管理台帳

最終更新: 2026-07-27

現在配置はこの文書、追加・変更・削除の進行中依頼は`config/environment-change-registry.json`を正本とする。実値、接続文字列、APIキー、パスワードはGitへ保存しない。Vercel、Neon、Upstash、Blob、各API提供元だけで管理する。

## 別スレッド・別担当で再開するときの必須手順

この文書は会話履歴より優先する。環境変数や外部インフラを扱う担当は、操作案内を始める前に次を行う。

1. 対象ブランチの最新版でこの文書と`config/environment-change-registry.json`を読み、対象Projectと「現在配置」「進行中依頼」「未確認・更新が必要な項目」を確認する。
2. 対象のTeam、Project、branch、Root Directory、Deployment Environment、キー名、Sensitive区分を特定する。記載がなければ未確認として扱い、過去チャットから補完しない。
3. Vercel等の画面または読取APIで確認できた事実だけを現在状態へ反映する。期待仕様と実際の配置を混ぜない。
4. 変数の追加・変更・削除・Shared Link、再デプロイ、ドメイン割当、Ignored Build Step変更は、それぞれ別の進捗として直後に更新する。
5. 作業終了前に、次回の担当がチャット履歴なしで次の操作と未完了事項を判断できるか確認する。経緯が必要なら `DEVELOPMENT_THREAD_LOG.md` にも要約を残す。
6. 秘密値は記録しない。トークンを含む画面は共有せず、キー名、配置先、最小権限、Sensitive区分、失効・更新期限だけを記録する。

状態表記は次の意味を分ける。

| 状態 | 意味 |
| --- | --- |
| 未登録／未確認 | 値がない、または現在の配置を確認できていない |
| 登録済み | 対象ProjectまたはTeamに変数を保存した |
| Link済み | Shared Variableを指定Projectへ関連付けた |
| 再デプロイ済み | 変更後に新しいDeploymentが作成され、環境変数を読み込んだ |
| 実機確認済み | 対象URLや機能で期待する動作と拒否境界を確認した |

「登録済み」だけで「反映済み」や「実機確認済み」と記録しない。

## コード参照キーの完全性検査

`npm run check:env-ledger`は、リポジトリ内の静的な`process.env.KEY`参照を抽出し、この台帳にキー名が存在するか検査する。さらに、`config/environment-change-registry.json`の各依頼について、対象Project、branch、Environment、Sensitive、操作、状態、再デプロイ要否、一時変数区分とMarkdown台帳へのキー記載を検査する。新しい環境変数をコードへ追加したのに台帳を更新していない場合や、設定依頼の機械可読情報が欠ける場合は`npm run lint`も失敗する。Vercel上の実値や実際の配置は別途画面または読取APIで確認する。

### その他のコード参照キー（配置監査待ち）

以下はコードから参照されるが、Project別の現在配置をまだ監査できていないキーである。System Variableを除き、利用機能を実機確認する前に対象Project、Environment、Sensitive区分を確定する。

| キー | 現在状態 |
| --- | --- |
| `CRON_SECRET` | 配置未監査 |
| `GAME_FIELDS_INSTANCE_ID` | 配置未監査 |
| `GAME_FIELDS_MANAGEMENT_TOKEN` | 配置未監査 |
| `GAME_FIELDS_SDK_URL` | 配置未監査 |
| `GAME_FIELDS_GITHUB_REPOSITORY` | `app-games` Productionだけ。未登録時は`koromo2010/app-games` |
| `GAME_FIELDS_GITHUB_RELEASE_TOKEN` | `app-games` Productionだけ。2026-07-26登録済み。Sensitive、対象repositoryのContents read/writeに限定。新Deployment・実機確認は未実施 |
| `LLM_SESSION_SECRET` | 配置未監査 |
| `NEXT_PUBLIC_GAME_ADS_MODE` | 配置未監査 |
| `OBSERVABILITY_HASH_SECRET` | 配置未監査 |
| `OBSERVABILITY_LOG_LEVEL` | 配置未監査 |
| `OBSERVABILITY_SERVICE_NAME` | 配置未監査 |
| `OPERATIONS_ALERT_EMAIL` | 配置未監査 |
| `PRODUCTION_SMOKE_URL` | GitHub Actionsまたは監視環境の配置未監査 |
| `RATE_LIMIT_HASH_SECRET` | 配置未監査 |
| `REDIS_REQUEST_TIMEOUT_MS` | 配置未監査 |
| `SDK_PORTAL_BASE_URL` | 配置未監査 |
| `SDK_PORTAL_CHANNEL` | 配置未監査 |
| `SDK_REDIS_REST_TOKEN` | `app-games-sdk-dev` Productionへ登録済み。本番SDKへのLinkを依頼中 |
| `SDK_REDIS_REST_URL` | `app-games-sdk-dev` Productionへ登録済み。本番SDKへのLinkを依頼中 |
| `SITE_ADMIN_BREAK_GLASS_ENABLED` | `app-games-dev` Productionへ2026-07-26一時登録・再デプロイ・復旧ログイン確認済み。MFA再登録完了後に削除必須 |
| `SITE_ADMIN_PASSWORD` | `app-games-dev` Productionへ2026-07-26登録・再デプロイ・マスターパスワード認証確認済み。Sensitive |
| `SITE_ADMIN_WEBAUTHN_ORIGIN` | 未登録。`develop`ではコード既定の`https://dev.game-fields.com`を使用するため追加依頼を取消済み |
| `SITE_ADMIN_WEBAUTHN_RP_ID` | 未登録。コード既定でmainは`game-fields.com`、devは`dev.game-fields.com`を使用 |
| `STORAGE_ALERT_THRESHOLD_PERCENT` | 配置未監査 |
| `WORDWOLF_PAIR_COOLDOWN_DAYS` | 配置未監査 |

Vercel／Next.jsが実行時に提供するSystem Variableとして、`NODE_ENV`、`NEXT_RUNTIME`、`VERCEL_ENV`、`VERCEL_GIT_COMMIT_REF`、`VERCEL_GIT_COMMIT_SHA`、`VERCEL_OIDC_TOKEN`、`VERCEL_PROJECT_NAME`、`VERCEL_REGION`もコードから参照する。これらはProject Variableとして手動追加しない。

## 環境構成

| 環境 | Vercelプロジェクト | ブランチ | URL | 用途 |
| --- | --- | --- | --- | --- |
| Production | `app-games` | `main` | `https://game-fields.com` | 一般公開 |
| Development | `app-games-dev` | `develop` | `https://dev.game-fields.com` | 内部開発・検証 |
| SDK Production | `app-games-sdk` | `main` | `https://sdk.game-fields.com` | 外部開発者・安定版Developer Portal |
| SDK Development | `app-games-sdk-dev` | `develop` | `https://sdk-dev.game-fields.com` | 次版SDK・制作者プレビュー管理 |
| Mock Preview Development | `app-games-preview-dev` | `develop` | `https://preview-dev.game-fields.com` | 未審査モックの隔離実行 |
| Mock Preview Production | `app-games-sdk-preview` | `main` | `https://preview.game-fields.com` | 安定版SDKの隔離実行 |

`apps/sdk-portal`は本番`app-games-sdk`と開発`app-games-sdk-dev`へ分け、PostgreSQLは環境別のSDK専用Neonを使う。Redisは無料枠を増やさず既存`sdk-dev-redis`をSDK Portal間だけで共用し、予約キーを本番`sdk:production:`、開発`sdk:development:`へ分離する。本体ゲーム用Redisとは共有しない。隔離実行コードは`apps/sdk-preview`に置き、Portal、本体、devとは別のVercel Projectへ配置する。preview実行ProjectにはDB、Redis、Blob、管理者秘密情報、Git書込権限を与えず、developmentは`koromo2010/game-fields-sdk-mocks-dev`、productionは`koromo2010/game-fields-sdk-mocks`に対する読取専用資格だけを持たせる。

`app-games-dev`は`main`へ入れる本体コードの検証用コピーである。SDK作品は
SDK Portalのcandidateから運営審査を経てmain採用カタログへ直接反映し、
`app-games-dev`やdevelopment SDK catalogを中間昇格先として使わない。

Vercel Teamは `game-fields`（Team ID: `team_Q3rGaf7bwfZZsjaj1vqCg5YO`）。共通秘密情報はTeam Shared Environment Variablesへ置き、環境別データ接続とURLは各Project Variablesへ置く。

SDKは`app-games`と同じGitリポジトリ内の別アプリとして管理するが、Vercel Project、Root Directory、環境変数、DB・Redis・Blobの名前空間は本番・開発から分離する。公開npm packageは`packages/game-sdk`から生成し、SDK用Vercel Projectへ本体の管理者権限や書込用秘密情報をリンクしない。

npm公開はGitHub Actionsの`Publish Game SDK`だけから実施する。GitHub Environmentは`npm-public`、資格名はEnvironment Secret `NPM_TOKEN`とし、`@game-fields` scopeへのread/writeだけを許可するgranular tokenを使う。2026-07-24にnpm Organization `@game-fields`の作成、所有者アカウントの2FA有効化、7日間の初回公開用token発行、`npm-public` Environment、`main`限定branch rule、required reviewer、`NPM_TOKEN`登録、`@game-fields/game-sdk@0.1.0`の初回publishまで完了した。secret値は台帳へ記録しない。残る外部設定は短期tokenの失効とTrusted Publishingへの移行である。

アプリ内の環境判定はVercelのDeployment種別ではなく、`VERCEL_GIT_COMMIT_REF`を優先する。`main`は`production`、`develop`は`development`として扱い、ブランチ情報がないローカル実行などでのみ`VERCEL_ENV`と`NODE_ENV`へフォールバックする。これにより、`app-games-dev`のProduction Deploymentである`develop`を本番アプリと誤認しない。SDK PostgreSQL migrationのbuild gateは`VERCEL_PROJECT_NAME`と`VERCEL_GIT_COMMIT_REF`を同時に検査し、`app-games-sdk-dev/develop`または`app-games-sdk/main`以外ではDBへ接続しない。

VercelのIgnored Build StepはProjectごとに次を設定済み。

- `app-games`: `if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; else exit 1; fi`
- `app-games-dev`: `if [ "$VERCEL_GIT_COMMIT_REF" != "develop" ]; then exit 0; else exit 1; fi`
- `app-games-sdk`: `if [ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ "$VERCEL_GIT_COMMIT_REF" != "develop" ]; then exit 0; else exit 1; fi`
- `app-games-sdk-dev`: `if [ "$VERCEL_GIT_COMMIT_REF" != "develop" ]; then exit 0; else exit 1; fi`
- `app-games-preview-dev`: Production Branchは`develop`へ変更済み。Ignored Build Stepは未確認。設定値は `if [ "$VERCEL_GIT_COMMIT_REF" != "develop" ]; then exit 0; else exit 1; fi`
- `app-games-sdk-preview`: 2026-07-26作成済み。Root Directoryは`apps/sdk-preview`、Node.jsは24.x、Production Branchは`main`。Ignored Build Stepは未確認。設定値は `if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; else exit 1; fi`

VercelではIgnored Build Stepの終了コード`0`がスキップ、`1`がビルド実行を意味する。
公開Starter branchではProject設定の欠落やRoot Directory先行検査にも耐えるため、
snapshot内の`apps/sdk-portal/vercel.json`と`apps/sdk-preview/vercel.json`にも
同じbranch gateを`ignoreCommand`として持たせる。ゲーム提出ZIPからは除外する。

ChatGPTのVercel Connectorは`game-fields` Teamへ再認証済みで、Project一覧、Deployment、Build Logの参照とファイル直接Deploymentは利用できる。一方、現行ConnectorはGit接続、Project設定更新、Project間の独自ドメイン移管を公開していない。これらはVercel Dashboardまたは認証済みCLI／REST APIで行う。

### 本体dev反映用GitHub資格

本番管理画面の`dev → main`はGitHub compareを読んで両branchのSHAを再確認し、
fast-forward可能な場合だけ`force: false`でmain refを更新する。SDK作品の採用APIと
資格を共有しない。

| キー | 配置先 | Sensitive | 現在状態 | 用途 |
| --- | --- | --- | --- | --- |
| `GAME_FIELDS_GITHUB_REPOSITORY` | `app-games` Production | No | 未登録。既定`koromo2010/app-games` | compareとref更新の対象repository |
| `GAME_FIELDS_GITHUB_RELEASE_TOKEN` | `app-games` Production | Yes | 2026-07-26登録済み。新Deployment・実機確認は未実施 | `koromo2010/app-games`だけのContents read/write。管理画面の`dev → main`実行時に必須 |

このtokenは`app-games-dev`、SDK Portal、隔離Previewへ設定しない。設定後は
`app-games`を再デプロイし、管理画面で差分読取、分岐時拒否、MFA後の
fast-forwardを実機確認する。

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
| `SHARED_OPENAI_API_KEY` | `OPENAI_API_KEY` | Yes | Link済み | Link済み | リンクしない | OpenAI API | 本体2 ProjectだけLink済み。SDK Portal／隔離Previewへ渡さない |
| `SHARED_GEMINI_API_KEY` | `GEMINI_API_KEY` | Yes | Link済み | Link済み | リンクしない | Gemini API | 本体2 ProjectだけLink済み。SDK Portal／隔離Previewへ渡さない |
| `SHARED_GROQ_API_KEY` | `GROQ_API_KEY` | Yes | Link済み | Link済み | リンクしない | Groq API | 本体2 ProjectだけLink済み。SDK Portal／隔離Previewへ渡さない |
| `SHARED_RESEND_API_KEY` | `RESEND_API_KEY` | Yes | Link済み | Link済み | Link予定 | Resendメール送信（復旧用メール確認・パスワード再設定・運用通知） | 両Project Link済み・コード対応済み。2026-07-23にResend Dashboardで`game-fields.com`のVerifiedとDKIM・SPF・MX成功を確認し、Developmentからの確認メール再送と受信を実機確認済み |
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
| `GAME_FIELDS_ENV` | `production` | `development`（candidate実行だけ`candidate-preview`） | `sdk-portal`、隔離Previewは`candidate-preview` | No | SDK Room、effect、quota、履歴の環境namespace。未知値は起動・request時に拒否 |
| `APP_ENV` | `production` | `development` | `sdk` または専用値を将来定義 | No | アプリ環境識別 |
| `APP_DATABASE_ENV` | `production` | `development` | `sdk` | No | アプリDB誤接続防止 |
| `REDIS_ENV` | `production` | `development` | `sdk` | No | Redis誤接続防止 |
| `BLOB_ENV` | `production` | `development` | `sdk` | No | Blob誤接続防止 |
| `APP_BASE_URL` | `https://game-fields.com` | `https://dev.game-fields.com` | `https://sdk.game-fields.com` | No | 絶対URL・メールリンク等 |
| `SDK_PORTAL_INTERNAL_URL` | `https://sdk.game-fields.com` | `https://sdk-dev.game-fields.com` | 不要 | No | 本体が制作者catalog、既存所有者判定、SDKダッシュボード導線へ使うPortal接続先。branch fallbackはローカル互換用で、Vercelでは明示登録する |

### PostgreSQL / Neon

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `APP_DATABASE_URL` | `app-games-neon` | `dev-neon` | SDK専用DB予定 | Yes | アプリDB正本 |
| `SHARED_VOCABULARY_DATABASE_URL`（旧 `VOCABULARY_DATABASE_URL`） | `word-master-neon` 読取用 | `word-master-neon` 開発用権限 | 原則読取専用 | Yes | 共通単語DB |
| `SHARED_VOCABULARY_ADMIN_DATABASE_URL`（旧 `VOCABULARY_ADMIN_DATABASE_URL`） | 管理者ロール | 管理・生成用ロール | 原則リンクしない | Yes | 採否・昇格・管理処理 |
| `LEGACY_WORD_DATABASE_URL` | 原則なし | 移行作業中だけ | なし | Yes | 旧語彙本体および旧`standard-game`分類の読取専用移行元 |

2026-07-25に`LEGACY_WORD_DATABASE_URL`を`app-games-dev` Productionへ
Project Variable・Sensitiveとして登録し、`vocabulary_migration_reader`へ旧2表の
一時`SELECT`権限を付与した。旧347行を346語へ正規化し、共通DBへ不足していた27語の
冪等同期、対応346語・不足0の再dry-run、easy 119／normal 164／hard 63の分類適用、
「度者」が審査済み集合に含まれないことの読取確認まで完了した。
一時build hookは撤去済みである。Project Variableと旧DBの一時読取権限は、
利用者による削除確認が終わるまで残存扱いとする。

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

#### Development本体 現在配置（2026-07-22確認）

この表は`app-games-dev`のVercel Dashboardで確認した現在状態を記録する。登録済みでも、再デプロイまたは実機確認が終わっていないものは分けて扱う。

| キー／リソース | Vercel対象 | Sensitive | 現在状態 | 次の対応 |
| --- | --- | --- | --- | --- |
| `PLAYER_SESSION_SECRET` | Production | Yes | Project Variableの登録を画面確認済み・追加後の再デプロイ済み。未設定エラーの解消を実行ログで確認済み | DB・Redis復旧後に登録・ログインを実機確認 |
| `SDK_ACCOUNT_LINK_SECRET` | Production | Yes | 2026-07-27、Project VariableのSensitive登録をVercel画面で確認。現行Deployment上でSDK Portalが発行した`test1`のcreator限定Preview linkを本体`POST /api/sdk-preview/session`が200で交換し、両Projectのdev専用値一致と再デプロイ反映を実Networkで確認済み | moi-dev本人で表アカウント→SDK Portal `/dashboard`の所有者SSOを確認 |
| `LEGACY_WORD_DATABASE_URL` | Production | Yes | Project Variable登録済み。旧347行→346語、不足27語同期、分類適用、回帰確認まで完了。一時build hookは撤去済み | Project Variableを削除し、旧2表の一時`SELECT`とschema `USAGE`をrevokeした後、通常commitを再デプロイ |
| 既存`DATABASE_URL` | Production | Yes | Project Variableの存在を画面確認済み。接続先の正当性は未確認で、現行APIではPostgreSQL接続エラー | 削除せず保持。新Neonをコード側で明示選択後に廃止判断 |
| `app-games-dev-neon` | Production | Integration管理 | Singapore、Authなし、Freeで作成し`app-games-dev`へ接続済み。`0773a78`の再デプロイ後、アカウント照会でschema自動適用と接続を確認済み | 新規登録・ログインの画面実機確認 |
| `NEON_DATABASE_*`一式 | Production | Yes | Neon Integrationによる自動登録を画面確認済み。`NEON_DATABASE_URL`、unpooled URL、Postgres互換変数等を含む。コード優先切替・再デプロイ・接続確認済み | 旧`DATABASE_URL`の廃止は新規登録確認後に判断 |
| `sdk-dev-redis`共有リソース | Production | Integration管理 | `app-games-sdk-dev`用Free Redisを`app-games-dev`にも接続したことを画面確認済み | SDKは既存の`sdk:`キー、dev本体はコードで`app-dev:`キーへ分離して利用 |
| `DEV_REDIS_REDIS_URL` | Production | Yes | Integrationによる登録を画面確認済み。`0773a78`で再デプロイ済み | REST資格が利用できない場合のsocket fallback。fallback自体は未試験 |
| `DEV_REDIS_KV_URL` | Production | Yes | Integrationによる登録を画面確認済み | 互換用。コードはREST API URLを優先 |
| `DEV_REDIS_KV_REST_API_URL` | Production | Yes | Integrationによる登録を画面確認済み。`0773a78`で再デプロイ後、アカウントAPIのレート制限処理が通ることを確認済み | `DEV_REDIS_KV_REST_API_TOKEN`と対で優先利用 |
| `DEV_REDIS_KV_REST_API_TOKEN` | Production | Yes | Integrationによる登録を画面確認済み。`0773a78`で再デプロイ後、実機接続確認済み | `app-dev:`名前空間でのみ書込。SDK側との論理分離を継続監視 |
| `DEV_REDIS_KV_REST_API_READ_ONLY_TOKEN` | Production | Yes | Integrationによる登録を画面確認済み | 現行サーバーコードでは未使用 |
| `SDK_PORTAL_INTERNAL_URL` | Production | No | 2026-07-27、`app-games-dev`のProduction Variableへ`https://sdk-dev.game-fields.com`を登録済み（Vercel画面で「Added just now」を確認）。登録直後にVercelが自動でDeployment `dpl_7FdpHdwicpiNkBKTmkocPpTRHZah`（commit `bbb7efd`、develop）を作成し、`READY`・`dev.game-fields.com`へのalias反映を確認済み。非所有者`test1`で`moi-lab`を開き、アカウントメニューにSDKダッシュボード導線が表示されないことを実ブラウザで確認済み。moi-devの資格情報は運営側で保有していないため、所有者本人でのリンク表示・クリック・SSO・`/dashboard`到達は未確認。`lib/sdk-dashboard-navigation.ts`と`tests/sdk-dashboard-navigation.test.ts`では、所有者判定がクライアント自己申告ではなく`app/api/sdk-preview/[creatorSlug]/owner`経由でSDK Portal側DBへ照会するサーバー側チェックであり、`isLoggedIn && isCreatorOwner`が両方真の場合だけリンクを返すことを回帰テスト済み | moi-dev本人による、ログイン時のリンク表示・クリック・SSO・`/dashboard`到達の確認待ち |
| `SDK_PROMOTION_INTERNAL_URL` | Production / Preview | No | 未登録時は`https://sdk.game-fields.com` | dev・main両方の運営管理画面から、SDK本番の正式提出候補をmain採用する内部接続先 |
| `SITE_ADMIN_PASSWORD` | Production | Yes | Project Variable登録・再デプロイ済み。マスターパスワードで復旧ログインを実機確認済み | 秘密値を安全な保管先で管理。Gitへ値を保存しない |
| `SITE_ADMIN_BREAK_GLASS_ENABLED` | Production | No | `true`を一時登録・再デプロイし、MFAリセットを実機確認済み | WebAuthn再登録と通常ログイン確認後、変数を削除して再デプロイ |
| `SITE_ADMIN_WEBAUTHN_ORIGIN` | Production | No | 未登録。`VERCEL_GIT_COMMIT_REF=develop`から`https://dev.game-fields.com`を選ぶコード既定へ変更 | Project Variable追加は不要。変更後Deploymentでパスキー認証を実機確認 |
| `SITE_ADMIN_WEBAUTHN_RP_ID` | Production | No | 未登録。コード既定値`dev.game-fields.com`を使用 | 追加不要。旧`game-fields.com`資格情報をMFA再設定で削除し、dev専用パスキーを再登録して通常ログインを確認 |

`NEON_DATABASE_*`は既存`DATABASE_URL`と衝突させず新Neonを識別するためのIntegration接頭辞である。コードは`APP_DATABASE_URL`、`NEON_DATABASE_URL`、旧`DATABASE_URL`の順で選ぶ。2026-07-22に`0773a78`のProduction DeploymentがREADYとなり、存在しない資格で`POST /api/player-account`を実行して`401 INVALID_CREDENTIALS`を確認した。この経路はRedisレート制限とPostgreSQLの`ensurePostgresSchema`・アカウント照会を通るため、開発Redis接続と開発Neonへのschema自動適用・接続は確認済みである。新規登録・ログインのブラウザ実機確認は別途行う。

### Redis / Upstash

現在の契約は Vercel Storage上の `wy-app-games`、Upstash for Redis Fixed 250MB。

| キー | Production | Development | SDK | Sensitive | 用途 |
| --- | --- | --- | --- | --- | --- |
| `APP_REDIS_URL` | 本番Redis | 開発Redis | SDKでは未使用 | Yes | Redis接続文字列正本候補 |
| `UPSTASH_REDIS_REST_URL` | 本番 | 開発 | 互換読取のみ | Yes | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | 本番 | 開発 | 互換読取のみ | Yes | Upstash REST Token |
| `SDK_REDIS_REST_URL` | 不要 | 不要 | `sdk-dev-redis`をSDK本番・開発Portalだけで共用 | Yes | SDK予約registry専用REST URL |
| `SDK_REDIS_REST_TOKEN` | 不要 | 不要 | `sdk-dev-redis`をSDK本番・開発Portalだけで共用 | Yes | SDK予約registry専用REST Token |

互換変数として残っている可能性があるもの:

- `REDIS_URL`
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

開発本体は共有Free Redisの`DEV_REDIS_KV_REST_API_URL` / `DEV_REDIS_KV_REST_API_TOKEN`を旧Redis変数より優先し、Redisアクセス層で全キーへ`app-dev:`を付ける。SDK Portalは`apps/sdk-portal/lib/instance-registry-namespace.ts`で、`main`を`sdk:production:preview-instance:v1:`、`develop`を`sdk:development:preview-instance:v1:`へ分離する。`develop`は切替前の7日予約を保護するため旧`sdk:preview-instance:v1:`も一時的に読み、本番は読まない。Vercelのその他Production branchでは名前空間を解決せずfail-closedにする。`DEV_REDIS_REDIS_URL`はREST資格が利用できない場合のsocket fallbackである。

### SDK mock Git・隔離Preview

モックのGit保存先は`app-games`とは別のGame Fields管理下の非公開リポジトリとする。Portalの書込資格とpreview実行Projectの読取資格は同じ値を使わず、各資格をその専用リポジトリだけへ限定する。

| キー | SDK Portal | Isolated Preview | Sensitive | 用途 |
| --- | --- | --- | --- | --- |
| `SDK_PREVIEW_SIGNING_SECRET` | 必須・環境別。Ed25519秘密鍵を導出してclient／server grantを署名 | 固定revision・正規化済みasset path・期限へ限定したasset tokenのHMAC署名専用。Cookieには使わず、Portalと同じ値にしない | Yes | Previewは固定したPortal公開鍵だけでgrantをローカル検証する。公開鍵は秘密情報ではなくコードへ固定し、通常実行時にPortalへ照会しない。いずれの秘密値も32byte以上 |
| `SDK_PREVIEW_BASE_URL` | `https://preview-dev.game-fields.com`または本番preview | 不要 | No | Portalがiframe実行URLを組み立てる |
| `SDK_PREVIEW_FRAME_ANCESTORS` | 不要 | 対応するSDK Portal originだけ | No | CSP `frame-ancestors`の許可元 |
| `SDK_MOCK_GITHUB_REPOSITORY` | 専用非公開`owner/repo` | 同じリポジトリ | No | モックGit正本。`app-games`を使わない |
| `SDK_MOCK_GITHUB_BRANCH` | 既定`sdk-previews` | 不要 | No | Portalが更新する専用branch |
| `SDK_MOCK_GITHUB_WRITE_TOKEN` | 必須・Contents read/writeだけ | 絶対に設定しない | Yes | 制作者slug/game配下への自動commit |
| `SDK_MOCK_GITHUB_READ_TOKEN` | 絶対に設定しない | 必須・Contents readだけ | Yes | 確定commitのasset取得 |
| `SDK_ACCOUNT_LINK_SECRET` | Game Fields本体と同じ環境値 | 不要 | Yes | 表アカウントからSDKへ渡す60秒の署名コード、SDKブラウザセッション、Portalから本体Previewへ戻すcreator限定60秒コードの署名。本体は最後のコードを`/api/sdk-preview`限定・8時間のHttpOnly Cookieへ交換し、通常プレイヤー権限へ昇格しない。OAuth access／refresh tokenはSDK PostgreSQLへハッシュ保存し、この値をtokenとして流用しない。32文字以上 |
| `SDK_DEVELOPMENT_INTERNAL_URL` | main Portalだけ任意。既定`https://sdk-dev.game-fields.com` | 不要 | No | `dev app → main app`でdevの固定package artifactをservice認証付き取得する接続先 |
| `GAME_FIELDS_APP_BASE_URL` | 対応する本体URL | 不要 | No | SDK Portalが共通アカウント認証へ遷移する接続先 |
| `GAME_FIELDS_PREVIEW_APP_URL` | 対応する本体URL | 不要 | No | 制作者URLで本体のログイン・広場・固定カードUIを全画面表示する接続先。未設定時はbranch別の公式URL |

preview実行Projectには`SDK_DATABASE_URL`、SDK Redis、管理者・本体資格、`SDK_MOCK_GITHUB_WRITE_TOKEN`をリンクしない。SDK本番とSDK-devでは署名鍵、Gitリポジトリまたはbranch、資格を分け、devの未審査mockが本番SDKへ現れないようにする。

SDK `content-source`の実DB adapter、module lab、Preview中継API `/api/sdk-preview/content-source`は本体`app-games`／`app-games-dev`で動作する。一般語・ワードペア・語釈はいずれも両本体ProjectへLink済みの共通`VOCABULARY_DATABASE_URL`だけを読み、環境別`APP_DATABASE_URL`へ単語表を複製しない。Roomと認証は従来どおり環境別アプリDBを使う。`app-games-sdk*`および`app-games-preview*`へこれらのDB変数を追加・Linkしない。隔離iframeは外側ShellへのpostMessageだけを使い、DB接続、内部ID、直接endpointを受け取らない。opaque content IDの認証付き暗号化鍵は本体の既存`PLAYER_SESSION_SECRET`から導出し、新しい外部変数は追加しない。

SDK `llm` adapter、module lab、Preview中継API `/api/sdk-preview/llm`も本体`app-games`／`app-games-dev`で動作し、既存の共通LLM変数と利用者の暗号化HttpOnly Cookieだけを使用する。`app-games-sdk*`および`app-games-preview*`へOpenAI・Gemini・GroqのAPIキー、`LLM_SESSION_SECRET`、`LLM_ACCESS_PASSWORD`を追加・Linkしない。iframeと公開SDKへ渡すのはtask、送信内容、prompt version、任意の返却schemaだけで、新しい外部変数は追加しない。

#### SDK Development 現在配置（2026-07-27確認）

この表は期待仕様ではなく、Vercel Dashboardで確認した現在の配置を記録する。秘密値は記録しない。環境変数を追加・変更・削除した場合は、再デプロイ前にこの表を更新する。

| キー | `app-games-sdk-dev` | `app-games-preview-dev` | Vercel対象 | 状態 |
| --- | --- | --- | --- | --- |
| `SDK_PREVIEW_SIGNING_SECRET` | development用Team Sharedを再Link済み | 同じdevelopment用Team Sharedを再Link済み | Production | 2026-07-27に両Projectを再デプロイし、Portal `/api/health`の`previewSigning: ok`を確認済み |
| `SDK_DATABASE_URL` | SDK development専用NeonをLink済み、Sensitive | 設定禁止・未設定 | Production | migration 005適用・`schemaVersion: 5`確認済み。分岐統合後のmigration 006と`schemaVersion: 6`確認待ち |
| `SDK_PREVIEW_BASE_URL` | 未登録。コード既定値`https://preview-dev.game-fields.com`を使用 | 不要 | Production | previewドメイン割当・Valid Configuration確認済み |
| `SDK_PREVIEW_FRAME_ANCESTORS` | 不要 | 未登録。`develop`時のコード既定値として外枠`https://sdk-dev.game-fields.com`と、ゲーム固有iframeの直近親`https://dev.game-fields.com`を許可 | Production | 本体UI共用後の二段iframeに対応。明示設定する場合も両originが必要 |
| `SDK_MOCK_GITHUB_REPOSITORY` | Project Variable登録済み。値はdev専用private repository | Project Variable登録済み | Production | 追加後Deployment作成済み、保存成功を実機確認済み |
| `SDK_MOCK_GITHUB_BRANCH` | 未登録。コード既定値`sdk-previews`を使用 | 不要 | Production | 初回mock保存時にbranchを自動作成 |
| `SDK_MOCK_GITHUB_WRITE_TOKEN` | Project Variable、Sensitive登録済み | 設定禁止・未設定 | Production | 専用private repoのContents read/writeだけ。保存成功を実機確認済み |
| `SDK_MOCK_GITHUB_READ_TOKEN` | 設定禁止・未設定 | Project Variable、Sensitive登録済み | Production | 専用private repoのContents read-onlyだけ |
| `SDK_ACCOUNT_LINK_SECRET` | Project Variable、Sensitive登録を画面確認済み | 設定禁止・未登録 | Production | 2026-07-27、Portal発行の`test1` creator限定Preview linkを本体`POST /api/sdk-preview/session`が200で交換し、本体developとの同値・再デプロイ反映を実Networkで確認済み。moi-dev本人による表アカウント→Portal `/dashboard`の所有者SSOだけ未確認 |
| `GAME_FIELDS_APP_BASE_URL` | Project Variable登録を画面確認済み（`https://dev.game-fields.com`） | 不要 | Production | 追加後のSDK Portal再デプロイ済み。表アカウント側DB復旧後にSSO実機確認 |
| `GAME_FIELDS_PREVIEW_APP_URL` | 未登録。developコード既定値`https://dev.game-fields.com`を使用 | 不要 | Production | 本体UI共用の制作者URLを実機確認後、必要な場合だけ明示設定 |

#### SDK Development 外部設定の進捗（2026-07-27確認）

| 対象 | 現在状態 | 次の確認 |
| --- | --- | --- |
| private mock Git | `koromo2010/game-fields-sdk-mocks-dev`作成済み。Repository変数追加後、`test10-1`の初回保存と`sdk-previews` branch作成に成功 | 内部`mock`名称をgame package名称へ段階移行する |
| Portal Vercel Project | `app-games-sdk-dev`、Root Directory `apps/sdk-portal`、Production Branch `develop`。OAuth接続、4 tool表示、`test10-1`保存を確認済み。カタログ分離コミット`38bf4ab`のPortal・本体dev DeploymentがREADY。`/test10-1`の本体広場には保存済み「21ゲーム」だけが表示され、組み込みゲームカードがないこと、`/test10-1/games/twenty-one-misere`が200であることを実機確認済み | ブラウザ上のログイン後操作とゲーム進行を確認する |
| Preview Vercel Project | `app-games-preview-dev`、Root Directory `apps/sdk-preview`、Production Branch `develop` | Tailwind依存修正コミット`dfdab59`のProduction DeploymentがREADY |
| Preview domain | `preview-dev.game-fields.com`割当済み・Valid Configuration。`/health`が200で隔離preview serviceを返す | Portalからのmock保存・iframe表示確認 |
| 不要Project候補 | `app-games-sdk-portal`が作成途中に増加。custom domainなし | 使用予定がないことを再確認後に削除判断 |

#### SDK Production 現在配置（2026-07-26確認）

| キー | `app-games-sdk` | `app-games-sdk-preview` | Vercel対象 | 状態 |
| --- | --- | --- | --- | --- |
| `SDK_PREVIEW_SIGNING_SECRET` | Project Variable、Sensitive。Ed25519秘密鍵導出とgrant署名 | Project Variable、Sensitive。固定revision／asset pathのHMAC署名だけ | Production | 2026-07-27の本番403で同一値との記録を撤回。Ed25519公開鍵検証へ移行し、cross-project同値依存、汎用検証API、Preview Cookieを廃止。本番公開鍵はPortalの第1段階Deploymentから取得してコードへ固定済み。第2段階再デプロイ・実機確認待ち |
| `SDK_MOCK_GITHUB_REPOSITORY` | `koromo2010/game-fields-sdk-mocks` | 同じprivate repository | Production | 両Projectへ登録・再デプロイ済み |
| `SDK_MOCK_GITHUB_WRITE_TOKEN` | Project Variable、Sensitive | 設定禁止・未設定 | Production | 対象repositoryのContents read/writeだけ。90日期限 |
| `SDK_MOCK_GITHUB_READ_TOKEN` | 設定禁止・未設定 | Project Variable、Sensitive | Production | 対象repositoryのContents read-onlyだけ。90日期限 |
| `SDK_DATABASE_URL` | `app-games-sdk-neon`をIntegrationでLink、Sensitive | 設定禁止・未設定 | Production | 正しい変数名で登録後にmain Deployment作成済み。main反映時のmigration 005・006と`schemaVersion: 6`確認待ち |
| `SDK_REDIS_REST_URL` | `sdk-dev-redis`のLink依頼中、Sensitive | 設定禁止・未設定 | Production | コード側の本番・開発prefix分離後にLinkする |
| `SDK_REDIS_REST_TOKEN` | `sdk-dev-redis`のLink依頼中、Sensitive | 設定禁止・未設定 | Production | コード側の本番・開発prefix分離後にLinkする |

| 対象 | 現在状態 | 次の確認 |
| --- | --- | --- |
| private package Git | `koromo2010/game-fields-sdk-mocks`をPrivateで作成済み。Portal書込資格とPreview読取資格を分離 | 本番package保存後に専用branch・commit・読取を実機確認 |
| Portal Vercel Project | `app-games-sdk`、Root Directory `apps/sdk-portal`、Production Branch `main`。`main@0e7889c`のDeploymentがREADY。`app-games-sdk-neon`はProductionだけへLink済み | RedisをLinkし、develop統合後のbuild migrationで`schemaVersion: 6`を確認 |
| Preview Vercel Project | `app-games-sdk-preview`、Root Directory `apps/sdk-preview`、Node.js 24.x、Production Branch `main`。production専用の署名鍵・Git読取資格だけを登録し再デプロイ済み | main同期後のDeploymentを確認 |
| Preview domain | `preview.game-fields.com`割当済み・Valid Configuration | `/health`とPortal発行grantからのpackage読取を実機確認 |

本番PreviewにはSDK DB、Redis、Blob、管理者資格、語彙DB、LLM資格、Git書込資格を追加しない。
`app-games-sdk`と`app-games-sdk-preview`の`Production Branch`は`main`へ統一済み。

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
| `SHARED_RESEND_API_KEY`（旧 `RESEND_API_KEY`） | Shared | Yes | 復旧用メールの所有確認、パスワード再設定、運用通知に使用。SDK一般公開時は共通キーを直接リンクしない。2026-07-23にResend Dashboardで`game-fields.com`のVerifiedとDKIM・SPF・MX成功を確認し、Developmentからの確認メール再送と受信を実機確認済み |
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
- Productionの`APP_REDIS_URL`とUpstash REST変数のどちらが現在の正本か
- Production / DevelopmentそれぞれのBlob Store名
- SDK環境のDB・Redis・Blob分離方式
- 旧互換変数を削除できる時期

Vercelの変数一覧を確認するたび、この文書へ変数名と配置だけを追記する。値は記載しない。
