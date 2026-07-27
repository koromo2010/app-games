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

管理画面では、サイト名、検索用タイトル・説明候補、favicon、管理者メール、共通メニューから届いた改善要望・バグ報告、公開フォームから届いたお問い合わせなどを管理する。本体広場はフッターに加えてヘッダーにもお問い合わせ導線を常設し、ゲーム一覧が短い場合も画面を下まで探さず公開フォームを開ける。改善・バグ報告フォームの入力は送信成功まで同じタブの`sessionStorage`へ一時保存し、ゲーム進行による再描画や再読込後も復元する。報告と問い合わせは管理画面の一つの「問い合わせ・報告」受信箱へ新しい順に混在表示し、種別バッジで判別する。初回投稿は「内容」に一度だけ表示し、会話欄は実際の返信・追記がある場合だけ追加メッセージを表示する。どちらも一覧・詳細・会話履歴、返信、対応状態、管理者通知の送信状態・安全な失敗理由・再送を同じ操作で管理できる。管理者アカウントの「問い合わせ・報告を受け取る」は、公開問い合わせ、ゲーム内・SDK Portalの新規報告、問い合わせ者・報告者の追記を共通の購読先へ送る。運営返信はfull管理者セッションで送信でき、追加のパスキー再確認は求めない。対応状態変更と管理者通知再送は直近MFAを維持する。運営返信は既定で「ユーザー返信待ち」、送信者の追記は「オープン」へ戻る。通知・返信メールが失敗しても管理画面と利用者向け会話画面の保存内容は失われない。失敗した運営返信メールは保存済み本文と同じ冪等キーでメールだけを再送でき、会話履歴を増やさない。管理セッションは署名付きHttpOnly Cookieで保持する。

管理者パスキーは端末内platform authenticator、discoverable credential、本人確認を登録・認証の両方で必須にする。復旧コードでログインした場合はWindows Helloの再登録へ誘導し、登録成功後に通常セッションへ切り替える。break-glass復旧モードはMFAリセットと読取診断に限定し、管理者追加・更新・削除を含む通常管理操作をAPI側でも拒否する。

通常のfull管理者は、直近MFAを再確認したうえで自分自身のパスキーと復旧コードだけを初期化できる。他の管理者のMFAリセットはbreak-glass復旧モードに限定する。
パスキーを利用できない場合は、既存fullセッションとstep-up challengeの管理者メールが一致するときだけ未使用復旧コードを直近MFAとして利用できる。成功後は復旧コードセッションへ切り替え、同じ画面でWindows Hello再登録へ誘導する。

管理者パスキーはmainとdevでRP IDを分離し、mainは`game-fields.com`、devは`dev.game-fields.com`を使う。管理者DBだけでなく端末側の資格情報名前空間も分け、片方での再登録が他方の資格情報を置換・混在させない。

SDK制作者はPortalの`/support`から本人の報告を一覧・閲覧・追記でき、`/support/new`から不具合報告または改善要望を直接作成できる。人間がフォーム内容を確認して送信する操作を承認とし、送信後は同じ会話一覧へ戻る。OAuth MCPのAIは`list_support_threads`と`get_support_thread`で本人の報告だけを参照する。AIによる新規報告は`prepare_support_report`、既存スレッドへの返信は`prepare_support_reply`で7日間の下書きだけを作成し、制作者本人がPortalの各承認画面で内容を確認・修正して送信した場合だけ保存される。AIだけで新規報告または返信を直接投稿するtoolは提供しない。

報告への運営返信は、確認済みの復旧用メールがある送信者へ通知する。メールは会話の正本にせず、返信本文、該当スレッドを開くSDK Portal導線、別のGPTチャットへ貼り付ける報告IDだけを載せる。GPTが報告IDだけを受け取ったときに`get_support_thread`を呼ぶ規則と、最新返信までの要約、返信は`prepare_support_reply`の下書きだけ、Portalで人間が承認するまで未投稿、コード変更は確認後という進行規則はMCPサーバーが取得結果とともに返す。新規報告と報告者の追記は、公開問い合わせと同じ管理者購読先へ通知する。AI下書きの承認投稿も新しい追記メッセージ単位で通知し、以前のスレッド通知済み状態だけを理由に省略しない。メール未登録・未確認・配送失敗でもPortalの会話履歴は保持し、管理画面に配送状態を表示する。

### SDKアプリの昇格と復元

devとmainの採用済みSDKアプリ情報は環境別DBに分離する。管理画面には次の独立した経路がある。

- `SDK-dev → dev`／`SDK → main`: 外部提出candidateを対応環境へ採用
- `dev app → main app`: devで検証済みの固定revisionをアプリ単位でmainへ新規登録または更新
- `develop → main`: 本体Git branch全体のfast-forward

アプリ更新時はmainのゲームID・URL・公開設定を維持する。devとmainのpackage Gitは別リポジトリなので、昇格はdevの固定commitからpackage全ファイルを読み、3つのhashとmanifestを再検証してmain package Gitへ新しいcommitとして保存する。本番Previewでそのcommitのmanifestを起動確認してから`sdk_app_releases`の現在版を切り替える。`source_revision`はdevの元commit、`revision`はmainの実体commitを示す。

各更新前の版は`sdk_app_releases`へ追加専用履歴として残り、管理画面から過去版を選んでアプリ単位で復元できる。migration 006で元dev SHAと本番実行SHAが同じままbackfillされた旧Releaseは未移送と判定し、同じdev版でも修復昇格を許可する。dev由来の過去版は元commitからpackage実体を再移送する。復元自体も新しい`rollback`リリースとして記録し、本体や他アプリ、既存Roomは巻き戻さない。

採用済みSDKゲームのAppSetとmanifestは不変のまま保持し、公開後に調整する表示名と広場カード画像は`config/sdk-game-presentations.ts`で管理する。現行の`ai-word-guess`は公開名「コトバに迫れ」と専用カード画像を使用する。

SDK Portalはpackage client／server grantをEd25519で署名する。portable server grantは隔離Previewが固定した公開鍵だけでローカル検証し、Portalの検証APIやcross-project共通秘密値へ依存しない。ブラウザ入口は60秒のclient交換grantをURL fragmentへ渡し、fragmentを履歴から即時消去してform POSTする。client grantはページrender時に固定せず、Room参加後にゲームiframeが実際にnavigateする直前の同一origin認証routeで固定revision向けに再発行する。Previewはgrant検証後のPOST応答で直接HTML骨格を返し、Cookieや303遷移を使わない。JS、CSS、画像、font、mediaとPlatform bridgeは外部assetのまま、同一source kind・制作者・ゲーム・固定revision・正規化済みasset path・期限へ限定したHMAC URLで取得する。Preview側の秘密値はこのpath単位asset tokenだけに使用する。

2026-07-27の段階移行中は、developの発行器はpath単位v2だけを発行し、
共有verifierだけが旧revision単位v1とv2を一時的に受理する。旧v1の最長有効期間と
実Network確認が完了するまでの互換層であり、恒久契約ではない。退役条件とmainでの
配備順は`KNOWN_ISSUES.md`を正本とする。

SDK作品とdev採用アプリの承認・却下・復元は5〜500文字の判断理由を必須とし、
対象revision・3種のpackage hash・実行管理者・日時を`sdk_release_decisions`へ
追加専用で保存する。採用・復元では現在版更新、新release、決定履歴を一つの
transactionで確定し、途中失敗時に採用ポインタだけを残さない。却下は対象版を
削除せず、同じrevisionへの運営判断として履歴化する。

採用済みSDKゲームのAppSetとmanifestは不変のまま保持し、公開後に調整する表示名と広場カード画像は`config/sdk-game-presentations.ts`で管理する。現行の`ai-word-guess`は公開名「コトバに迫れ」と専用カード画像を使用する。

正式PreviewのRoom作成は、SDK Portalが発行する短命なserver grantを使って
SDK Previewのportable serverを呼ぶ。Portalの`/api/health`はDB schemaに加えて、
対応Previewとの署名・環境scope一致を固定probeで確認する。実行時はネットワーク例外と
408／502／503／504だけを1回再試行し、401／403の認証不整合は再試行で隠さず
`GAME_SDK_REMOTE_RUNNER_AUTH_FAILED`として区別する。

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

ホスト用の共通デバッグウィンドウでは、ダミー参加者、読取専用の閲覧視点、playing中のダミー操作対象、安全な主要状態進行、時間切れ・切断・入力拒否の再現、自動進行、リプレイ記録、ゲーム中断などを扱う。閲覧視点と操作対象は別の状態であり、ダミー代理操作はゲーム固有Commandだけを通常のDomainへ通す。`room/*`共通Commandの代理実行とゲーム固有stateのphase文字列の直接書換えは許可しない。

PCでは移動・サイズ変更・最小化が可能で、外側を押すと操作を消費せず最小化する。小画面では画面内に固定する。

利用権限は確認済みメールと管理画面の登録、または管理者による個別付与で判定する。プレイヤー自身による権限付与はできない。

## オンラインルーム通信

全オンラインゲームは `lib/online-room-api-client.ts` とゲーム固有の型付きアダプターを利用する。

表示中タブの同期とタブ間更新は `app/hooks/use-online-room-polling.ts` を利用する。

Previewとローカル開発ではrevision通知だけをWebSocketで受け、実データは権限に応じたHTTP読取で再取得する。切断時はポーリングへ戻る。本番では明示的に有効化しない限りWebSocketを使用しない。

SDK採用ゲームは `@game-fields/game-sdk/client-runtime` を利用する。SDKクライアントはactor identityを送らず、署名付きプレイヤーセッションを正本とする。

正式Package Shellはwatcher・HTTP Command・timerの応答をrevision順に統合し、遅着した応答で表示を巻き戻さない。Roomのactive索引は、参加者が結果後に別Roomへ移った場合に旧Roomの再戦で上書きしない。非参加者は参加前のlobby View以外を取得・操作できず、無効化されたmoduleのCommandとPlatform resourceもサーバー境界で拒否する。DEBUG権限とダミー属性は署名済みセッション・保存Room・module profileからPlatformが最終確定し、固定済みの旧Packageが返す表示値へ依存しない。結果Roomの解散前にはresult outboxを完了し、戦績・rating・playbackを失う状態ではRoomを削除しない。

## 広告枠の現状

`app/components/GameAdSlot.tsx` にプロバイダー非依存の枠がある。広告表示は初期状態で無効。

`NEXT_PUBLIC_GAME_ADS_MODE=preview` は予約レイアウトの確認にのみ使用する。現時点で本番広告配信は有効化しない。

## 語彙データ

たほいや用候補生成では、JMdict/EDICT、MeSH、Getty Vocabularies、国立国会図書館などを参照元として利用する。保存する説明はゲーム向けの短い言い換えとし、辞書本文を転載しない。

候補生成はGitHub Actionsの `Generate Tahoiya candidate catalog` でゲーム進行とは分離して実行する。候補は `data/tahoiya-candidates.json` に追加し、デプロイ済みアプリは未登録レコードだけをRedisへ取り込む。

生成用GitHub Actionsでは `OPENAI_API_KEY` をRepository Secretに設定する。任意の `TAHOIYA_GENERATOR_MODEL` でモデルを指定できる。

## パスワード再設定とメール

プレイヤーは確認済みの復旧用メールを登録できる。登録・変更は確認リンクを開いた時点で確定する。確認メールを再送するときは新しいメールの配送成功後に以前のリンクを無効化し、配送失敗時は以前届いた有効なリンクを維持する。パスワード再設定メールの配送に失敗した場合は、その失敗した試行が作った60秒制限と未配送トークンだけを解除して再試行できる。パスワード変更には署名済みセッションと現在のパスワードが必要。

関連するサーバー側環境変数:

- `SHARED_RESEND_API_KEY`（移行互換: `RESEND_API_KEY`）
- `EMAIL_FROM`（任意）
- `APP_BASE_URL`

`game-fields.com` をResendで検証し、APIキーをブラウザーへ公開しない。

お問い合わせ保存と運用通知は別結果として構造化ログへ記録する。保存成功後に通知メールだけが失敗した場合も、問い合わせ自体は保持しつつ`contact.notification`の安全なエラーコードから設定不良を追跡できる。

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
