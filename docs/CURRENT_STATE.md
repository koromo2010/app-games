# App Games 現行実装

> この文書は、`develop` ブランチ時点で実装・運用されている内容を記録する。
> 構想、未着手案、将来の置き換え予定は [`FUTURE_PLAN.md`](./FUTURE_PLAN.md) に分離する。
> 文書とコードが食い違う場合はコードを確認し、差分を未修正事項として明示する。

## 概要

App Games / Game Fields は Next.js で構築したオンラインゲーム基盤である。

開発再開時は、最初に [`docs/README.md`](./README.md) の資料ナビを確認する。

## 主なルート

- `/games` - ゲーム一覧
- `/admin` - サイト設定・管理機能
- `/users/me` - プレイヤーの戦績、リプレイ、お気に入り、共有、アカウント設定
- `/wordwolf` - ワードウルフ
- `/tahoiya` - たほいや
- `/northern-branch` - ノーザンブランチ
- `/word-scale` - ワードスケール
- `/word-sonar` - ワードソナー
- `/word-out` - ワードアウト
- `/games/code-intercept` - コードインターセプト
- `/daifugo` - 大富豪
- `/daifugo/practice` - 大富豪CPU練習
- `/canvas` - お絵描きキャンバス

旧ルートの一部は現行ルートへリダイレクトする。

## 非公開ゲームへのアクセス

サーバー側の `PRIVATE_GAME_ACCESS_KEY` と、ゲーム一覧で入力した値が一致すると、非公開ゲームを表示し、30日間有効なHttpOnly Cookieを発行する。

## サイト管理

`SITE_ADMIN_PASSWORD` を設定して `/admin` を使用する。未設定時は互換用として `DEBUG_MODE_PASSWORD` を受け付ける。

管理画面では、サイト名、検索用タイトル・説明候補、favicon、管理者メール、共通メニューから届いた改善要望・バグ報告、公開フォームから届いたお問い合わせなどを管理する。報告と問い合わせは一覧と詳細を確認し、対応状態を管理できる。問い合わせ通知メールが失敗しても管理画面の保存内容は失われない。管理セッションは署名付きHttpOnly Cookieで保持する。

### SDKアプリの昇格と復元

devとmainの採用済みSDKアプリ情報は環境別DBに分離する。管理画面には次の独立した経路がある。

- `SDK-dev → dev`／`SDK → main`: 外部提出candidateを対応環境へ採用
- `dev app → main app`: devで検証済みの固定revisionをアプリ単位でmainへ新規登録または更新
- `develop → main`: 本体Git branch全体のfast-forward

アプリ更新時はmainのゲームID・URL・公開設定を維持する。各更新前の版は`sdk_app_releases`へ追加専用履歴として残り、管理画面から過去版を選んでアプリ単位で復元できる。復元自体も新しい`rollback`リリースとして記録し、本体や他アプリ、既存Roomは巻き戻さない。

## 共通LLMゲートウェイ

ゲームからAIプロバイダーを利用する処理は `lib/game-llm.ts` を経由する。ゲーム固有ルートからOpenAI、Gemini、Groqを直接呼ばない。

現行の優先順は次の通り。

1. プレイヤーが選択した個人API
2. Game Fields側の `SHARED_OPENAI_API_KEY`（移行互換: `OPENAI_API_KEY`）
3. Gemini、Groqの共有キーによるフォールバック
4. ローカルデータによる最終フォールバックと利用者への通知

モデルIDは `lib/llm-model.ts` に集約する。プロバイダー切替とフォールバックは共有ゲートウェイ内だけで行う。

クライアント側は `lib/ai-activity-client.ts` を使い、AI通信中は共通トップバナーに稼働状態を表示する。

品質重視の処理は `quality: "high"` を指定できる。生成情報は `GameGenerationMeta` に記録する。

## APIキーとセッション

個人APIキーはサーバー側で検証し、Redis、プレイヤーアカウント、ログ、localStorageには保存しない。AES-256-GCMで暗号化したHttpOnly Cookieに最大8時間保持する。

推奨するサーバー側設定:

- `LLM_SESSION_SECRET`（32文字以上）
- `PLAYER_SESSION_SECRET`（32文字以上）
- `RATE_LIMIT_HASH_SECRET`（任意、32文字以上推奨）

プレイヤー本人は署名付きセッションCookieから判定する。マルチプレイAPIはリクエスト本文のプレイヤーIDを本人証明として信用しない。

状態変更APIにはRedisベースのレート制限を適用する。

## AIフィードバックとRAG

共通基盤は次のファイルを使用する。

- `app/api/game-feedback/route.ts`
- `lib/game-feedback-store.ts`
- `lib/game-ai-types.ts`
- `app/components/GameFeedbackPanel.tsx`

生成物にはプロバイダー、モデル、利用モード、プロンプト版、遅延、参照したフィードバックなどを記録する。

現行の検索はRedis索引とゲーム・タスク・設定タグを利用する。

## 共通ルームUIと進行

- ルーム設定表示: `app/components/RoomConfigSummary.tsx`
- ルーム操作: `app/components/OnlineRoomLifecycleActions.tsx`
- 結果画面操作: `RoomResultActions`
- デバッグ入口: `app/components/DebugModeButton.tsx`
- ルーム設定保存: `lib/game-room-defaults-client.ts`
- サーバー正規化: `lib/room-defaults-store.ts`
- 制限時間定義: `config/game-registry.json`
- 共通時間設定: `lib/game-room-config.ts`
- 時間設定UI: `app/components/RoomTimeLimitControl.tsx`

ロビーではホストが部屋を解散できる。プレイ中はルームライフサイクル操作を表示しない。結果画面では部屋へ戻る、ロビーへ戻る、ホストによる解散を提供する。

各ゲームは制限時間ポリシーを登録する。`0` は時間制限なしを意味する。ゲーム固有のタイムアウト遷移はサーバー側で処理する。

## デバッグモード

ホスト用の共通デバッグウィンドウでは、ダミー参加者、読取専用の閲覧視点、安全な主要状態進行、時間切れ・切断・入力拒否の再現、自動進行、リプレイ記録、ゲーム中断などを扱う。ゲーム固有stateのphase文字列は直接書き換えない。

PCでは移動・サイズ変更・最小化が可能で、外側を押すと操作を消費せず最小化する。小画面では画面内に固定する。

利用権限は確認済みメールと管理画面の登録、または管理者による個別付与で判定する。プレイヤー自身による権限付与はできない。

## オンラインルーム通信

全オンラインゲームは `lib/online-room-api-client.ts` とゲーム固有の型付きアダプターを利用する。

表示中タブの同期とタブ間更新は `app/hooks/use-online-room-polling.ts` を利用する。

Previewとローカル開発ではrevision通知だけをWebSocketで受け、実データは権限に応じたHTTP読取で再取得する。切断時はポーリングへ戻る。本番では明示的に有効化しない限りWebSocketを使用しない。

SDK採用ゲームは `@game-fields/game-sdk/client-runtime` を利用する。SDKクライアントはactor identityを送らず、署名付きプレイヤーセッションを正本とする。

正式Package Shellはwatcher・HTTP Command・timerの応答をrevision順に統合し、遅着した応答で表示を巻き戻さない。Roomのactive索引は、参加者が結果後に別Roomへ移った場合に旧Roomの再戦で上書きしない。非参加者は参加前のlobby View以外を取得・操作できず、無効化されたmoduleのCommandとPlatform resourceもサーバー境界で拒否する。結果Roomの解散前にはresult outboxを完了し、戦績・rating・playbackを失う状態ではRoomを削除しない。

## 広告枠の現状

`app/components/GameAdSlot.tsx` にプロバイダー非依存の枠がある。広告表示は初期状態で無効。

`NEXT_PUBLIC_GAME_ADS_MODE=preview` は予約レイアウトの確認にのみ使用する。現時点で本番広告配信は有効化しない。

## 語彙データ

たほいや用候補生成では、JMdict/EDICT、MeSH、Getty Vocabularies、国立国会図書館などを参照元として利用する。保存する説明はゲーム向けの短い言い換えとし、辞書本文を転載しない。

候補生成はGitHub Actionsの `Generate Tahoiya candidate catalog` でゲーム進行とは分離して実行する。候補は `data/tahoiya-candidates.json` に追加し、デプロイ済みアプリは未登録レコードだけをRedisへ取り込む。

生成用GitHub Actionsでは `OPENAI_API_KEY` をRepository Secretに設定する。任意の `TAHOIYA_GENERATOR_MODEL` でモデルを指定できる。

## パスワード再設定とメール

プレイヤーは確認済みの復旧用メールを登録できる。登録・変更は確認リンクを開いた時点で確定する。パスワード変更には署名済みセッションと現在のパスワードが必要。

関連するサーバー側環境変数:

- `SHARED_RESEND_API_KEY`（移行互換: `RESEND_API_KEY`）
- `EMAIL_FROM`（任意）
- `APP_BASE_URL`

`game-fields.com` をResendで検証し、APIキーをブラウザーへ公開しない。

## 開発コマンド

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run build:sdk
npm run build:runtime-packages
npm run test:sdk-package
npm run build:sdk-starter
npm run test:sdk-starter
```

## 正本

- 開発資料ナビ: [`docs/README.md`](./README.md)
- 現在の開発状態: [`DEVELOPMENT_HANDOFF.md`](./DEVELOPMENT_HANDOFF.md)
- 未修正事項: [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)
- 環境変数台帳: [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md)
- ゲーム登録: [`../config/game-registry.json`](../config/game-registry.json)
