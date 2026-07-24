# app-games 開発引き継ぎ

> 新規ゲームは `config/game-registry.json` を正本として登録し、`docs/NEW_GAME_CHECKLIST.md` に従う。`npm run lint` はゲーム共通要件の自動監査も実行する。
>
> 資料を読む順番や作業別の参照先は `docs/README.md` を入口にする。この文書は「現在の開発状態と共通仕様」、`docs/CONTAINER_ARCHITECTURE.md` は「将来案」である。

最終更新: 2026-07-24

## アカウント言語と言語依存ルーム

- `lib/app-locale.ts` をアカウント／UI言語の登録先とする。言語がない旧アカウント・旧セッション・旧ルームは `ja` として扱う。
- `lib/game-language.ts` を言語依存ゲームのサーバーポリシーとする。将来の言語は、各ゲームの単語・お題・コンテンツ供給元が対応した後で `gameContentLocales` に追加する。
- 言語依存ゲームはワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、コードインターセプト。保存Roomの `contentLocale` は認証済みアカウントから設定し、リクエストJSONは信用しない。
- 部屋一覧・作成・招待コード参加・観戦はアカウント言語をサーバーで検査する。大富豪など言語非依存ゲームは異なる言語設定の参加者が混在できる。
- 言語変更はマイページだけに置く。言語依存ゲームの部屋へ参加中は `/api/player-session` が `PLAYER_LOCALE_ACTIVE_ROOM` で変更を拒否する。
- Postgres `player_accounts.locale`、Redisプレイヤーセッション、ブラウザセッションは同じ値を持つ。Postgresの旧行はスキーマ更新時に `ja` が入る。
- 共通UI辞書は `lib/app-i18n.ts`、クライアントの現在言語は `AppLocaleProvider` を正本とする。プレイヤーセッション保存時のイベントで `<html lang>` と表示を同期する。中国語などを追加するときは `app-locale.ts` と同じ辞書キーの言語辞書を追加する。
- アプリ内ページへの通常リンクは `app/components/AppLink.tsx` を使い、現在言語を付けたURLへ直接遷移する。`next/link`を直接使って接頭辞なしURLからlocale redirectを1往復増やさない。プログラム遷移も `localizedAppHref` と `RouteTransitionProvider` を通す。
- Englishでは広場、ログイン、マイページ、共通ルーム操作、大富豪（オンライン／CPU練習／ルール）を表示できる。言語非依存ゲームは英語・日本語アカウントが同じ部屋で遊べるが、英語UI未完了のゲームは `isGameUiLocaleAvailable` で広場の起動導線だけを止める。
- 言語依存ゲームのコンテンツは現在日本語だけ。ゲーム側でお題・単語・画面を明示的に対応し `gameContentLocales` へ追加するまでは、English設定から日本語部屋を作成・閲覧・参加できず、広場カードも起動不可として表示する。

## ブランド・法務ページ

- 正式ブランドは `GAME FIELDS`、小さい日本語表記は「ゲームフィールド」。ゲーム選択画面は「広場」、各ゲームの部屋募集・待機画面は「ロビー」と呼ぶ。
- 共通フッターから `/terms`、`/privacy`、`/contact` へ導線を持つ。現行TC・PPバージョンは `lib/legal.ts` を正本とする。
- 新規アカウント作成はTC・PPへの明示同意を必須とし、APIでもバージョンを検証する。同意バージョンと日時はアカウントへ保存する。
- 独自の有料機能を導入するときは、料金ページ、申込み直前表示、解約・返金条件、利用規約改定、必要な特定商取引法表示を同時に追加する。

## 1. プロジェクト

- 作業対象: `app-games`
- GitHub: `https://github.com/koromo2010/app-games`
- 本番: `https://www.game-fields.com`（Vercel URL: `https://app-games-orcin.vercel.app`）
- Next.js App Router / React 19 / TypeScript
- RedisはUpstash互換REST APIを使用
- 元の `paper-ai-app` とは完全に別物として扱う

## 2. 最初に確認する場所

| 目的 | 主なファイル |
| --- | --- |
| 共通LLM経路 | `lib/game-llm.ts`, `lib/llm-model.ts`, `lib/gemini.ts`, `lib/groq.ts` |
| 有料API切替 | `lib/llm-access.ts`, `app/api/llm-access/route.ts`, `app/components/PaidLlmAccessButton.tsx` |
| 共通フィードバック/RAG | `lib/game-feedback-store.ts`, `lib/game-ai-types.ts`, `app/api/game-feedback/route.ts`, `app/components/GameFeedbackPanel.tsx` |
| 共通部屋設定 | `lib/room-defaults-store.ts`, `lib/game-room-defaults-client.ts`, `app/components/RoomConfigSummary.tsx` |
| 共通トランプ基盤 | `lib/playing-cards.ts`, `lib/playing-card-presentation.ts`, `app/components/PlayingCard.tsx`, `app/components/PlayingCardHand.tsx`, `app/components/PlayingCardBackStack.tsx` |
| 大富豪 | `lib/daifugo.ts`, `lib/daifugo-room-store.ts`, `app/daifugo/DaifugoGame.tsx`, `app/daifugo/DaifugoPractice.tsx`, `docs/DAIFUGO.md`（3〜6人オンライン＋CPU練習） |
| 共通部屋操作 | `app/components/OnlineRoomLifecycleActions.tsx`, `app/components/RoomResultActions.tsx` |
| 共通AI通信表示 | `lib/ai-activity-client.ts`, `app/components/AiActivityVital.tsx`, `app/components/GameTopBanner.tsx` |
| 共通ページ遷移 | `app/components/AppLink.tsx`, `app/components/RouteTransitionProvider.tsx`, `app/components/PageLoadingOverlay.tsx`, `app/loading.tsx` |
| 共通時間制限 | `lib/game-room-config.ts`, `app/components/RoomTimeLimitControl.tsx` |
| 共通デバッグ認証・操作 | `lib/debug-access.ts`, `app/components/DebugModeButton.tsx`, `app/components/DebugToolWindow.tsx`, `app/components/DebugGameTools.tsx`, `app/components/DebugParticipantControls.tsx`, `app/api/debug-auth/route.ts`, `app/users/me/UserDashboard.tsx` |
| ゲーム公開範囲 | `config/game-registry.json` の `private`, `lib/game-access.ts`, `lib/private-game-access.ts`, `app/api/private-game-access/route.ts` |
| ゲーム登録・自動監査 | `config/game-registry.json`, `scripts/check-game-standards.mjs`, `docs/NEW_GAME_CHECKLIST.md` |
| ゲーム開発SDK | `packages/game-sdk`, `packages/game-runtime`, `lib/game-sdk-platform-adapter.ts`, `lib/online-room-store-runtime.ts`, `sdk/entry/START_GAME_FIELDS.md`, `sdk/starter-template`, `scripts/create-game.mjs`, `scripts/build-game-sdk-starter.mjs`, `scripts/build-game-sdk-starter-repository.mjs`, `scripts/check-game-sdk-boundaries.mjs`, `scripts/check-game-sdk-package.mjs`, `scripts/check-game-sdk-starter.mjs`, `docs/CHATGPT_GAME_SDK.md` |
| SDK Developer Portal / 隔離mock | `apps/sdk-portal`, `apps/sdk-preview`, `packages/sdk-preview-auth`, `npm run build:sdk`, `npm run build:sdk-preview`, `docs/EXTERNAL_GAME_PACKAGE.md` |
| 共通戦績・マイページ | `lib/player-stats-store.ts`, `app/api/player-stats/route.ts`, `app/users/me/UserDashboard.tsx` |
| ログイン後の部屋復元・広場の復帰一覧 | `app/hooks/use-online-game-session-restore.ts`, `app/api/player-active-rooms/route.ts`, `lib/player-active-room-summary.ts`, `app/games/use-lobby-room-data.ts` |
| 実プレイ時間統計 | `lib/game-duration-statistics.ts`, `lib/game-duration-store.ts`, `app/api/game-duration/route.ts`, `app/games/page.tsx` |
| 全ゲーム対戦プレイバック | `lib/game-replay-store.ts`, `app/api/player-replays/route.ts`, `app/components/GameReplayPanel.tsx`, `docs/GAME_REPLAYS.md` |
| アカウント・メール復旧 | `lib/player-account-store.ts`, `lib/player-account-session.ts`, `lib/player-password-reset.ts`, `lib/email.ts`, `app/api/player-account/route.ts`, `app/api/player-password-reset/route.ts`, `app/reset-password` |
| ワードウルフ | `app/wordwolf`, `app/api/wordwolf`, `lib/wordwolf-room-store.ts` |
| たほい屋 | `app/tahoiya/TahoiyaGame.tsx`, `app/api/tahoiya`, `lib/tahoiya-room-store.ts`, `lib/tahoiya-types.ts` |
| ワードスケール | `app/word-scale`, `app/hodoai-talk/HodoaiTalkGame.tsx`, `app/api/hodoai/rooms`, `lib/hodoai-room-store.ts` |
| ワードソナー | `app/kotoba-senpuku`, `app/api/kotoba-senpuku/rooms`, `lib/kotoba-senpuku-room-store.ts`, `lib/kotoba-senpuku.ts`（公開ゲーム。ログイン必須、非公開アクセスキー不要） |
| コードインターセプト | `app/games/code-intercept`, `app/code-intercept`, `app/api/code-intercept/rooms`, `lib/code-intercept-room-store.ts`, `lib/code-intercept.ts`（非公開チーム対抗試作） |
| キャンバス | `app/canvas/CanvasGame.tsx`, `app/canvas/canvas-room-api-client.ts`, `app/canvas/canvas-lobby-board-api-client.ts`, `app/canvas/use-canvas-sync.ts`, `app/canvas/use-canvas-stroke-queue.ts`, `lib/canvas-sync-policy.ts`, `app/components/DrawingCanvas.tsx`, `lib/drawing-canvas.ts`（非公開の描画UI試作。共同部屋・広場のHTTP通信、同期時計、ポインター描画送信は画面から分離。GETはETag、途中線は間引き。広場は初回取得後、キャンバス操作から30秒だけ同期し、共同部屋は継続同期） |
| たほい屋の問題再利用 | `lib/tahoiya-topic-catalog.ts`, `app/api/tahoiya/topic/route.ts` |
| お題候補DB・経験履歴の目標設計 | `docs/TOPIC_HISTORY_DATABASE.md` |

SDK v1は、manifest、Game→Controller→LayoutのUI三層、認証済みID・表示名をactorとして注入するserver module、閲覧者別RoomView、revision付きCommand、DB不要のMock Runtimeまでを提供する。新規online-roomゲームは`defineGameSdkOnlineRoomAppSet`へゲーム固有state・Command・Viewだけを登録し、`createGameSdkOnlineRoomModule`で既存のSDK基本セットと合成する。基本セットはRoom作成、ホスト、参加・退出、設定、revision、共通permissions、内部player IDを除いたseat形式の共通View、中断・再戦を所有する。共通module catalogは`@game-fields/game-sdk/modules`を正本とし、新規mockは全38件必須で開始する。制作AIと管理トークンはprofileを変更できず、初回は全38件必須とだけ認識する。モック承認後のMCPは確定済み`requiredModuleIds`に加え、各moduleの`delivery`、`packageExports`、`publicApis`、`usage`を`requiredModules`として返す。必須・解除可・任意の内部分類はSDK Portalの所有者画面へ閉じる。profileは本体の`online-room-route-factory`、`online-room-store-runtime`、`@game-fields/game-runtime`、共通UIと純粋domain部品の採用レシピであり、SDK側へ同等基盤を複製しない。SDK-devはcatalogとは別の実装レジストリで全IDを本体共通部品、SDK helper、またはPreview adapterへ解決し、必須IDに割当がない状態を自動テストで拒否する。ゲーム側のCreate/Commandへactor IDや表示名を本人情報として入れず、保存Roomをクライアントへ直接返さない。接続前互換性は`packages/game-sdk/src/handshake.ts`を正本とし、環境、Platform／package release、contract schema、必須capabilityを`/.well-known/game-fields-sdk`またはMCP `get_sdk_handshake`で合意する。MCP `initialize`、OAuth、SDK handshakeはそれぞれtransport、本人認証、互換性確認を担当し、代用しない。`npm run check:sdk`は公開SDK、内部Runtime core、実証ゲームの依存境界を検査し、`npm run lint`から必ず実行される。

SDK Portalのmodule変更は所有者認証に加え、`apps/sdk-portal/lib/module-customization-access.ts`のserver側entitlement境界を必ず通す。Developer Previewでは所有者へ含めているが、将来の有料化ではこの判定だけを購入権限へ差し替え、公開SDK、AppSet、MCPの必須一覧契約を変更しない。

非公開package `@game-fields/game-runtime`と`lib/game-sdk-platform-adapter.ts`は、署名済みプレイヤーCookieからidentityを解決し、作成者をhostとして固定し、Roomをplatform metadataで包んでRedisへ保存する。SDK fixture向けadapterはclientの`expectedRevision`を検査し、古いrevisionを409相当の`STALE_REVISION`として拒否する。加えてRuntime coreはstorage-neutralなRoom mutation lifecycleを持ち、競合時の論理Command再適用、保存前正規化、保存後hookを提供する。本体の`lib/online-room-store-runtime.ts`が組み込み8ゲーム、`lib/game-sdk-platform-room-store.ts`が審査済みSDKゲームへRedis CAS、TTL、一覧、1人1active room、解散、Realtimeを注入する。`lib/game-sdk-content-source.ts`はアプリDBの一般プールと共通語彙DBの審査済みワードペア・対応語釈だけをSDK向けに読取専用で束ね、認証付き暗号化opaque IDへ変換して、静的審査登録済みSDKゲームの`context.resources.contentSource`だけへ注入する。低認知語彙と、たほい屋の候補・審査・お題は内部専用としてSDK契約から遮断する。`lib/game-sdk-llm-gateway.ts`は同じ審査済みserver moduleの`context.resources.llm`へ共通LLM gatewayを注入し、実生成直前の利用者別レート制限、provider・model・課金元・fallback、TelemetryをPlatform内で処理する。SDK browser側は`@game-fields/game-sdk/client-runtime`から作成・取得・Command・active room・一覧・解散・revision購読を利用し、WebSocket通知後も閲覧者別RoomViewをHTTPで再取得する。

リポジトリはnpm workspaces化済みで、Developer Portalは`apps/sdk-portal`、未審査mockの隔離実行は`apps/sdk-preview`、署名契約は非公開`packages/sdk-preview-auth`、公開SDKは`packages/game-sdk`に置く。Portalは`app-games-sdk`から`https://sdk.game-fields.com`へProduction公開済みで、`npm run dev:sdk`は3001番、`npm run dev:sdk-preview`は3002番を使う。production buildは`npm run build:sdk`と`npm run build:sdk-preview`で分ける。

公開SDKは`@game-fields/game-sdk@0.1.0`で、基本契約、SDK基本セット／AppSet合成、mock/client runtime、handshakeに加え、ワード・LLMのPlatform注入契約、トランプと描画の純粋ロジック・React UIをsubpath exportとして持つ。本体もトランプ・描画を公開package経由で利用する。`npm run build:sdk-package`で独立buildし、`npm run test:sdk-package`でtarballを空の外部fixtureへinstallしてRuntime・resource・React UIを検査する。packageはMIT、public access、provenance付きでnpmへ初回公開済みである。以後の互換修正は`develop`で検証し、package versionを上げて公開する。

Pro版ChatGPTから始める入口は`sdk/entry/START_GAME_FIELDS.md`である。通常ChatでGit取得、複数ファイル編集、Node.js実行、ZIP返却が使えなければWorkまたはCodexへ同じファイルを再投入するよう案内し、利用可能なら公開`koromo2010/app-games`の`sdk-starter`ブランチだけを`--depth 1 --single-branch`で取得する。ブランチsnapshotは`npm run build:sdk-starter-repository`で生成し、`starter-manifest.json`に公式repository、ref、`downloadMeVersion`、starter version、SDK versionを持つ。本体の`main`／`develop`を取得する必要はない。`apps/sdk-portal/.vercel-root-placeholder`はSDK Portal ProjectがRoot Directory確認後に既存Ignored Build Stepを評価して、このブランチのDeploymentをCANCELEDにするためだけに置く。提出ZIPには含めない。

`sdk/starter-template`を正本とし、SDK tarball、`START_HERE.md`、ChatGPT用`AGENTS.md`、`GAME_SPEC.md`、最小APIリファレンス、型付きmanifest／Command／RoomView、契約テスト、ダミー2人の完走デモを含む。従来の試用ZIPは`npm run build:sdk-starter`で生成できる。スターター内の`npm run package`は`node_modules`、`dist`、`.git`を除外した`submission/game-fields-submission.zip`を作る。`npm run test:sdk-starter`は入口文書、公開Git用snapshotとZIPの同一性、同梱SDK install、型検査、契約テスト、デモ完走、提出ZIPを確認する。Portalの一般向け入口は`GameFieldsDownloadMe-ver9.md`で、旧版URLは現行ver9へ一時redirectし、スターター側の`downloadMeVersion: 9`と一致しない場合は制作開始前に停止する。WorkではSDK toolが遅延読み込みされるため、初期一覧に`get_sdk_handshake`がない場合も、まず`gameapp-dev get_sdk_handshake Game Fields SDK接続互換性`でtool検索する。明示的な検索後も`gameapp-dev`の旧tool群だけが見え、`get_sdk_handshake`がない場合に限ってプラグイン更新、新しいチャットでの再選択、最新版DownloadMeの再添付を案内して停止する。toolが存在する場合はプラグイン旧版と判定せず、DownloadMe記載のPortal capability 4件だけでhandshakeする。

Portal用の別Vercel Project `app-games-sdk`は`game-fields` Team内に作成済みで、`https://sdk.game-fields.com`から取得できる。本体・devのDB、Redis、Blob、管理者秘密情報は共有していない。GitHub `koromo2010/app-games`へ接続し、Root Directoryは`apps/sdk-portal`、Production Branchは`main`、`develop`はPreview、Ignored Build Stepは`main`と`develop`だけをbuild対象とする。`develop`からのGit Preview buildとPortalソースの`main`限定反映、SDK Projectへのドメイン移管、`@game-fields/game-sdk@0.1.0`の初回npm公開は完了している。公開packageのコード、型、README、外部fixture検査、公開workflowは実装済み。短期`NPM_TOKEN`の失効とTrusted Publishingへの移行、Portal上の正式チュートリアル・APIリファレンス・ZIPダウンロード、提出画面は未完了である。リポジトリ分割は一般配布の必須条件ではなく、公開packageの独立性とデプロイ・権限・データ境界を先に保証する。外部開発者はSDKで作成したゲームをGame Fieldsへ提出するだけで、`develop`、`main`、Vercel、本番データへの書き込み権限を持たない。現段階では自動検査後も運営者が採用、dev統合、実プレイ確認、`main`反映、本番公開を一貫して管理する。提出数が増えた場合はAIによるセキュリティ、バグ、権利、低品質・量産提出の検査を採用ゲートへ組み込めるが、無審査公開は許可せず、すべての提出物を最低1つのGame Fields管理ゲートへ通す。

## 3. 環境変数

本番Vercelには以下が必要。値をコード、ログ、クライアントへ出さない。

- `SHARED_OPENAI_API_KEY`（移行中は旧 `OPENAI_API_KEY` へフォールバック）
- `LLM_ACCESS_PASSWORD`
- `LLM_SESSION_SECRET`（32文字以上を推奨。利用者持込APIキーのCookie暗号化専用。未設定時は既存のサーバー秘密値から導出）
- `PLAYER_SESSION_SECRET`（32文字以上必須。ログインCookieの署名用。未設定時は32文字以上の `LLM_SESSION_SECRET` を使用）
- `RATE_LIMIT_HASH_SECRET`（任意、32文字以上推奨。レート制限キーのIP・プレイヤー・入力名をHMACで不透明化。未設定時はプレイヤー署名鍵を利用）
- `OBSERVABILITY_HASH_SECRET`（任意、32文字以上推奨。ログ上のroom/actor/event不透明参照用。未設定時はプレイヤー署名鍵を利用）
- `OBSERVABILITY_LOG_LEVEL`（任意。`debug | info | warn | error`、既定 `info`）
- `OBSERVABILITY_SERVICE_NAME`（任意。既定 `app-games-web`。将来のサービス分割時に指定）
- `GAME_REPLAY_RETENTION_DAYS`（任意。通常プレイバックの保存日数。既定30、1〜3650）
- `GAME_REPLAY_FAVORITE_LIMIT`（任意。1人のお気に入り上限。既定10、1〜100）
- `SHARED_GEMINI_API_KEY`（移行中は旧 `GEMINI_API_KEY` へフォールバック）
- `SHARED_GROQ_API_KEY`（移行中は旧 `GROQ_API_KEY` へフォールバック）
- `DEBUG_MODE_PASSWORD`
- `PRIVATE_GAME_ACCESS_KEY`（個人利用ゲーム枠の解除キー）
- `SHARED_RESEND_API_KEY`（移行中は旧 `RESEND_API_KEY` へフォールバック）
- `OPERATIONS_ALERT_EMAIL`（容量警告の送信先）
- `CRON_SECRET`（Vercel Cronの認証。十分長いランダム値）
- `POSTGRES_CAPACITY_BYTES`、`REDIS_CAPACITY_BYTES`、`BLOB_CAPACITY_BYTES`（契約プランの上限byte）
- `STORAGE_ALERT_THRESHOLD_PERCENT`（省略時80）
- `EMAIL_FROM`（任意。既定値 `Game Fields <noreply@game-fields.com>`）
- `APP_BASE_URL`（推奨。本番は `https://game-fields.com`）
- `UPSTASH_REDIS_REST_URL` または `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` または `KV_REST_API_TOKEN`
- `APP_REDIS_URL`（Redis Cloud等のURL。環境分離後の正本）
- `REDIS_REQUEST_TIMEOUT_MS`（任意。既定4000ms、1000〜10000msに制限）
- `ONLINE_ROOM_WEBSOCKET_ENABLED`（任意。`1`で明示有効、`0`で明示無効。未設定時はPreview・ローカル開発のみ有効でProductionは無効）
- `APP_ENV`、`APP_DATABASE_URL`、`APP_DATABASE_ENV`（環境分離後のアプリDB正本と誤接続防止。旧URLは移行期間のみ）
- `SHARED_VOCABULARY_DATABASE_URL`（本番・開発共通の単語カタログ。サーバー限定。移行中は旧 `VOCABULARY_DATABASE_URL` へフォールバック）
- `SHARED_VOCABULARY_ADMIN_DATABASE_URL`（共通単語DBの管理・生成用。サーバー限定。移行中は旧 `VOCABULARY_ADMIN_DATABASE_URL` へフォールバック）
- `REDIS_ENV`（`production | development`。Redis誤接続防止）
- `BLOB_ENV`（`production | development`。Blob誤接続防止）
- `database_DATABASE_URL`（Vercel管理Neon。移行互換として標準の`DATABASE_URL`等も認識）
- `NEON_DATABASE_URL`（`app-games-dev-neon`。開発本体では旧`DATABASE_URL`より優先）
- `NEXT_PUBLIC_GAME_ADS_MODE`（任意。既定`off`。`preview`は広告予定位置のレイアウト確認専用。`live`は同意管理・配信adapter・CSP・ポリシー審査完了後だけ使用）
- 既存の `KV_*`, `REDIS_URL` も環境に設定されている場合がある
- 開発本体は`DEV_REDIS_KV_REST_API_URL` / `DEV_REDIS_KV_REST_API_TOKEN`（socket fallbackは`DEV_REDIS_REDIS_URL`）を旧Redis変数より優先し、共有する`sdk-dev-redis`内の全キーへ`app-dev:`を付ける。SDK Portalの`sdk:`キーとは論理分離する

アプリ環境は`lib/storage-environment-guard.ts`で一元判定する。Vercelでは`VERCEL_GIT_COMMIT_REF`を最優先し、`main=production`、`develop=development`とする。ブランチ情報がないときだけ`VERCEL_ENV`、`NODE_ENV`へフォールバックする。`app-games-dev`の`develop`はVercel上のProduction Deploymentだが、アプリとしてはdevelopmentであり、`APP_ENV=development`、`APP_DATABASE_ENV=development`、`REDIS_ENV=development`、`BLOB_ENV=development`と一致させる。本番ProjectはIgnored Build Stepで`main`だけ、開発Projectは`develop`だけをビルドする。

ゲームの公開／非公開は `config/game-registry.json` の `private` を正本とする。ページは `gamePageAccessAllowed`、部屋APIは `gameApiAccessDeniedResponse` を通し、非公開ゲームだけ共通Cookieを要求する。ワードソナーとワードスケールは公開ゲームのためアクセスキー不要だが、ログインと部屋内の操作権限は引き続き必要。

ロビーの分類タグも同じ登録簿の `tags` を正本とする。先頭は遊び方を示す `対戦`、`協力`、`チーム戦` のいずれかとし、残りは `正体隠匿`、`ブラフ`、`連想`、`推理`、`戦略` などゲーム選びに役立つ特徴を付ける。カードがタグだらけにならないよう1ゲーム3件以内とする。開発段階を示す旧 `Playable` / `Prototype` は利用者向けカードへ表示せず、プレイ中・メンテナンス・プライベートだけを運用状態として動的表示する。

プレイヤーアカウントの永続正本はNeon Postgresの `player_accounts`。テーブルは初回利用時に冪等作成する。移行中はRedisを読み取りフォールバックおよびセッション保存先として残し、Redisにだけ存在する既存アカウントはログインまたはメール検索時にPostgresへ自動コピーする。新規登録・メール変更・パスワード再設定はPostgresを先に更新し、Redisへ互換ミラーする。進行中の部屋・セッション・リセットトークン・レート制限は引き続きRedisを使う。

Neon Postgres、Upstash Redis、Vercel Blobの容量は `vercel.json` の日次Cronから `/api/cron/storage-capacity` を確認する。各サービスの上限は契約変更で変わるため環境変数で明示し、既定80%を超えると `OPERATIONS_ALERT_EMAIL` へResendで1日1回まで通知する。上限未設定のサービスは誤報防止のため監視対象外になる。

メール変更時はPostgresへ書き込む前に、PostgresとRedis双方のメール所有者を確認する。Redisだけに残る旧アカウントと重複する場合も先に拒否し、Postgresだけが変更済みになる状態を作らない。

戦績の永続正本はNeon Postgresの `player_game_results`。結果JSONと検索用のプレイヤー・ゲーム種別・終了時刻を保存し、結果IDの主キーで重複記録を防ぐ。読み取り時はPostgresを優先してRedis履歴をIDで統合し、Redisにだけ残る既存戦績をPostgresへ自動コピーする。レーティングは各結果の `ratingAfter` に永続化し、Redisの現在値が失われた場合はPostgresの最新結果と試合数から再開する。

通常終了した集計対象ゲームの実プレイ時間は、開始から最終結果確定までを `game_duration_samples` へ結果イベントID付きで冪等保存し、Redisにも直近300件を互換ミラーする。オンラインゲーム（大富豪を含む）はサーバー正本の開始・終了時刻を使う。大富豪のCPU練習は、ログイン済みプレイヤーが正常終了したとき認証・レート制限付き `/api/game-duration` へ開始時刻を送り、サーバー受信時刻を終了時刻とする。中断・デバッグ・30秒未満・4時間超は除外する。広場の時間表示はゲーム別の直近300件を使い、5件未満では `config/game-registry.json` の初期目安、5〜19件では中央値、20件以上では第25〜第75パーセンタイルの範囲を丸めて表示する。サンプルには参加人数と主要ルールのvariant keyも保存し、条件別集計に利用できる。実装は `lib/game-duration-statistics.ts` と `lib/game-duration-store.ts`。

標準トランプを使う新規ゲームは、外部ゲームエンジンへ部屋同期を重複させず、`lib/playing-cards.ts` のカード生成・暗号学的乱数シャッフル・ラウンドロビン配札・保存配列検証・手札からの安全な取り出し・表示用ソートを使う。オンラインゲームのシャッフルと配札はクライアントではなくサーバーdomain/storeで実行し、カードの強さ、役、合法手はゲーム固有domainに置く。閲覧者別レスポンスは `lib/playing-card-presentation.ts` を土台に、本人以外へ実カードIDを返さず枚数だけを公開する。共通の文字主体カード、裏面、選択可能な手札、非公開カード束は `app/components/PlayingCard.tsx`、`PlayingCardHand.tsx`、`PlayingCardBackStack.tsx`。ローカルまたはVercel Previewでは `/dev/playing-cards` で基盤を確認でき、本番環境では404にする。絵札SVGは未導入で、将来共通UI内だけを差し替える。

大富豪は `/daifugo` に公開する3〜6人のオンライン対戦で、`/daifugo/practice` に1人＋CPU3人の練習を残す。サーバーが53枚のシャッフル、全手札、合法手、時間切れを正本管理し、閲覧者以外のカードIDはAPIへ返さない。revision付きCAS、共通TTL、1人1部屋、再接続、解散、結果復帰、デバッグのダミー操作・ログ・リプレイに対応する。通常終了は順位戦績、レーティング、実プレイ時間、本人用プレイバックを冪等保存する。革命、8切り、しばり、スペ3返し、都落ち、カード交換、階段は未実装。詳細は `docs/DAIFUGO.md`。

### メール送信の初期設定

パスワード復旧メールはResendから送る。Resendで `game-fields.com` を追加し、案内されたSPF/DKIM等のDNSレコードを設定してドメイン認証を完了する。その後、Vercel Team Shared Variablesの `SHARED_RESEND_API_KEY` を対象Projectへリンクする。送信元を変える場合だけ `EMAIL_FROM` を設定する。

アカウント作成時の復旧用メール申請は任意。既存アカウントはログイン後、現在のパスワードを再入力して追加・変更を申請できる。入力直後はアカウントを変更せず、Redisへ1時間有効・一度きりの確認トークンを保存し、Resendから確認メールを送る。メール内リンクの確認画面でさらに「このメールを承認」をPOSTした後だけ `player_accounts.email` と `email_verified_at` を確定する。変更申請中も既存の確認済みメールは維持する。メールアドレスそのものはクライアントの保存セッションへ含めず、確認済み登録の有無だけを保持する。本人専用のマイページ取得APIだけは、登録先を識別できるマスク済みヒントを返す。

パスワード再設定と、サイト管理者メール一致によるデバッグ権限の自動付与は `email_verified_at` がある確認済みメールだけを対象にする。管理画面からのプレイヤーID別の個別付与は従来どおり残す。確認機能導入前の既存メールは、一度きりのDB migrationでアドレスを保持したまま `email_verified_at = NULL` へ移し、再確認まで復旧・自動権限付与に使わない。マイページは未登録・未確認・確認済みを区別し、保存済みアドレスをマスク表示する。未確認メールは現在のパスワードを再入力すると同じ登録先へ確認メールを再送でき、再送時は以前の確認トークンを無効化する。

ログイン中のパスワード変更は、署名済みプレイヤーCookieのIDとアカウントIDを照合し、さらに現在のパスワードをサーバーで再検証した場合だけ受け付ける。新しいパスワードは現在と異なる値に限定する。マイページの新パスワード2回入力は入力ミス防止であり、本人確認は現在のパスワードが担う。

メール確認リンクとパスワード再設定リンクはそれぞれ1時間有効で、一度使うとRedisから削除される。確認リンクはGETだけで確定せず、リンク先の明示承認POSTで確定する。同じメールアドレスからのパスワード再設定発行は60秒に1回まで。再設定APIは、登録の有無にかかわらず同じ成功応答を返す。未確認メールの再送UIは新規登録・変更フォームと分離し、マスク済み登録先、再送専用の現在パスワード欄、再送ボタンを一つの枠で表示する。Resendの送信拒否は、プロバイダー本文やメールアドレスをログへ残さず、認証設定、送信元未確認、テスト送信先制限、送信枠、レート制限、その他の安全なエラーコードへ分類する。

## 4. 共通LLM方針

ゲーム固有APIは事業者SDKを直接呼ばず、`generateGameLlmText` を使用する。

1. personalモードでは利用者が選んだOpenAI・Gemini・Groqと持込キー
2. paidモードではGame Fields提供枠のOpenAI
3. 失敗または出力不採用ならGame Fields側のGemini、次にGroq
4. 最後にユーザーへnoticeを表示してローカル候補

プロバイダー間のフォールバックは共通ゲートウェイだけで行う。ゲームAPI側で同じ連鎖を重ねて、APIリトライ回数を増やさない。品質重視処理は `quality: "high"` を指定できる。生成元、モデル、personal/paid/free/local、prompt version、校閲元、RAG参照IDを `GameGenerationMeta` に保存する。

### 有料APIと将来の課金

利用者持込APIとGame Fields提供の有料OpenAIを次の2経路に分離する。

1. `personal`: 利用者がOpenAI・Google Gemini・Groqから事業者を選び、その事業者で取得したAPIキーを入力する。料金と無料枠は選択した事業者側の契約に従う。
2. `game-fields`: Game Fieldsの `OPENAI_API_KEY` を使う。現在は `LLM_ACCESS_PASSWORD` による招待・動作確認用で、将来は購入済み権限やクレジット残高による認可へ置き換える。

利用者持込は `lib/game-llm.ts` のpersonalモード、Game Fields提供枠はpaidモードとして扱う。`GameGenerationMeta.provider` と `billingSource` に事業者と `personal` / `game-fields` を記録するため、将来の原価・利用量分析で区別できる。決済実装時は `lib/llm-access.ts` のGame Fields提供枠の認可を差し替え、ゲーム固有ルートは変更しない。

利用者持込キーは入力時に各事業者のモデル取得APIで現在のモデルを利用できるか検証する。平文をRedis、プレイヤーアカウント、ログ、localStorageへ保存しない。事業者名とキーをAES-256-GCMで暗号化したHttpOnly・SameSite=Lax Cookieへ最大8時間だけ保持し、切断時に削除する。旧OpenAI専用Cookieは読み取り互換を保ち、次回接続時に共通Cookieへ移行する。暗号化には32文字以上の `LLM_SESSION_SECRET` を推奨し、未設定時は既存の `LLM_ACCESS_PASSWORD` と `OPENAI_API_KEY` からサーバー内で秘密値を導出する。入力画面ではAPIと一般向け月額プランが別であること、取得先、専用キー、権限制限、利用上限設定を案内する。

## 5. マルチプレイ共通ルール

登録済みオンラインゲームの部屋取得・active room復帰・一覧・POST/PATCH/DELETEは、クライアント側を `lib/online-room-api-client.ts` と各ゲームの `*-room-api-client.ts`、サーバー側を `lib/online-room-route-factory.ts` の共通契約へ集約する。画面から部屋APIを直接 `fetch` しない。各Routeはファクトリへ `load / loadActive / list / create / apply / delete / deleteHosted / sanitize` を渡し、アクセス検査、認証、レート制限、言語、Telemetry、エラー応答を複製しない。表示中の同期、タブ復帰時の即時更新、必要なゲームのlocalStorage cross-tab更新は `app/hooks/use-online-room-polling.ts` を使う。WebSocket購読中は更新通知のたびに部屋GETを1回行い、通常ポーリングを停止して45秒ごとの整合確認だけを残す。WebSocketが有効な環境での切断・エラー時は最大2秒間隔のポーリングへ即時フォールバックし、1〜30秒の指数バックオフで再接続を続ける。WebSocketが無効な環境では短い同期フェーズ1秒、進行中3秒、ロビー・結果5秒を標準とし、取得失敗時は最大30秒まで間隔を延ばす。Productionでは明示設定がない限りWebSocketを有効にしない。部屋GETは署名済みCookieから `requireAuthenticatedPlayerId` で本人IDを検証し、保存済み部屋の参加者と照合する。ポーリングのたびにプレイヤープロフィールをRedisから再取得しない。更新系は引き続き `requireAuthenticatedPlayer` を使い、最新プロフィールとアカウント存在確認を維持する。共同キャンバスは操作感を保つため、表示中の部屋500ms・広場2秒とし、通常ゲームと同様に非表示タブでは通信を停止して復帰時に即時同期する。

共通観戦モードは `/spectate/[game]/[code]` と `/api/online-room-spectators` を使う。既存部屋は観戦禁止が初期値で、ホストだけがゲームメニューの「観戦・共有設定」から許可できる。非参加者はログイン済みアカウントと、合言葉設定時は合言葉を使って、ゲーム・部屋・本人・部屋作成時刻へ署名されたHttpOnly grantを取得する。観戦者はRoomの参加者、手番、戦績、active room索引へ入らない。観戦レスポンスは保存Roomをspreadせず `lib/online-room-spectator.ts` のゲーム別許可リストだけから作り、実名・内部ID・秘密語・役職・手札・暗号・投票先・チーム内相談を返さない。ワードソナーは未脱落者の伏字も文字数推測につながるため返さない。設定変更はWebSocketのrevision通知を再利用し、接続時は45秒整合確認、切断時は通常フォールバックで追従する。

API直叩き対策では、`online-room-route-factory`が全オンラインRoom APIのGETをCookie本人と保存Room参加者で照合し、POSTのhost・初期参加者・content locale、PATCHのactor・参加者プロフィールを本文値にかかわらず認証セッションから上書きする。DELETEもCookie本人をhost検証へ渡す。デバッグ代理操作はデバッグ権限に加えて保存済み参加者だけを対象とする。`tests/online-room-route-auth.test.ts` と `tests/online-room-route-factory.test.ts` を回帰契約とする。

書き込み契約は `POST = 新規作成`、`PATCH = 既存部屋へのCommand`、`DELETE = 解散`。既存部屋をRoom全体POSTで更新しない。UIは変更後Roomを組み立てず、変更意図だけのActionをadapterへ渡す。権限・フェーズ・入力正規化・revision競合は保存済みRoomを読むサーバー側で処理する。`npm run lint` は全オンラインゲームの型付きadapter、PATCH route、UI直fetch、旧`setAndSaveRoom`の再混入を検査する。

操作・時間切れ・ポーリングから返るRoomは `lib/online-room-client-state.ts` の `preferLatestOnlineRoom` を通し、同じ部屋の古いrevisionで新しい画面状態を巻き戻さない。共通の結果・デバッグ・プロフィール操作はReact stateだけでなく同期refでも開始時にロックし、同一tickの連打を重複送信しない。

結果の表示順、外部共有文、プレイバック保存で同じ並べ替えを複製しない。共通契約は `lib/game-result-presentation.ts`、ワードスケールの基準実装は `hodoaiResultPresentation`。結果の向きを変える場合はプロジェクターと契約テストを変更し、3つの出力先は同じ結果行を参照させる。

将来の広告位置は `app/components/GameAdSlot.tsx` を唯一の共通入口とする。配置対象はゲーム一覧、入室前、部屋ロビー、結果だけで、進行中とデバッグ部屋には表示しない。SDK-devも独自の広告予定枠を描画せず、この共通コンポーネントを外側Shellに置く。既定はDOMごと完全非表示で、`NEXT_PUBLIC_GAME_ADS_MODE=preview` のときだけ予約寸法を表示する。ゲーム固有packageと隔離iframeから広告枠の内容・表示条件を変更できない。`live`へ進む前に、同意管理、配信事業者adapter、CSP、年齢・地域・コンテンツに応じた広告ポリシー、広告ブロック時のレイアウトを共通コンポーネント内で実装し、ゲーム画面から事業者SDKを直接呼ばない。

- 部屋設定は全クライアントへ表示する。
- 各ゲームの `GameRulesDialog` は、未経験者や若い利用者が単独で読んで遊べる平易な説明を正本とする。目的、準備、ラウンド進行、得点、勝敗・終了、時間切れを見出しで分け、得点には具体的な計算例を入れる。得点や勝敗が未実装の試作も、その事実を省略せず明記する。
- 設定操作はロビーにいるホストだけ。
- 設定デフォルトはプレイヤーごとにRedisへ保存し、localStorageをフォールバックにする。
- 1プレイヤー1アクティブ部屋。新しい部屋作成時は古いホスト部屋を解散する。
- 広場の復帰表示はゲーム別Room APIをブラウザから順次呼ばず、認証済みの共通 `/api/player-active-rooms` 1本から部屋コード・phase・参加者概要・更新時刻だけを受け取る。active roomコード7件は個別GETではなく1回のMGETで確認し、該当する部屋本体だけを読む。秘密語・手札・投稿・合言葉などRoom本文は返さない。`scripts/check-game-standards.mjs` は全オンラインゲームのloader登録を検査する。
- コードインターセプト、ワードスケール、ワードソナー、ワードアウト、ノーザンブランチの入室画面は `useOnlineGameSessionRestore` を使う。保存済みローカルセッションのactive-room取得をサーバーのアカウント確認と並行して始め、確認済みIDと一致した場合だけ採用する。復元中は新規作成・参加欄を `inert` にして、別部屋操作との競合を防ぐ。ワードウルフとたほい屋の個別session hookも同じ並列復元と初期loading表示を使う。アカウントCookieとRoomの正本は引き続きサーバーで検証する。
- 参加人数のサーバー安全上限は `onlineRoomPlayerLimits` を正本とし、ワードウルフ20人、たほい屋8人、ノーザンブランチ4人、ワードスケール50人、ワードソナー20人、ワードアウト6人、コードインターセプト12人。満室は一覧から除外し、直接参加も409で拒否する。復元時も上限を超えた配列を切り詰め、デバッグ用ダミー追加にも同じ上限を適用する。
- デバッグ用ダミー参加者の追加・一覧・削除UIは、ゲーム固有のロビー設定や参加者一覧へ置かず、共通 `DebugModeButton` 内の `DebugParticipantControls` に集約する。サーバー側の認可、ID・名前生成、追加、個別削除、DEBUG OFF時の一括整理、ロビー復帰状態、active-room索引の除外と旧索引解放は`lib/online-room-debug-participants.ts`を正本とする。ワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、大富豪、ノーザンブランチ、コードインターセプトはこの共通Commandへ接続済み。各Storeは人数上限、Player生成、並べ替え役・得点・代理操作対象・チーム等のゲーム固有補正だけをhookとして渡す。たほい屋固有の参加者依存状態の整理は`lib/tahoiya-debug-participants.ts`を正本とする。オンライン参加者を持たないキャンバスは対象外。
- 投稿・投票がそろったらサーバー側で自動遷移する。
- ルームGETは認証済み閲覧者向けJSONからETagを作り、クライアントは `If-None-Match` を送る。未変更時は304で本文転送とJSON再解析を省き、同じURLへの重複取得はクライアント内で直列化する。実装は `lib/conditional-json.ts` と `lib/conditional-json-client.ts`。WebSocketはゲーム名・部屋コード・revision・timestampだけの更新通知を運び、Redisの部屋状態や秘密情報は載せない。DEBUGメニューでWS／ポーリング／再接続の状態、部屋GET回数、通知受信数を確認できる。
- 広場のアクセス判定ではruntime hyperparameterとゲーム運用状態を並列取得する。同一プロセス内のruntime hyperparameter、ゲーム運用状態、実プレイ時間sampleは短時間cacheと同時loadの共有を使い、同じ画面生成中のRedis／Postgres重複読取を避ける。
- 部屋作成時のRoom本体と一覧索引は1回のLua commandで原子的に保存する。更新時に一覧へ毎回 `SADD` しない。参加者別active room索引のTTL更新も人数分の個別SETではなく、RoomのCAS保存と同じLua commandへまとめる。
- 参加可能な部屋一覧は全件 `SMEMBERS` + 個別GETを行わず、`SSCAN` で1ページ24件ずつ取得し、部屋本体は1回の `MGET` にまとめる。レスポンスの `nextCursor` を次の `cursor` クエリへ渡せる。部屋コードを指定した直接参加はページ外でも利用できる。
- 自動遷移しなかった場合の手動ボタンはホスト向けに残すが、必要条件を満たすまで表示しない。
- オンライン部屋の操作表示では共通 `OnlineRoomLifecycleActions` と `useRoomResultReturnGate` を使う。ゲーム側は`lobby / playing / result`を渡し、ロビーはホストの解散、プレイ中は部屋操作なし、結果は内部の`RoomResultActions`による「部屋に戻る／広場へ戻る／部屋を解散」とする。「部屋に戻る」を先頭・全幅の主導線とし、ホストがサーバー上の部屋をロビーへ戻した後に各クライアントで有効化する。「広場へ戻る」は確認付きの副導線とする。既存参加者の席は保持されるため満員でも復帰できるが、クリック時に最新の部屋と参加資格を再確認する。部屋が解散されても結果画面は強制遷移せず保持し、復帰ボタンを無効化して監視を止める。ホストにだけ「部屋を解散」も表示し、確認後にサーバー側のホスト権限検証を通す。各アクションの処理中は共通スピナーと進行中ラベルを表示して二重押しを防ぐ。
- AI APIを呼ぶ可能性があるクライアント操作は`aiActivityFetch`または`withAiActivity`を通す。共通`GameTopBanner`の`AiActivityVital`は処理中に発光・脈動し、複数処理が重なった場合はすべて完了するまで通信中表示を維持する。これは利用量が発生し得る処理の可視化であり、課金額・残量・API認可の正本ではない。
- 通常の部屋解散はロビーまたはゲーム終了後だけ許可する。各Room Storeは共通 `canDissolveOnlineRoom` を通し、進行中のDELETEをAPI側で409にする。デバッグ中は `DebugModeButton` の「ゲームを中断」でロビーへ戻してから解散する。
- 全ゲームは `config/game-registry.json` の `timeLimit` で時間制限方針を宣言する。通常のゲームは共通プリセットと秒数手入力に対応し、`0` は制限なし。`fields` の保存実装、`expiryToken` のサーバー正本処理、`RoomTimeLimitControl` が欠けると `npm run lint` が失敗する。時間制限付き文字入力は `textInputTimeout.mode: "adopt-entered-text"` と実装の `implementationTokens`、文字入力がなければ `not-applicable` と具体的な理由が必要で、宣言または実装が欠けてもlintを失敗させる。勝敗や開始・終了フェーズを持たない機能だけは `timeLimit` 自体を具体的な理由付きで `not-applicable` にできる。
- 時間制限付き文字入力では、表示上の締切時に入力ルールを満たすローカルの文字を自動送信し、サーバー受付猶予内なら採用する。複数欄は有効な入力を保持して空欄・無効欄だけを補完または既存ペナルティの対象とし、全必須欄が有効なら通常提出として扱う。送信は冪等にし、期限・フェーズ・採否の正本判定はクライアント時刻を信用せずサーバーで行う。新規ゲームには締切直前、部分入力、空欄、重複送信の自動テストを追加する。
- 共通のサーバー受付猶予は標準5秒。`GAME_TIMEOUT_GRACE_MS`（0〜10000ms）でTahoiya・ワードスケール・ワードソナーを調整し、WordWolfは互換用 `WORDWOLF_TIMEOUT_GRACE_MS` を使う。
- ログイン成功時は署名・期限付き・HttpOnly・SameSite=LaxのプレイヤーCookieを発行する。オンラインAPIはリクエスト本文のactor IDではなくCookieから本人を確定する。
- 書き込みAPIは `lib/rate-limit.ts` の共通Redisレート制限を通す。ログイン名・IP・プレイヤーIDはHMAC化したキーだけを保存し、生値をRedisへ残さない。共有回線を考慮してIP枠は広く、プレイヤー／入力名枠を厳しくする。ログイン、パスワード再設定、アクセス認証、画像アップロード、部屋操作、AI生成、プロフィール更新、フィードバックを別枠にし、超過時は `429 RATE_LIMITED` と `Retry-After` を返す。制限用Redisだけが失敗した場合は操作を止めず、`rate-limit.store` 警告を出してfail-openする。
- デバッグ利用資格はマイページで `DEBUG_MODE_PASSWORD` を共有APIへ送って認証し、プレイヤー別Redisフラグへ保存する。資格のあるホストだけ各ゲームのトップバーに `DebugModeButton` が表示され、ゲームAPIもデバッグON・デバッグ専用操作・中断時に資格を再確認する。ゲーム個別のパスワードUIは作らない。
- デバッグのON/OFF・ダミー参加者管理・代理操作対象の切替・ゲーム固有の異常状態再現や一括入力・プレイバック記録・進行中断・行動ログは、ゲーム固有画面へ個別配置せず `DebugModeButton` の非モーダル画面内ウィンドウへまとめる。PCではゲームを操作可能なまま移動・サイズ変更・最小化でき、ウィンドウ外の左クリックまたはタップでクリック先のゲーム操作を妨げず自動的に最小化する。狭い画面ではビューポート内の固定パネルにする。最小化中も必要な操作だけは`DebugToolWindow`の固定領域へ明示的に渡し、本文とは別に表示を維持する。ゲーム固有操作は `gameTools` から注入し、通常のフェーズ画面にはデバッグ状態の説明だけを残せる。中断はゲーム一覧へ移動せず、同じ部屋・参加者・部屋設定を維持し、進行中の秘密情報と提出状態を破棄してゲーム開始前へ戻す。
- オンラインゲームのトップバーは `GameTopBanner` と `GamePlayerMenu` を使う。ログアウトはプレイヤーメニュー内だけに置き、トップバーへ単独配置しない。
- デバッグON中は、成功した操作の時刻・操作者表示名・操作種別・フェーズ遷移・revisionをサーバー正本の行動ログへ最大200件保存し、`DebugModeButton` 内で表示・コピーする。秘密の数字、手札、秘密語、ヒントや投稿本文、合言葉、Cookie、APIキーは記録しない。これは常時出力する構造化運用ログとは別物である。
- 最終結果ではホスト以外も共通 `GameResultShareButton` からプレイログを共有できるようにする。共有先を開く前に実際の共有文と公開URLをプレビューする。ゲーム仕様として投稿本文や参加者名を共有する場合は、本人のデフォルトOFFの同意を入室時に固定保存し、未同意者の名前は匿名ラベルへ置き換える。認証付きURLは共有しない。
- DBを使うワード・お題生成機能を持つゲームだけ、共通 `DebugModeButton` の任意 `wordGenerationTools` を有効化して `DebugWordGenerationTest` を表示する。DB機能を持たないゲームには表示しない。生成テストはゲームを開始せず、部屋・ラウンド・出題済み履歴を変更しないプレビューAPIとして実行する。候補生成・審査自体が検査対象なら、その結果だけを対応する候補DBへ保存できる。
- 新規生成とDB内候補の再利用を切り替えるゲーム（現状はワードウルフ）だけ、DEBUGポップアップのワード生成テストに「新規ワード生成」フラグを表示する。たほい屋はこの切替を使わず、後述の完成済み再利用→判定済み候補→未判定10語審査という正式フローをそのままプレビューする。
- ワード候補DBと使用履歴はゲーム別に分離する。通常出題では参加者の誰か一人でも使用済みの単語を除外し、参加者全員が未使用のローカル／再利用候補を優先する。該当候補が尽きた場合だけLLM APIで新規生成し、そのゲーム専用候補DBへ追加する。デバッグ生成の結果もゲーム専用候補DBへ追加するが、使用済みプレイヤーは登録せず、全員未使用の候補として扱う。
- 参加者全員が未使用という条件を満たす再利用候補が複数ある場合は品質と利用分散を両立させる。たほい屋は全体使用回数が少なく最終使用が古い上位50語から、ゲーム別フィードバックの `Good - Bad` を最大6倍までの重みにしたランダム抽選を行い、同じ高評価語への固定化を防ぐ。
- たほい屋は完成済みお題を共通DBの`tahoiya_topics`、既出IDをプレイヤー別Redis Set `game-history:v2:tahoiya:<playerId>`へ分離する。さらに同じ端末へ本文ではなく直近100語のSHA-256履歴IDだけを保存し、現在のアカウントへ90日TTLの `game-history:device-bridge:v1:tahoiya:<playerId>` として同期する。アカウントを作り直しても同じ端末では再出題を避け、補助履歴で候補が尽きた場合だけ補助履歴を緩和して既存語を優先する。旧アカウントと新アカウントをサーバー側識別子で紐付けない。移行中だけ旧Redis候補と埋込`experiencedPlayerIds`も互換読み取りする。ワードウルフはv3へ移行済みで、JST同日内は単語単位、順序非依存ペアは標準30日（`WORDWOLF_PAIR_COOLDOWN_DAYS`）で禁則にする。詳細は `docs/TOPIC_HISTORY_DATABASE.md` を参照する。

### 共通戦績

- 全ゲームはゲーム別のEloレーティングを持つ。標準は初期値1000、最初の30戦を暫定K=48として実力帯へ早く収束し、31戦目以降はK=20で穏やかに動く。`GAME_RATING_INITIAL`、`GAME_RATING_PROVISIONAL_GAMES`、`GAME_RATING_PROVISIONAL_K`、`GAME_RATING_ESTABLISHED_K` をハイパーパラメータとして環境変数で調整できる。協力ゲームは初期レートの仮想対戦相手に対する成功・失敗として扱う。結果イベントIDで二重加算を防ぎ、ダミーとデバッグ対戦は対象外。UIでは戦績の補助情報として控えめに表示し、増減を強調しない。実装は `lib/game-rating.ts` と `lib/player-stats-store.ts`。

- ロビーの戦績フィルターは `config/game-registry.json` の `stats: "account"` から自動生成する。
- 広場ではゲームカードと復帰情報を先に表示する。戦績はPCで初期描画の250ms後、スマホ・タブレットではアカウント・戦績ドロワーを開いた時点から取得し、初動のアカウント確認と復帰照会へ競合させない。
- ワードウルフは1ゲーム、たほい屋は1ラウンド、ワードスケールは同じカードへの全ことば提出と最終並べ替えを1戦として記録する。
- 結果IDをRedisのLua処理で戦績追加と同時に冪等化し、再読込や複数クライアントによる二重記録を防ぐ。
- ワードスケールは最大点の50%以上を協力成功とし、デバッグ用ダミーは戦績へ含めない。
- ノーザンブランチもログイン必須のオンライン部屋制で、ゲーム終了時に勝敗を共通戦績へ記録する。デバッグ部屋とダミー参加者は戦績へ含めない。
- ワードソナーは全ラウンド終了時の総合順位を1戦として記録する。デバッグ部屋とダミー参加者は戦績へ含めない。
- 広場のプレイ時間は固定値だけを正本にせず、正常終了した実プレイの中央値を基本にする。サンプル不足時だけ登録簿の固定目安へ戻し、十分な件数では中央50%の範囲を表示する。

### マイページと対戦プレイバック

- 本人用URLは `/users/me`。内部プレイヤーIDをURLへ出す `/users/<playerId>` は作らない。将来公開プロフィールが必要な場合は別の公開ハンドルを設計する。
- 通常プレイバックは既定30日、お気に入りは期限なし、上限は既定10件。値は上記環境変数で調整する。
- 現在の詳細プレイバックはたほい屋から開始し、お題、本当の説明、偽説明、投票、ラウンド得点を参加者だけへ返す。
- たほい屋の結果済み偽回答は、将来の四択「一人たほい屋（仮）」用として名前・プレイヤーID・部屋コードを除いてアプリ用Postgresへ保存する。通常たほい屋票と一人用票は別集計し、票イベントIDで二重加算を防ぐ。既存Redisプレイバックと期限内の結果部屋は管理画面から冪等にサルベージできる。詳細は `docs/SOLO_TAHOIYA.md`。
- SNS共有は結果サマリーとゲームURLだけをWeb Share APIへ渡す。説明本文、参加者名、投票内容、認証付き閲覧URLは共有しない。
- 保存schema、Redisキー、期限判定の正本は `docs/GAME_REPLAYS.md`。
- アカウント本体を先に表示し、戦績は別取得する。プレイバック一覧は欄がビューポートの320px手前へ近づくまで取得しない。共通 `FullScreenPageOverlay` のマイページ利用は初回読込後のiframeをページ滞在中だけ保持し、閉じて開き直すたびにセッション・戦績・プレイバックを再取得しない。

## 6. ワードウルフ現行仕様の要点

SDK分離pilotは`games/wordwolf-sdk/manifest.ts`、`domain.ts`、`server-module.ts`に置く。これはserver契約と汎用Room transportのfixtureであり、現行ワードウルフを縮小した完成品としては扱わない。`/sdk-examples/`と`/sdk-examples/word-wolf`は制作者アカウントを使わないコード管理の`Game Fields Official`サンプルで、SDK Portalの同名URLから本体dev画面を表示する。公式ワードウルフ画面は現行`app/wordwolf/WordWolfGame.tsx`を直接利用し、`/wordwolf`と同じUI・設定・お題生成・DEBUG・進行・結果をSDK-dev移行の受け入れ基準にする。

SDKゲームは`SDK基本セット + アプリセット`の二層とする。Room、認証、同期、共通UI、設定枠、DEBUG、時間管理、結果・再戦・解散等の再利用部分がSDK基本セットであり、お題、役職、ヒント、投票、決選投票、逆転回答等がワードウルフのアプリセットである。server契約ではこの二層を合成するAPIが実装済みで、`games/wordwolf-sdk`と配布スターターはRoom作成・参加者・設定・revisionを再実装しないAppSet形式へ移行済みである。現行画面を壊さず、別ゲームでも再利用できることを確認した共通UI・時間管理・DEBUG・結果導線だけを今後も基本セットへ引き上げる。現行本体ワードウルフを含む8オンラインゲームは、ゲーム固有Command Storeを維持しながら、永続化・active room・一覧・解散を共通Room Runtimeへ移行済みである。審査登録済みSDK server moduleも汎用HTTP／Client RuntimeとSDK用Room Storeを通じて、同じRedis lifecycle・revision通知へ接続済みである。

現在のモジュール分離は `docs/MODULAR_GAME_ARCHITECTURE.md`、クライアント三層は `docs/UI_ARCHITECTURE.md`、将来のweb・game-server・timer-service・ai-worker・batch-worker構成は `docs/CONTAINER_ARCHITECTURE.md` を正本とする。登録済みの全9ゲーム（WordWolf、Word Scale、Word Out、Code Intercept、Tahoiya、Word Sonar、Northern Branch、Canvas、Daifugo）は`<Game>Game -> use<Game>Controller -> <Game>DesktopLayout`へ移行済みで、EntryはLayout選択だけ、Controllerはstate・session・同期・actions・ViewModel・permissions、DesktopLayoutは表示だけを持つ。`scripts/check-game-standards.mjs`は全登録ゲームについてEntryの薄さ、登録済みController／DesktopLayout、permissions利用、DesktopLayoutへの通信混入を拒否する。オンラインゲームでは部屋HTTPクライアントと同期hookをUIから分離済み。ワードウルフはフェーズ時計も分離済み。部屋Routeは `lib/online-room-route-factory.ts`、Room lifecycleの本体adapterは`lib/online-room-store-runtime.ts`、storage-neutralな更新lifecycleは`packages/game-runtime/src/online-room.ts`、低水準の一覧・active room・CAS・解散は`lib/online-room-list.ts`、`lib/player-active-room.ts`、`lib/online-room-persistence.ts`、`lib/online-room-dissolution.ts`、共通権限は `lib/online-room-access.ts`、APIエラー表は `lib/online-room-route-errors.ts` に集約した。登録簿の `moduleBoundaryFiles` をlint時に検査する。

オンラインゲームのroom moduleは、ゲーム別の `*-room-normalizer.ts`（復元・入力正規化）、必要に応じた `*-room-domain.ts`（ラウンド進行・タイムアウト）、`*-room-presentation.ts`（sanitizer・ロビー表示）、`*-room-store.ts`（application／ゲーム固有Command）へ物理分割済み。8つのStoreは共通Room Runtimeへ接続し、Redis key、TTL、revision CAS、active-room索引、一覧、解散を直接持たない。ワードウルフはtimer・専用Command用の互換保存入口だけをStoreに維持する。

部屋状態には `revision` を持たせ、Redis内CASで古い保存による巻き戻しを防ぐ。参加・プロフィール・ロビー設定・デバッグ操作・開始・通常の発言・投票・逆転回答・時間切れ遷移はサーバー側Commandで処理し、複数端末から同時に要求されても整合する。レスポンスは認証済み閲覧者向けに整形し、結果前は狼ID・相手ワード・他人の投票を返さない。
締切には標準5秒のサーバー受付猶予を設け、締切直前に端末から送った投稿・投票が通信遅延で時間切れ処理に負けないようにする。`WORDWOLF_TIMEOUT_GRACE_MS`（0〜10000ms）で調整可能。クライアント申告の送信時刻は信用せず、サーバー到着が締切＋猶予以内か、現在のフェーズとrevisionが一致するかで上限を掛ける。
締切計算・受付猶予・再試行時刻・イベントIDは `lib/game-timer` の共通時間管理境界へ集約し、入口は `/api/game-timer/expire` とする。ゲーム固有domainは「期限後に未投稿や未投票をどう扱うか」だけを実装する。将来はこの境界をtimer-serviceコンテナへ移せる。

- `/wordwolf`
- 部屋制、ログイン制、復帰対応、デバッグ時は1人テスト可
- 順番投稿・全員同時投稿、順番ランダム、同時投票、同率・決選投票、狼の逆転回答に対応
- 投票では自分自身を候補に出さず、API直送の自己投票も拒否する。開始・発言・投票・逆転回答は送信中の同期ロックとゲーム番号・フェーズ・ラウンド・開始時刻scopeを持つ。サーバーは同じフェーズ内のCAS競合時に最新RoomへCommandを再適用し、すでに保存済みなら最新Roomを返す成功扱い、古いフェーズから遅延したCommandは409拒否とする
- プレイヤー名とお題ヒントは入力中の各キーでは保存せず、blurまたはEnterで1回だけ保存する。ロビー設定・プロフィール等のRoom Actionはクライアント内で直列化する
- お題はJST同日同語禁止、順序非依存ペアは標準30日間禁止。固有名詞は語だけで類推できない距離へ調整済み
- OpenAI OFF時はGemini、Groq、ローカルの順。逆転判定は無料APIまたはfuzzy/feedbackを使用
- 一般単語の新RAGは共通DBから難易度別に起点語3件を抽出し、1回のLLMで3件を独立審査・相方生成する。生成時の距離とフィードバック集計後の距離を別カラムで保持する。DB migration、旧197,040語の取込、develop環境確認は `docs/WORDWOLF_RAG.md` を正本とする
- 旧197,040語の初回移行中だけ、`app-games-dev`のdevelop環境の管理画面に再開可能な取込パネルを置く。`LEGACY_WORD_DATABASE_URL`（未設定時は開発用 `APP_DATABASE_URL`）の `shared_word_catalog` だけを読み、`VOCABULARY_ADMIN_DATABASE_URL`（共通DB）へ1,000件ずつupsertする。旧カタログが開発DBにない場合は読取専用URLをdevelop環境だけへ一時設定する。`main`の本番環境では実行不能で、完了・件数照合後に一時API、パネル、環境変数、読取ロールを撤去する

詳細な挙動を変える前に、`lib/wordwolf-command-domain.ts`、`lib/wordwolf-room-normalizer.ts`、`lib/wordwolf-room-presentation.ts`、`lib/wordwolf-room-store.ts` の境界を確認する。

### ワードアウト（非公開オンライン試作・内部ID `nigoichi`）

- `/word-out` は非公開アクセスキーかつログイン済みの利用者向け。表示名は「ワードアウト / WORD OUT」。内部IDは旧データ互換のため `nigoichi` を維持し、旧URL `/nigoichi` は `/word-out` へリダイレクトする。部屋作成前は2〜6人の最大募集人数だけを指定し、A・M・難易度は作成後のロビーで設定する。最大募集人数に達すると新規参加を締め切り、2人以上なら上限未満でも開始できる。部屋一覧、4文字コード、任意の合言葉、アクティブ部屋復帰に対応する。
- 設定はプレイヤー人数P、1人に配るカードA、書く連想語M、場のカードBとし、`P>=2`、`1<=M<=5`、`A>=2M`、`B=P×A+1<=21` をクライアントとサーバーの両方で検証する。場に並ぶカード総数は最大21枚。PまたはM変更時はAの範囲を再計算し、範囲外のAを自動補正する。初期値と旧ルームの補完値はA=2、M=1。Aを増やすことで、より多くの言葉を連想語で伝える高難度設定にできる。
- 各人は自分のA枚を見てM個の連想語を自由に提出する。カードをグループへ分類したり、各連想語と特定カードを対応付けたりする必要はない。全員の提出後に連想語を一斉公開し、余り番号を全員が予想した後、言葉一覧、所有者、手札、連想語、予想、正誤を公開する。
- Redisを正本とし、revision付きCAS、共通TTL、1人1アクティブ部屋、閲覧者別sanitizerを使う。純粋ルールは `lib/nigoichi.ts`、保存データ復元は `lib/nigoichi-room-normalizer.ts`、進行準備は `lib/nigoichi-room-domain.ts`、表示整形は `lib/nigoichi-room-presentation.ts`、保存とCommandは `lib/nigoichi-room-store.ts`、APIは `app/api/nigoichi/rooms/route.ts`、クライアント境界は `app/nigoichi/nigoichi-room-api-client.ts`、画面は `app/nigoichi/NigoichiGame.tsx`。
- デバッグONのホストはダミーを最大6人まで追加・個別削除し、ダミーの連想語・予想を代行できる。未提出の一括補完、中断、行動ログ、任意のデバッグプレイバック記録に対応する。デバッグ部屋とダミーは通常戦績へ含めない。
- 余り番号を正解したプレイヤーは参加人数P−1点を得る。自分のカードがほかのプレイヤーの誤答に選ばれるたび1点を失い、`ラウンド得点 = 正解ボーナス − 被誤答票数` とするため負の得点もあり得る。同じ部屋での再戦は累計得点を引き継ぐ。固定の目標点・終了ラウンドはない。連想語入力と予想には別々の時間制限を設定でき、連想語の時間切れは「未提出」、予想の時間切れは不正解としてサーバーがラウンドを進める。余り番号の正解・不正解は1ゲームの結果として戦績へ記録する。
- 結果共有のプレイログには、番号順の言葉一覧（各語の持ち主または余り）と、各プレイヤーの「手札A枚 → 連想語M個」を含める。参加者名は入室時に保存した共有同意がONのときだけ表示し、それ以外は `PLAYER1` 形式で匿名化する。共有前に実際の文章をプレビューする。
- 単語はアプリDBの `shared_word_pool_evaluations` で `pool_key = 'standard-game'`、`eligibility_status = 'eligible'`、`evaluation_flags` に `general_game_pool` を持つ行を正本とし、`shared_word_catalog` から表記を取得する。難易度は `difficulty_tier`（`easy`、`normal`、`hard`）と対応する `difficulty_*` フラグの一致を確認して、開始時に必要枚数を重複なしで抽出する。簡単は簡単100%、普通は普通80%＋簡単20%、難しいは難しい50%＋普通40%＋簡単10%を各語ごとに抽選する。同じ参加者が当日（JST）このゲームで見た単語は除外し、必要数を揃えられないほど使い切った場合だけ当日履歴を全解除する。DB未設定または必要枚数を確保できない場合はローカル固定語彙へ戻さず、開始を503で失敗させる。実装は `lib/general-game-word-pool.ts` と `lib/general-game-word-history-store.ts`。

### コードインターセプト（非公開オンライン試作・内部ID `code-intercept`）

- `/games/code-intercept` は非公開アクセスキーかつログイン済みの利用者向け。旧 `/code-intercept` は正式URLへ転送する。4〜12人を赤・青へ分け、各チーム2人以上・人数差1人以内で開始する。チーム編成は手動または開始時ランダムを選べる。手動時はホストが全参加者、各参加者が自分を赤・青へ割り当てられ、ランダム時は人数を均等に振り分けてチーム内の出題順もシャッフルする。
- 秘密単語はワードアウトと同じ `shared_word_pool_evaluations` の `general_game_pool` 対象から重複なしに抽出する。ロビーで簡単・普通・難しいを選べ、簡単は簡単100%、普通は普通80%＋簡単20%、難しいは難しい50%＋普通40%＋簡単10%を各語ごとに抽選する。旧ルームは普通として復元する。同じ参加者が当日（JST）コードインターセプトで見た単語は除外し、使い切り時だけ当日履歴を全解除する。ワードアウトの履歴とは混ぜない。

### コードインターセプト（非公開オンライン試作・内部ID `code-intercept`）

- 秘密カード数Cは2〜8枚で初期4枚、暗号桁数Yは2〜Cで初期3桁、初期ポイントXは5点。伝達失敗は1ダメージ、敵の傍受成功は2ダメージ。第1ラウンドは傍受なし、第2ラウンドから敵暗号も回答する。
- 桁数は、両チームが全ラウンドで同じYを使う固定モードと、各ラウンドの出題者が自チームのYを選ぶ毎ラウンド選択モードを持つ。毎ラウンド選択では赤・青が異なる桁数を使用でき、両チーム確定前は敵の選択を隠す。両チーム確定後に桁数を同時公開してから暗号を生成する。
- ラウンド終了後の正解暗号は、ロビーで `全員に公開`（既定・標準推理ルール）または `自チームだけ` を選ぶ。後者では相手へ伝達・傍受の成否だけを返し、相手チームの正解暗号と、成功時に正解を漏らす味方回答を結果・過去ログから除外する。参加者共通の保存プレイバックからは両チームの暗号番号を省く。旧ルームは `全員に公開` として復元する。
- 両チームのヒントを揃えてから同時公開し、味方回答と傍受回答が揃ってからサーバーが両チームのダメージを同時反映する。片方だけ0点以下なら相手の勝利。両方が同時に0点以下なら、残りポイントが大きい側（マイナス幅が小さい側）の勝利とし、同値の場合だけ引き分け。出題者はチーム内の参加順で交代する。
- 3人以上のチームでは、出題者以外の全回答者が味方回答と傍受回答の案を個別に提出する。案は同じチームの回答者間だけに表示し、全員の案が一致した時にチーム回答として自動確定する。2人チームは従来どおり1人の提出で即時確定する。
- 相手チームが味方回答・傍受回答を完了するまでは、自チームの確定済み回答を再提出できる。複数回答者の案が再提出で不一致になった場合は確定済み回答を解除する。
- 秘密単語は同じチームだけ、現在暗号はそのチームの出題者だけに返す。敵の桁数選択、敵ヒント、相手の確定回答、秘密単語は公開可能フェーズまで閲覧者別sanitizerで除外する。ラウンド終了後の桁数・ヒント・傍受結果は過去ログへ表示し、正解暗号と味方回答は部屋の公開範囲に従う。
- ゲーム決着後は正解暗号の公開設定にかかわらず、赤・青両チームの秘密カードを全参加者へ返し、結果画面で並べて公開する。
- 過去ログUIは赤チーム・青チームを別テーブルにし、各行には正解暗号ではなく味方回答を表示する。
- 閲覧者が正解暗号を確認できるチームは、過去ヒントを秘密カード番号（1〜C）ごとの列に再配置する。`自チームだけ`で相手の暗号が伏せられる場合は番号対応を表示しない。
- ゲーム中のメイン領域には赤・青両チームの現在ポイントを常時並べて表示する。
- Redisを正本とし、revision付きCAS、共通TTL、1人1アクティブ部屋、Cookie由来のactor、サーバー側Command検証を使う。出題・ヒント作成とソナー選択は、それぞれなし／30／60／90／120秒から時間制限を選べ、時間切れはサーバーで自動補完・精算して進行する。詳細は `docs/CODE_INTERCEPT.md`。

## 7. たほい屋現行仕様の要点

- `/tahoiya`
- 2人から開始可能
- 「回答者1人」と「全員作成・全員投票」の2モード
- ロビーで1人あたりの偽説明数を1〜3件から選ぶ（既定1件）。説明担当は各枠を個別に投稿し、全員分の必要数がそろうまでは上書き可能
- 複数件はすべて別の投票候補へ混ぜる。同じ作者の各候補に入った票はそれぞれ作者へ加点し、全員投票では自作候補のすべてを選択不可にする
- 保存形式は `fakeDefinitions: Record<playerId, string[]>`。旧ルームの1件文字列は正規化時に1件配列へ移行し、件数設定がない旧ルームは1件として継続する
- 投稿完了で自動的に投票へ進む。手動の投票遷移ボタンは全員投稿後だけ表示
- 投票済み候補は本人の画面でシアン表示し、変更候補はアンバー表示
- 結果時に読み、正解説明、辞書・典拠情報を表示
- 参加とラウンド開始はサーバー側Command。結果前は合言葉、本物の説明、他人の偽説明、選択肢の正解フラグ、他人の投票を閲覧者別に隠す
- 正解説明は中央値が30文字帯になるよう、約10字、20字、30字を中心に、40字、50字、最大60字も低確率で混在させる。長い段階ほど出現率を下げ、無理に引き延ばさない
- 回答者1人モードだけ、偽説明担当へ正解情報を見せる設定が使える。全員投票では絶対に見せない
- 「秘境」と「魔境」のお題難易度がある。共通DBの `0 <= 実質Zipf < 3` を一つの未判定母集団とし、10語を難易度別に分けずランダム抽出する。LLM推定認知率が `1%超〜14%` なら秘境、`0〜1%` なら魔境とする
- お題候補は一般語、固有名詞、カタカナ語を含む。現代人物、企業、商品、流行語は除外

### たほい屋のお題生成

- 通常ゲームとデバッグ審査は共通単語DBを素材の正本とする。`0 <= effective_zipf < 3` の未判定語から10語ずつLLM審査する。文字数・品詞だけでは候補を除外しないため、activeな四字熟語も同じ条件で審査候補へ入る。
- デバッグロビーの「未判定10語を難易度審査」は、実際の未使用・未判定候補10語を説明なしでLLMへ渡す。一般成人の推定認知率を `既知 / 境界 / 一般には不明 / ほぼ誰も知らない` に分類し、秘境は `1%超〜14%`、魔境は `0〜1%` とする。センシティブ・大学名・企業名・地名は同じ `exclusion_flags` 配列で強制除外する。認知率、確信度、理由、除外フラグ、生成メタデータは `tahoiya_word_screenings` の同じ行へ保存し、結果は共有用にコピーできる。デバッグ審査だけでは説明文とプレイヤー出題履歴を作らない。
- 難易度審査は、対応プロバイダーでは共通LLMゲートウェイのJSON Schema指定で10件の必須フィールドを固定する。プロバイダー切替時の表記揺れは、入力件数・既知の除外フラグ・認知率範囲・重複IDを再検証したうえで補正し、安全に対応付けられない応答だけを自動再審査する。
- 旧取得元レジストリとGitHub自動生成ジョブは廃止済み。既存 `data/tahoiya-candidates.json` と移行APIだけは、旧候補を共通DBへ移す互換資産として当面残す。退避内容と復元方法は `docs/archive/TAHOIYA_SOURCE_HARVESTER.md` を参照する。

通常ゲームでは、まず完成済み `active_tahoiya_topics` から参加者全員が未経験の同難易度候補を再利用する。なければ `tahoiya_word_screenings` の判定済み・説明未作成候補を選び、使用する1語だけへ高品質LLMで読みと正解文を付与して完成済みカタログへ保存する。判定済み候補もなければ未判定10語を一括審査して全結果を保存し、同難易度候補がなければ最大3組30語まで繰り返す。説明生成で追加のセンシティブ判定にかかった語は同じ判定行へ `sensitive` フラグを追記する。

ラウンド開始中は、保存済みお題の確認、判定済み候補の確認、新規10語審査、正解説明生成、部屋反映の段階を `topicGenerationProgress` としてRedisの部屋状態へ保存し、参加者全員へ共有する。新規審査は最大3組の現在回数も表示する。進捗中は重複開始・設定変更・途中参加を拒否し、失敗時は該当する生成IDの進捗だけを解除する。更新が4分止まった進捗は復旧時に期限切れとして除去する。

正解説明の長さは全体共通の管理ハイパラ `tahoiya-definition-median` で中央値を10〜50文字帯から10文字刻みで選ぶ。初期値は30文字帯で、約10字、20字、30字、40字、50字、55〜60字を `15% / 25% / 30% / 17% / 9% / 4%` の順で混在させる。30文字帯までの累積確率は70%（20文字帯までは40%）で、上限は60文字。部屋設定には出さず、変更は保存済みのお題を書き換えず新しく生成する正解文から反映する。新規生成では各帯を単なる上限ではなく `6〜14 / 14〜25 / 24〜38 / 32〜46 / 40〜55 / 48〜60` 文字の目標範囲として扱い、長い帯ほど上位概念、識別特徴、対象、用途、成立条件など正確な語義要素を増やす。同義反復や周知度・語源・歴史・用例で水増しせず、正確な語義だけで選択帯へ自然に収まらない語は説明を短く採用せず候補ごと替える。保存済みのお題はこの検査で再判定せず、そのまま再利用する。

`lib/tahoiya-topic-catalog.ts` はBad評価語と今回の参加者が経験済みの語を除外する。誰が見たかはプレイヤー別Redis Setへ保存する。難易度判定の正本は `tahoiya_word_screenings`、説明完成後の正本は `tahoiya_topics` / `word_definitions` とする。旧Redis Hashと既存 `active_tahoiya_topics` も再利用対象として残し、管理画面のdevelop限定移行からお題と既出履歴を冪等に移す。

## 8. フィードバック/RAG

- Good/Badと理由タグはクリック時に自動保存し、自由記述だけは入力途中を送らず専用ボタンで保存する。短時間に選択を変えた場合もクライアントで保存リクエストを直列化し、古い選択が後から上書きしない。同じ内容をプレイヤー単位で保存する
- 使用APIとモデル、設定、結果も同時に保存
- 管理画面のLLM評価レビューでは、管理者のOK/NG票とAI判定の最終採用・不採用を別操作として扱う。管理者票はお題品質フィードバックへ1票として反映する。最終採否は相方未生成を含む評価単位で保存し、どちらも選考済みとして一覧から除外する。紐付く未審査のペアdraftがある場合だけ、正式採用は`active`へ昇格し、不採用は`rejected`へ変更する。不採用の範囲はワードウルフ候補のみで、単語自体、共通Zipf、他ゲームの適格性は変更しない。MFA再確認と確認ダイアログを必須とし、LLM判定と投票内容は自動変更しない。
- 同じレビュー画面から一つ目の単語を既定対象として「たほい屋候補」へ送れる。辞書由来の`words.zipf`は変更せず、実質Zipfが3以上または未計測なら全ゲーム共通の`selection_zipf_override`を秘境側の2.9へ設定し、すでに3未満なら現在値を維持する。この操作は同じ評価をワードウルフ候補として自動的に不採用へ最終確定し、紐づく未審査のpair draftも`rejected`へ変更して一覧から除外する。単語自体や他ゲームの適格性は無効化しない。
- 同じartifactへの評価は更新可能
- たほい屋には「もっと難しい単語」「実在・読み・説明が怪しい」などの理由タグがある
- Bad語はお題生成のNGリストと保存問題の再利用除外へ反映する

## 9. 開発・検証・公開

更新系API、タイマー、認証、戦績、LLMは `lib/observability` から1行JSONの構造化イベントを出力する。Vercel Runtime Logsでは `event`、`roomRef`、`requestId`、`outcome`、`errorCode` で追跡する。GETポーリング成功は記録しない。ログ禁止情報、調査順、将来collector構成は `docs/OBSERVABILITY.md` を正本とする。

ブラウザのWeb Vitalsはセッション単位で50%を抽出し、1サンプルの追加・期限切れ削除・件数上限・TTL更新を1 Redis commandへまとめる。運営ダッシュボードは表示中だけ60秒間隔で基本集計を更新し、外部容量確認を含む診断詳細は初回・手動または5分経過後のタブ復帰時だけ更新する。

オンライン部屋の通常ポーリングは3秒、ロビー・結果は5秒とし、各端末へ±10%の揺らぎを加えて同時アクセスを分散する。非表示タブでは停止し、通信失敗時は最大30秒まで指数バックオフする。部屋GETはrevisionと閲覧者を材料にしたETagを返し、304では閲覧者別の公開用変換とJSON直列化も省略する。部屋保存と参加者アクティブ索引のTTL更新、新規作成と一覧・参加者索引の登録、解散時の部屋・一覧・参加者索引削除はそれぞれ一つのRedis EVALへまとめる。時間切れ確定はホスト端末を優先し、他端末は順番に待機してホスト不在時だけ代行する。

本番ロビーはGitHub Actionsの `production-smoke.yml` で30分ごとに監視する。軽量負荷試験は `npm run load:smoke` を使い、localhost以外は `LOAD_TEST_ALLOW_REMOTE=1` を必須とする。本番への誤負荷を避けるためリモート実行は最大100リクエスト・同時数5、GETだけに制限する。詳細な閾値とVercel Alertsの初期値は `docs/OBSERVABILITY.md` を正本とする。

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

変更後はlint、回帰テスト、production buildを通す。UI状態を変えた場合は、ホストと非ホスト、通常モードとデバッグモード、フェーズ遷移前後を確認する。

`main` へのpushでVercelが自動デプロイする。公開作業の完了条件は以下。

ChatGPT Workではスレッドごとに作業環境が新しくなり、前スレッドにあったローカルcheckoutやGitHub CLI（`gh`）が存在しない場合がある。最初にリポジトリを取得して最新mainとの一致を確認する。`gh` がなくても接続済みのGitHubアプリが使える場合は、GitHub APIでblob、tree、commitを作成し、mainのrefをfast-forward更新して公開できる。CLIがないことだけを理由に公開不可と判断せず、GitHub連携ツールの利用可否を確認する。

1. GitHubのmainへ意図したファイルだけをコミット
2. Vercel対象デプロイが `READY`
3. 必要に応じて本番APIまたは画面を1回だけ確認
4. APIテストを無意味に繰り返して無料枠・有料枠を消費しない

## 10. 引き継ぎメモの保守

別スレッドで迷わず改造へ入れることを優先する。次の変更を行ったら、この文書も同時に更新する。

- ゲームルールや得点
- 部屋・ログイン・永続化方式
- LLMプロバイダー、モデル、フォールバック順
- RAG、履歴、問題再利用方式
- 必須環境変数
- 主要ファイルの追加・移動
- 検証・デプロイ方法


## 11. 個人利用ゲーム枠

- 必須環境変数: `PRIVATE_GAME_ACCESS_KEY`
- ロビー上部の無注釈フィールドは `/api/private-game-access` でサーバー照合する。値をクライアントへ公開しない。
- 照合成功時は30日間のHttpOnly Cookieを発行し、個人利用ゲームカードを表示する。
- `/northern-branch` はサーバー側でもCookieを検証し、未解除の場合は `/games` へ戻す。
- `/word-scale` は公開ゲームとしてアクセスキーなしで利用できる。旧 `/kotoba-de-kazu-narabe` と `/hodoai-talk` はここへ転送する。
- `/word-sonar` も公開ゲームとしてアクセスキーなしで利用できる。旧URL `/kotoba-senpuku` はここへ転送する。
- ノーザンブランチはログイン必須の2〜4人オンライン部屋制。Redisへrevision付きで保存し、市場・得点・手番を共有する。手札は本人（デバッグON時はホストも可）にだけ返す。
- 仮カードと仮建物は `lib/northern-branch-data.ts`、ゲーム進行は `lib/northern-branch-game.ts`、Redis部屋は `lib/northern-branch-room-store.ts`、APIは `app/api/northern-branch/rooms/route.ts`、画面は `app/northern-branch/NorthernBranchGame.tsx`。
- ノーザンブランチのデバッグONホストはロビーでダミーを最大4人まで追加でき、全手札を確認してダミー手番を代行できる。通常時は手番本人だけが行動できる。
- 正式なカード構成へ差し替える前に `docs/NORTHERN_BRANCH_PROTOTYPE.md` の未実装一覧を確認する。
- ワードスケールは2人以上のログイン必須オンライン部屋制。各自へ0～120の数字カードを1～5枚（初期値1枚）最初に1度だけ配り、同じカードへテーマを変えて1～4回ことばを出した後、全カードを1度だけ昇順へ並べる。通常画面に人数上限は表示せず技術的安全上限は50人、カード総数は121枚以下とする。
- 部屋一覧・4文字コード・任意の合言葉・アクティブ部屋復帰に対応する。Redisを正とし、revision付きcompare-and-setでヒント提出、時間切れ遷移、並べ替え、採点を保存する。
- 各回の提出中は本人が持つカードの数字と本人が過去回を含めて提出したことばだけを返す。複数枚を持つ場合は未提出カードのことばを一度に提出し、設定回数ぶんの全カード提出後に全員のことばを公開する。ゲーム開始時に参加者からランダムで選ばれた並べ替え役1人だけがカードを動かし、最終順を確定して数字を公開する。担当者以外の `reorder` と確定Commandはサーバー側で拒否する。
- ワードスケールの参加者・部屋設定は広い画面では左カラム、狭い画面では左端から開くドロワーへ収納する。ことば提出から最終並べ替えまで120を上、0を下にした縦スケールを共通使用し、候補カードは上から大きい順に表示する。採点用データは0から120の昇順を維持する。8枚以下は詳細を常時表示し、9枚以上は小型カードへマウスオーバー・フォーカス・タップしたとき別枠へ詳細を表示する。マウス・タッチのドラッグまたは上下ボタンで操作し、ドラッグ中は端末内だけで順番を変え、ドロップ時に1回だけ保存する。
- ワードスケールの外部共有文には最終数字、提出したことば、書き手を120側から0側への降順で最大20枚まで載せる。表示名は本人がマイページで明示許可した場合だけ載せ、未許可なら入室順の `PLAYER1` 形式へ置き換える。許可状態は入室時のスナップショットを使う。
- 既存部屋を継続するため、API、Redisキー、TypeScript内部名の `hodoai` は互換識別子として維持する。
- デバッグONのホストはロビーでダミーユーザーを追加・個別削除できる。ダミーは通常アカウントやアクティブ部屋索引を作らず、個別削除またはデバッグOFF時に部屋から除去する。
- 権利面・人数・詳細ルールは `docs/WORD_SCALE.md`、型と独自お題は `lib/hodoai-talk.ts`、並び順の純粋処理は `lib/hodoai-arrange.ts`、Redis進行は `lib/hodoai-room-store.ts`、APIは `app/api/hodoai/rooms/route.ts`、画面は `app/hodoai-talk/HodoaiTalkGame.tsx`、カードUIは `app/hodoai-talk/WordScaleArrangeBoard.tsx`、縦スケールは `app/hodoai-talk/WordScaleVerticalScale.tsx`、左パネルは `app/hodoai-talk/WordScaleRoomPanel.tsx`。
- ワードソナーは2人以上・人数上限なしの独自オンライン文字推理ゲーム。探知または秘密語の特定で全文公開されると脱落し、以後の手番を失う。開始前に連続探知のON/OFF、秘密語回答の有無、直接回答語をログへ表示するかを選択できる。公開文字は語順どおり左詰めで文字数を隠し、最後の1人を勝者とする。同時脱落時は最短語を優先し、同長なら同率勝利。各ラウンドの勝者は3点、ほかは0点で、同率勝者は全員3点。複数ラウンドでは累計する。秘密語は文字数上限なしのひらがなのみで、カタカナ等は変換せず再入力を求める。
- ワードソナーはラウンド数、秘密語入力時間、手番時間、対戦ルールをプレイヤー別デフォルトとして保存する。デバッグONホストはダミー追加、秘密語補完、全秘密語表示、手番代行・自動実行ができる。詳細は `docs/KOTOBA_SENPUKU.md`。

## 12. SDK Portalと制作者プレビュー環境

- SDK Portalから本体Previewを開くときは、Portalの連携アカウントから制作者slugと本体originへ限定した60秒の署名コードをiframe URLのfragmentへ渡す。本体の`/api/sdk-preview/session`がこれを`/api/sdk-preview`限定・8時間のHttpOnly Cookieへ交換し、fragmentを即時消去する。通常の本体プレイヤーCookieや本体API権限へは昇格させない。外側画面は本体プレイヤーCookieまたはこのPreview専用Cookieの検証完了後だけ表示し、Portalの表示だけを根拠に「認証済み」としない。
- SDKの`content-source`で公開するpoolは一般語彙`general-words`と審査済みワードペア`word-pairs`だけとする。低認知語彙と、たほい屋の未審査候補・審査結果・採用済みお題は、公開型・定数・資料・サーバー検証の全段で遮断する。旧opaque IDはv2移行で無効化し、過去に取得した低認知語彙IDから語釈を再取得できないようにする。
- SDK Portalは`apps/sdk-portal`を正本とし、同じコードを`main`の`sdk.game-fields.com`と`develop`の`sdk-dev.game-fields.com`へ公開する。機能と制作フローは同一で、接続先と保存先だけを環境ごとに分離する。
- 制作者URLの表画面はPortal独自ロビーを持たず、Game Fields本体の`/sdk-preview/<creator>`を全画面利用する。カード固定外枠、ログイン、共通UIは本体と共有するが、ゲーム一覧は当該制作者へ保存された開発中ゲームだけに置換し、本番・dev本体の組み込みゲームは表示しない。ゲームURLは`/<creator>/games/<game-id>`とし、`/mock`を利用者向けURLにしない。
- `app/games/game-definition-source.ts`の`GameDefinition`を組み込みゲームとSDKゲームの共通入口とする。platform固定module、全ゲーム必須core、ゲーム別capabilityの採否を分け、不採用は理由付き`disabled`で宣言する。現行9ゲームの採否は`app/games/built-in-game-module-policies.ts`を正本とし、登録簿との過不足と不採用理由を自動テストする。オンライン部屋から観戦、戦績保存からratingのような隣接機能の自動推定はしない。
- 試用期間中の入口ファイルは`/GameFieldsDownloadMe-ver9.md`から配布する。正本は`/sdk/entry/START_GAME_FIELDS.md`で、Portalのdev/build前に`sync:download`が`public/GameFieldsDownloadMe-ver9.md`へ同期する。旧`DownloadMe.md`、`GameFieldsDownloadMe.md`、`GameFieldsDownloadMe-ver1.md`〜`ver8.md`へのWebアクセスは現行ver9へ一時redirectする。内容を改版するときはファイル名の`verN`とstarter manifestの`downloadMeVersion`を同時に上げ、仕様固定後にバージョンなしの名前へ戻す。配布ファイルを手作業で別管理しない。
- Game Fields本体とSDK Portalの公開版は`config/platform-release.json`の`platformVersion`を共通の正本とする。SDK package、Runtime、Portalのpackage versionは同版へ固定し、`npm run check:versions`で不一致を拒否する。既存ゲームは作成時のSDK契約schemaへ固定し、最新版への一斉更新はしない。互換維持と旧schema廃止条件は`docs/SDK_VERSIONING.md`を正本とする。
- 制作者ごとに`https://<SDK Portal>/<slug>`を一つ割り当てる。ゲームごとにURLを増やさず、その制作者の広場へゲームカードを追加する。
- URL名は3〜32文字の小文字英数字とハイフン。AIは制作開始時に希望名を聞き、`/api/instances/check`で重複確認後、`/api/instances/reserve`で7日間仮予約し、予約トークンを`/api/instances/finalize`へ渡して正式確定する。仮予約はRedisの`SET NX`、正式slugと制作者情報はPostgreSQLを正本とする。確定時に一度だけ返す管理トークンはハッシュだけをDBへ保存する。
- 制作者のゲーム登録は`/api/instances/<slug>/games`で取得し、管理トークンをBearer認証に使うPUTで登録・更新する。manifest、SDK package版、SDK契約schema、公開状態をPostgreSQLへ保存し、Portalが対応しない契約schemaは拒否する。
- 必須環境変数はSDK Portal専用のRedis接続`SDK_REDIS_REST_URL` / `SDK_REDIS_REST_TOKEN`とPostgreSQL接続`SDK_DATABASE_URL`。Vercel統合の標準名`KV_*`、`POSTGRES_PRISMA_URL`、`DATABASE_URL`も互換読取する。未設定時は空きや保存成功を推測せず503を返す。
- 表のGame FieldsアカウントをSDK所有権の正本として使う。Portalの`/api/account-link/start`は本体`/api/sdk-account-link`へ遷移し、本体の署名済みプレイヤーCookieで本人確認した後、プレイヤーIDと表示名を含む60秒の署名コードをSDKへ返す。Portalはstateを照合して30日のSDK専用HttpOnly Cookieへ交換し、新規制作者の`owner_player_id`へ紐づける。PortalヘッダーはSDKログイン状態、本体の連携表示名、再連携、ログアウトを常時確認できるメニューを表示する。旧Cookieも有効だが、表示名は一度再連携した後に表示する。表サイトのパスワードとCookieをSDKへ渡さない。環境別の`SDK_ACCOUNT_LINK_SECRET`を本体とPortalだけで共有し、`GAME_FIELDS_APP_BASE_URL`で接続する本体を固定する。
- ChatGPT WorkとCodexの共通制作経路は`/api/mcp`のOAuth 2.1付きリモートMCPとする。DownloadMeへ秘密値を埋め込まない。protected resource metadata、authorization server discovery、DCR、authorization code + S256 PKCE、refresh token rotation、scope検証をPortalで提供する。MCP toolsはログイン中アカウントの既存制作者環境一覧、URL空き確認、本人名義の予約・確定、本人所有環境へのgame package保存だけを公開し、本体DB・管理機能・他利用者環境へは到達させない。制作開始時はまず`get_sdk_handshake`へDownloadMe記載の環境・release・contract・必須capabilityを送り、`accepted=true`とcanonical endpoint一致を確認する。その後に`list_creator_environments`を呼び、既存環境が1件なら再利用、複数なら選択、0件の場合だけ新規URLを予約する。WorkはGame Fields App、Codexは同じリモートMCP URLを使う。初回のApp／MCP接続とブラウザ承認は利用者操作が必要で、DownloadMe添付だけで未登録Appを自動導入できるとは説明しない。
- 初期プレビューは制作者slugごとにブラウザ保存を分離し、広場、入室前、部屋ロビー、ゲーム固有領域、結果、視点・ダミー・中断のデバッグUIを確認できる。閲覧視点は参加者・観戦者を直接選ぶボタン群とし、DEBUGウィンドウを最小化しても固定領域へ残す。フェーズ確認はロビーの開始、プレイ中の結果確認・中断、結果の部屋復帰という公式Lifecycle導線を使い、DEBUG内に`lobby / playing / result`へ無条件遷移するショートカットを置かない。未審査Previewは今後も本体Roomへ接続しない。運営者が採用して`lib/game-sdk-server-registry.ts`へ静的登録したserver moduleだけが、`/api/game-sdk/[gameId]/rooms`と公開`@game-fields/game-sdk/client-runtime`を通じて署名Cookie認証・レート制限・Redis CAS・active room・公開一覧・ロビー／結果後の解散・revision-only WebSocketへ接続する。WebSocketは状態を運ばず、通知後にHTTPで閲覧者別Viewを再取得する。最初の`wordwolf-sdk`登録はdevelop限定で、mainでは利用不可とする。
- 現在の保存API名、MCP tool名、private Git階層には移行互換として`mock`が残るが、利用者向けの概念・URLには出さない。保存物はgame packageとして扱い、表URLは`https://<SDK Portal>/<slug>/games/<game-id>`とする。PortalはDBの確定commit SHAへ10分のHMAC grantを発行し、本体共通UI内のゲーム固有surfaceだけを隔離runtimeへ接続する。
- ゲーム保存後の最初の利用者向けリンクは、ゲーム単体ではなく制作者トップ`https://<SDK Portal>/<slug>/`とする。MCPの`publish_mock`は`creatorUrl`と`gameUrl`を返し、既存クライアント互換の`previewUrl`は`gameUrl`と同値で当面残す。今回のゲームへ直接入る`gameUrl`は補助リンクとして案内する。
- 隔離previewはGitの確定commitを動的に読むため、ゲームごとのVercel deploymentを行わない。実行ProjectはDB・Redis・Blob・管理API・Git書込権限を持たず、専用mock Gitの読取専用資格だけを持つ。入口Cookieはmock scopeのpathへ限定したHttpOnlyとする。`allow-same-origin`を付けないopaque-origin iframeではCSS・JavaScript等のsubresourceへCookieが送られないため、認証済みHTMLへ同一制作者・同一ゲーム・同一commit・同一期限だけを読めるHMAC asset token付き`base`を注入する。asset tokenは入口sessionや別revisionの読取には使えない。CSPとiframeの両方で`allow-same-origin`、外部通信、フォーム、親画面アクセスを許可しない。
- 隔離previewは各HTMLへ`apps/sdk-preview/lib/preset-runtime.ts`の`GameFieldsPreset`と上記asset baseを自動注入する。参加者、ダミー、デバッグ、視点、フェーズ、開始、中断、再戦、自動進行は外側のPlatform Shellと共通Commandが所有し、ゲームpackageのHTMLは盤面・固有操作・固有結果だけを含む`game-slot`に限定する。ゲーム固有JavaScriptは`registerGame`で固有状態の処理だけを接続し、広場、ヘッダー、入室、部屋、参加者、ルール、デバッグパネルをiframe内へ複製しない。Runtimeはadapter登録状態を外側へ返し、未登録なら開始を拒否する。SDK-devのゲーム確認画面は、部屋作成・参加、Roomロビー、参加者、設定、開始、DEBUG、同期revision、時間管理、共通結果、再戦・解散を外側へ合成し、共通開始条件は`minimumPlayers: 1`としてホスト1人でも開始可能にする。設定画面はゲームpackageの`settings`宣言だけを描画し、最大人数・ラウンド数・難易度・モード等を固定表示しない。`online-room`で必須なのは`platformRole: "time-limit"`を持つ制限時間1項目だけで、その`defaultValue`と`options`もpackageが所有する。`maximum-players`と`round-count`のroleは必要なゲームだけが任意宣言する。選択値はRoom設定とpreset Runtimeの`settings`へ同期し、ゲーム固有iframeは参照だけを行う。複数人が必要な固有ルールはゲーム内で検証し、Preview Shell自体は2人待ちにしない。ロビーからプレイへの遷移では同じiframeを保持する。ゲーム固有iframeはpreset Runtimeから通知された実コンテンツ高へ追従させ、固定高の二重スクロールで下部を閉じ込めない。プレイ中の外枠は最大1600pxとし、ゲーム固有領域へ可変幅、Room情報へ280pxを割り当てる。timerの締切・受付・リセットは共通moduleを正本とし、表示位置と見た目だけをゲーム固有クライアントへ委ねる。Previewは任意位置の`data-gf-timer`へ描画し、正常に1手が確定した`timer:turn-complete`だけで次手番へリセットする。本体AppSetは成功transitionの`timer: "reset"`を使い、共通Runtimeがサーバー時刻で`startedAt`と`deadlineAt`を更新する。拒否・入力エラー・AI失敗ではリセットしない。全38件は`app/sdk-preview/[creatorSlug]/games/[gameId]/sdk-preview-module-registry.ts`で実装へ解決し、未割当の必須IDを許可しない。外側のmodule labは認証・レート制限付きPlatform APIで実DBの読取sampleと実LLM接続を確認する。単語を使うモックには`GameFieldsPreset.resources.contentSource`、LLM必須ゲームには`GameFieldsPreset.resources.llm.generate`をpostMessage bridgeとして注入し、外側Shellがログイン、保存済みゲーム、必須module、レート制限を検査して本体の`/api/sdk-preview/content-source`または`/api/sdk-preview/llm`へ中継する。content-source bridgeが受けるのは`drawWords`、`drawWordPairs`、`findDefinitions`と公開requestだけで、返すのはopaque ID、表記、読み、難易度、公開tag、関係、短い語釈だけとする。iframeはDB接続、テーブル、SQL、内部ID、provider APIキー、接続先、課金元、model、fallbackへ到達できない。本体採用後はbrowserからresourceを直呼びせず、clientが送るゲームCommandを審査済みAppSetが`context.resources.contentSource`または`context.resources.llm`へ接続する。クライアントの単語難易度は`easy | normal | hard`をRoom settingsへ保存し、表示を「簡単・普通・難しい」とする。制作AIは単語ゲームの初期DB、固定・seed・fallback語彙を作らず、`check:mock`はWord DB利用宣言時のbridge接続を必須にする。利用属性とAPIは`sdk/starter-template/SDK_MODULE_CATALOG.md`と`SDK_API.md`を正本とする。本体統合時の認証・認可・永続化を、このブラウザPreview状態で代用してはならない。
- `SDK_PREVIEW_SIGNING_SECRET`はPortalと対応previewだけで環境別に共有する。Portalだけに`SDK_MOCK_GITHUB_WRITE_TOKEN`、previewだけに別の`SDK_MOCK_GITHUB_READ_TOKEN`を設定し、どちらも専用非公開repo以外へ権限を与えない。変数配置は`docs/ENVIRONMENT_VARIABLES.md`を正本とする。
