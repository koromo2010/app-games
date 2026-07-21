# app-games 開発引き継ぎ

> 新規ゲームは `config/game-registry.json` を正本として登録し、`docs/NEW_GAME_CHECKLIST.md` に従う。`npm run lint` はゲーム共通要件の自動監査も実行する。
>
> 資料を読む順番や作業別の参照先は `docs/README.md` を入口にする。この文書は「現在の開発状態と共通仕様」、`docs/CONTAINER_ARCHITECTURE.md` は「将来案」である。

最終更新: 2026-07-21

## アカウント言語と言語依存ルーム

- `lib/app-locale.ts` をアカウント／UI言語の登録先とする。言語がない旧アカウント・旧セッション・旧ルームは `ja` として扱う。
- `lib/game-language.ts` を言語依存ゲームのサーバーポリシーとする。将来の言語は、各ゲームの単語・お題・コンテンツ供給元が対応した後で `gameContentLocales` に追加する。
- 言語依存ゲームはワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、コードインターセプト。保存Roomの `contentLocale` は認証済みアカウントから設定し、リクエストJSONは信用しない。
- 部屋一覧・作成・招待コード参加・観戦はアカウント言語をサーバーで検査する。大富豪など言語非依存ゲームは異なる言語設定の参加者が混在できる。
- 言語変更はマイページだけに置く。言語依存ゲームの部屋へ参加中は `/api/player-session` が `PLAYER_LOCALE_ACTIVE_ROOM` で変更を拒否する。
- Postgres `player_accounts.locale`、Redisプレイヤーセッション、ブラウザセッションは同じ値を持つ。Postgresの旧行はスキーマ更新時に `ja` が入る。
- 共通UI辞書は `lib/app-i18n.ts`、クライアントの現在言語は `AppLocaleProvider` を正本とする。プレイヤーセッション保存時のイベントで `<html lang>` と表示を同期する。中国語などを追加するときは `app-locale.ts` と同じ辞書キーの言語辞書を追加する。
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
| 共通結果操作 | `app/components/RoomResultActions.tsx` |
| 共通時間制限 | `lib/game-room-config.ts`, `app/components/RoomTimeLimitControl.tsx` |
| 共通デバッグ認証 | `lib/debug-access.ts`, `app/components/DebugModeButton.tsx`, `app/api/debug-auth/route.ts`, `app/users/me/UserDashboard.tsx` |
| ゲーム公開範囲 | `config/game-registry.json` の `private`, `lib/game-access.ts`, `lib/private-game-access.ts`, `app/api/private-game-access/route.ts` |
| ゲーム登録・自動監査 | `config/game-registry.json`, `scripts/check-game-standards.mjs`, `docs/NEW_GAME_CHECKLIST.md` |
| 共通戦績・マイページ | `lib/player-stats-store.ts`, `app/api/player-stats/route.ts`, `app/users/me/UserDashboard.tsx` |
| ログイン後の部屋復元・広場の復帰一覧 | `app/hooks/use-online-game-session-restore.ts`, `app/api/player-active-rooms/route.ts`, `lib/player-active-room-summary.ts`, `app/games/use-lobby-room-data.ts` |
| 実プレイ時間統計 | `lib/game-duration-statistics.ts`, `lib/game-duration-store.ts`, `app/api/game-duration/route.ts`, `app/games/page.tsx` |
| 全ゲーム対戦プレイバック | `lib/game-replay-store.ts`, `app/api/player-replays/route.ts`, `app/components/GameReplayPanel.tsx`, `docs/GAME_REPLAYS.md` |
| アカウント・メール復旧 | `lib/player-account-store.ts`, `lib/player-password-reset.ts`, `lib/email.ts`, `app/api/player-account/route.ts`, `app/api/player-password-reset/route.ts`, `app/reset-password` |
| ワードウルフ | `app/wordwolf`, `app/api/wordwolf`, `lib/wordwolf-room-store.ts` |
| たほい屋 | `app/tahoiya/TahoiyaGame.tsx`, `app/api/tahoiya`, `lib/tahoiya-room-store.ts`, `lib/tahoiya-types.ts` |
| ワードスケール | `app/word-scale`, `app/hodoai-talk/HodoaiTalkGame.tsx`, `app/api/hodoai/rooms`, `lib/hodoai-room-store.ts` |
| ワードソナー | `app/kotoba-senpuku`, `app/api/kotoba-senpuku/rooms`, `lib/kotoba-senpuku-room-store.ts`, `lib/kotoba-senpuku.ts`（公開ゲーム。ログイン必須、非公開アクセスキー不要） |
| コードインターセプト | `app/games/code-intercept`, `app/code-intercept`, `app/api/code-intercept/rooms`, `lib/code-intercept-room-store.ts`, `lib/code-intercept.ts`（非公開チーム対抗試作） |
| キャンバス | `app/canvas/CanvasGame.tsx`, `app/canvas/canvas-room-api-client.ts`, `app/canvas/canvas-lobby-board-api-client.ts`, `app/canvas/use-canvas-sync.ts`, `app/canvas/use-canvas-stroke-queue.ts`, `lib/canvas-sync-policy.ts`, `app/components/DrawingCanvas.tsx`, `lib/drawing-canvas.ts`（非公開の描画UI試作。共同部屋・広場のHTTP通信、同期時計、ポインター描画送信は画面から分離。GETはETag、途中線は間引き。広場は初回取得後、キャンバス操作から30秒だけ同期し、共同部屋は継続同期） |
| たほい屋の問題再利用 | `lib/tahoiya-topic-catalog.ts`, `app/api/tahoiya/topic/route.ts` |
| お題候補DB・経験履歴の目標設計 | `docs/TOPIC_HISTORY_DATABASE.md` |

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
- `NEXT_PUBLIC_GAME_ADS_MODE`（任意。既定`off`。`preview`は広告予定位置のレイアウト確認専用。`live`は同意管理・配信adapter・CSP・ポリシー審査完了後だけ使用）
- 既存の `KV_*`, `REDIS_URL` も環境に設定されている場合がある

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

アカウント作成時のメール登録は任意。既存アカウントはログイン後、現在のパスワードを再入力してメールを追加・変更できる。メールアドレスそのものはクライアントの保存セッションへ含めず、登録有無だけを保持する。

再設定リンクは1時間有効で、一度使うとRedisから削除される。同じメールアドレスからの発行は60秒に1回まで。発行APIは、登録の有無にかかわらず同じ成功応答を返す。

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

登録済みオンラインゲームの部屋取得・active room復帰・一覧・POST/PATCH/DELETEは `lib/online-room-api-client.ts` を土台に、各ゲームの `*-room-api-client.ts` へ型付きで集約する。画面から部屋APIを直接 `fetch` しない。表示中の同期、タブ復帰時の即時更新、必要なゲームのlocalStorage cross-tab更新は `app/hooks/use-online-room-polling.ts` を使う。WebSocket購読中は更新通知のたびに部屋GETを1回行い、通常ポーリングを停止して45秒ごとの整合確認だけを残す。WebSocketが有効な環境での切断・エラー時は最大2秒間隔のポーリングへ即時フォールバックし、1〜30秒の指数バックオフで再接続を続ける。WebSocketが無効な環境では短い同期フェーズ1秒、進行中3秒、ロビー・結果5秒を標準とし、取得失敗時は最大30秒まで間隔を延ばす。Productionでは明示設定がない限りWebSocketを有効にしない。部屋GETは署名済みCookieから `requireAuthenticatedPlayerId` で本人IDを検証し、保存済み部屋の参加者と照合する。ポーリングのたびにプレイヤープロフィールをRedisから再取得しない。更新系は引き続き `requireAuthenticatedPlayer` を使い、最新プロフィールとアカウント存在確認を維持する。共同キャンバスは操作感を保つため、表示中の部屋500ms・広場2秒とし、通常ゲームと同様に非表示タブでは通信を停止して復帰時に即時同期する。

共通観戦モードは `/spectate/[game]/[code]` と `/api/online-room-spectators` を使う。既存部屋は観戦禁止が初期値で、ホストだけがゲームメニューの「観戦・共有設定」から許可できる。非参加者はログイン済みアカウントと、合言葉設定時は合言葉を使って、ゲーム・部屋・本人・部屋作成時刻へ署名されたHttpOnly grantを取得する。観戦者はRoomの参加者、手番、戦績、active room索引へ入らない。観戦レスポンスは保存Roomをspreadせず `lib/online-room-spectator.ts` のゲーム別許可リストだけから作り、実名・内部ID・秘密語・役職・手札・暗号・投票先・チーム内相談を返さない。ワードソナーは未脱落者の伏字も文字数推測につながるため返さない。設定変更はWebSocketのrevision通知を再利用し、接続時は45秒整合確認、切断時は通常フォールバックで追従する。

API直叩き対策では、全オンラインRoom APIのGETをCookie本人と保存Room参加者で照合し、PATCH actionのactorIdを本文値にかかわらずCookie本人で上書きする。DELETEもCookie本人をhost検証へ渡す。デバッグ代理操作はデバッグ権限に加えて保存済み参加者だけを対象とする。`tests/online-room-route-auth.test.ts` を回帰契約とする。

書き込み契約は `POST = 新規作成`、`PATCH = 既存部屋へのCommand`、`DELETE = 解散`。既存部屋をRoom全体POSTで更新しない。UIは変更後Roomを組み立てず、変更意図だけのActionをadapterへ渡す。権限・フェーズ・入力正規化・revision競合は保存済みRoomを読むサーバー側で処理する。`npm run lint` は全オンラインゲームの型付きadapter、PATCH route、UI直fetch、旧`setAndSaveRoom`の再混入を検査する。

結果の表示順、外部共有文、プレイバック保存で同じ並べ替えを複製しない。共通契約は `lib/game-result-presentation.ts`、ワードスケールの基準実装は `hodoaiResultPresentation`。結果の向きを変える場合はプロジェクターと契約テストを変更し、3つの出力先は同じ結果行を参照させる。

将来の広告位置は `app/components/GameAdSlot.tsx` を共通入口とする。配置対象はゲーム一覧、入室前、部屋ロビー、結果だけで、進行中とデバッグ部屋には表示しない。既定は完全非表示で、`NEXT_PUBLIC_GAME_ADS_MODE=preview` のときだけ予約寸法を表示する。`live`へ進む前に、同意管理、配信事業者adapter、CSP、年齢・地域・コンテンツに応じた広告ポリシー、広告ブロック時のレイアウトを共通コンポーネント内で実装し、ゲーム画面から事業者SDKを直接呼ばない。

- 部屋設定は全クライアントへ表示する。
- 各ゲームの `GameRulesDialog` は、未経験者や若い利用者が単独で読んで遊べる平易な説明を正本とする。目的、準備、ラウンド進行、得点、勝敗・終了、時間切れを見出しで分け、得点には具体的な計算例を入れる。得点や勝敗が未実装の試作も、その事実を省略せず明記する。
- 設定操作はロビーにいるホストだけ。
- 設定デフォルトはプレイヤーごとにRedisへ保存し、localStorageをフォールバックにする。
- 1プレイヤー1アクティブ部屋。新しい部屋作成時は古いホスト部屋を解散する。
- 広場の復帰表示はゲーム別Room APIをブラウザから順次呼ばず、認証済みの共通 `/api/player-active-rooms` 1本から部屋コード・phase・参加者概要・更新時刻だけを受け取る。active roomコード7件は個別GETではなく1回のMGETで確認し、該当する部屋本体だけを読む。秘密語・手札・投稿・合言葉などRoom本文は返さない。`scripts/check-game-standards.mjs` は全オンラインゲームのloader登録を検査する。
- コードインターセプト、ワードスケール、ワードソナー、ワードアウト、ノーザンブランチの入室画面は `useOnlineGameSessionRestore` を使う。保存済みのローカルセッションで画面枠を先に表示し、サーバーのアカウント確認とアクティブ部屋復元をバックグラウンドで行う。復元中は新規作成・参加欄を `inert` にして、別部屋操作との競合を防ぐ。アカウントCookieとRoomの正本は引き続きサーバーで検証する。
- 参加人数のサーバー安全上限は `onlineRoomPlayerLimits` を正本とし、ワードウルフ20人、たほい屋8人、ノーザンブランチ4人、ワードスケール50人、ワードソナー20人、ワードアウト6人、コードインターセプト12人。満室は一覧から除外し、直接参加も409で拒否する。復元時も上限を超えた配列を切り詰め、デバッグ用ダミー追加にも同じ上限を適用する。
- 投稿・投票がそろったらサーバー側で自動遷移する。
- ルームGETは認証済み閲覧者向けJSONからETagを作り、クライアントは `If-None-Match` を送る。未変更時は304で本文転送とJSON再解析を省き、同じURLへの重複取得はクライアント内で直列化する。実装は `lib/conditional-json.ts` と `lib/conditional-json-client.ts`。WebSocketはゲーム名・部屋コード・revision・timestampだけの更新通知を運び、Redisの部屋状態や秘密情報は載せない。DEBUGメニューでWS／ポーリング／再接続の状態、部屋GET回数、通知受信数を確認できる。
- 部屋作成時のRoom本体と一覧索引は1回のLua commandで原子的に保存する。更新時に一覧へ毎回 `SADD` しない。参加者別active room索引のTTL更新も人数分の個別SETではなく、RoomのCAS保存と同じLua commandへまとめる。
- 参加可能な部屋一覧は全件 `SMEMBERS` + 個別GETを行わず、`SSCAN` で1ページ24件ずつ取得し、部屋本体は1回の `MGET` にまとめる。レスポンスの `nextCursor` を次の `cursor` クエリへ渡せる。部屋コードを指定した直接参加はページ外でも利用できる。
- 自動遷移しなかった場合の手動ボタンはホスト向けに残すが、必要条件を満たすまで表示しない。
- オンライン部屋の最終結果画面では共通 `RoomResultActions` と `useRoomResultReturnGate` を使う。「部屋に戻る」を先頭・全幅の主導線とし、ホストがサーバー上の部屋をロビーへ戻した後に各クライアントで有効化する。「広場へ戻る」は確認付きの副導線とする。既存参加者の席は保持されるため満員でも復帰できるが、クリック時に最新の部屋と参加資格を再確認する。部屋が解散されても結果画面は強制遷移せず保持し、復帰ボタンを無効化して監視を止める。ホストにだけ「部屋を解散」も表示し、確認後にサーバー側のホスト権限検証を通す。参加枠から実際に外れる「退出」にも共通確認を入れる。各アクションの処理中は共通スピナーと進行中ラベルを表示して二重押しを防ぐ。ゲーム内の途中ラウンド進行はこの個人遷移と分けて扱う。
- 通常の部屋解散はロビーまたはゲーム終了後だけ許可する。各Room Storeは共通 `canDissolveOnlineRoom` を通し、進行中のDELETEをAPI側で409にする。デバッグ中は `DebugModeButton` の「ゲームを中断」でロビーへ戻してから解散する。
- 全ゲームは `config/game-registry.json` の `timeLimit` で時間制限方針を宣言する。通常のゲームは共通プリセットと秒数手入力に対応し、`0` は制限なし。`fields` の保存実装、`expiryToken` のサーバー正本処理、`RoomTimeLimitControl` が欠けると `npm run lint` が失敗する。時間制限付き文字入力は `textInputTimeout.mode: "adopt-entered-text"` と実装の `implementationTokens`、文字入力がなければ `not-applicable` と具体的な理由が必要で、宣言または実装が欠けてもlintを失敗させる。勝敗や開始・終了フェーズを持たない機能だけは `timeLimit` 自体を具体的な理由付きで `not-applicable` にできる。
- 時間制限付き文字入力では、表示上の締切時に入力ルールを満たすローカルの文字を自動送信し、サーバー受付猶予内なら採用する。複数欄は有効な入力を保持して空欄・無効欄だけを補完または既存ペナルティの対象とし、全必須欄が有効なら通常提出として扱う。送信は冪等にし、期限・フェーズ・採否の正本判定はクライアント時刻を信用せずサーバーで行う。新規ゲームには締切直前、部分入力、空欄、重複送信の自動テストを追加する。
- 共通のサーバー受付猶予は標準5秒。`GAME_TIMEOUT_GRACE_MS`（0〜10000ms）でTahoiya・ワードスケール・ワードソナーを調整し、WordWolfは互換用 `WORDWOLF_TIMEOUT_GRACE_MS` を使う。
- ログイン成功時は署名・期限付き・HttpOnly・SameSite=LaxのプレイヤーCookieを発行する。オンラインAPIはリクエスト本文のactor IDではなくCookieから本人を確定する。
- 書き込みAPIは `lib/rate-limit.ts` の共通Redisレート制限を通す。ログイン名・IP・プレイヤーIDはHMAC化したキーだけを保存し、生値をRedisへ残さない。共有回線を考慮してIP枠は広く、プレイヤー／入力名枠を厳しくする。ログイン、パスワード再設定、アクセス認証、画像アップロード、部屋操作、AI生成、プロフィール更新、フィードバックを別枠にし、超過時は `429 RATE_LIMITED` と `Retry-After` を返す。制限用Redisだけが失敗した場合は操作を止めず、`rate-limit.store` 警告を出してfail-openする。
- デバッグ利用資格はマイページで `DEBUG_MODE_PASSWORD` を共有APIへ送って認証し、プレイヤー別Redisフラグへ保存する。資格のあるホストだけ各ゲームのトップバーに `DebugModeButton` が表示され、ゲームAPIもデバッグON・デバッグ専用操作・中断時に資格を再確認する。ゲーム個別のパスワードUIは作らない。
- デバッグのON/OFF・プレイバック記録・進行中断は、トップバーへ個別配置せず `DebugModeButton` のプルダウンへまとめる。中断はゲーム一覧へ移動せず、同じ部屋・参加者・部屋設定を維持し、進行中の秘密情報と提出状態を破棄してゲーム開始前へ戻す。
- オンラインゲームのトップバーは `GameTopBanner` と `GamePlayerMenu` を使う。ログアウトはプレイヤーメニュー内だけに置き、トップバーへ単独配置しない。
- デバッグON中は、成功した操作の時刻・操作者表示名・操作種別・フェーズ遷移・revisionをサーバー正本の行動ログへ最大200件保存し、`DebugModeButton` 内で表示・コピーする。秘密の数字、手札、秘密語、ヒントや投稿本文、合言葉、Cookie、APIキーは記録しない。これは常時出力する構造化運用ログとは別物である。
- 最終結果ではホスト以外も共通 `GameResultShareButton` からプレイログを共有できるようにする。共有先を開く前に実際の共有文と公開URLをプレビューする。ゲーム仕様として投稿本文や参加者名を共有する場合は、本人のデフォルトOFFの同意を入室時に固定保存し、未同意者の名前は匿名ラベルへ置き換える。認証付きURLは共有しない。
- ワード・お題生成があるゲームは、デバッグONのロビーに `DebugWordGenerationTest` を表示する。生成テストはゲームを開始せず、部屋・ラウンド・出題済み履歴を変更しないプレビューAPIとして実行する。
- 新規生成と再利用を切り替えるゲーム（現状はワードウルフ）だけ、デバッグのワード生成テストに「新規ワード生成」フラグを表示する。たほい屋はこの切替を使わず、後述の完成済み再利用→判定済み候補→未判定10語審査という正式フローをそのままプレビューする。
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

現在のモジュール分離は `docs/MODULAR_GAME_ARCHITECTURE.md`、将来のweb・game-server・timer-service・ai-worker・batch-worker構成は `docs/CONTAINER_ARCHITECTURE.md` を正本とする。オンラインゲームでは部屋HTTPクライアントと同期hookをUIから分離済み。ワードウルフはフェーズ時計も分離済み。部屋一覧は `lib/online-room-list.ts`、active-roomの移動・復帰は `lib/player-active-room.ts`、revision CASと新規作成は `lib/online-room-persistence.ts`、共通権限は `lib/online-room-access.ts`、API共通エラーは `lib/online-room-route-errors.ts`、主要5ゲームの解散は `lib/online-room-dissolution.ts` に集約した。登録簿の `moduleBoundaryFiles` をlint時に検査する。

オンラインゲームのroom moduleは、ゲーム別の `*-room-normalizer.ts`（復元・入力正規化）、必要に応じた `*-room-domain.ts`（ラウンド進行・タイムアウト）、`*-room-presentation.ts`（sanitizer・ロビー表示）、`*-room-store.ts`（Redis/application）へ物理分割済み。ワードウルフの特殊な戦績記録付きCASはstoreに維持する。

部屋状態には `revision` を持たせ、Redis内CASで古い保存による巻き戻しを防ぐ。参加・プロフィール・ロビー設定・デバッグ操作・開始・通常の発言・投票・逆転回答・時間切れ遷移はサーバー側Commandで処理し、複数端末から同時に要求されても整合する。レスポンスは認証済み閲覧者向けに整形し、結果前は狼ID・相手ワード・他人の投票を返さない。
締切には標準5秒のサーバー受付猶予を設け、締切直前に端末から送った投稿・投票が通信遅延で時間切れ処理に負けないようにする。`WORDWOLF_TIMEOUT_GRACE_MS`（0〜10000ms）で調整可能。クライアント申告の送信時刻は信用せず、サーバー到着が締切＋猶予以内か、現在のフェーズとrevisionが一致するかで上限を掛ける。
締切計算・受付猶予・再試行時刻・イベントIDは `lib/game-timer` の共通時間管理境界へ集約し、入口は `/api/game-timer/expire` とする。ゲーム固有domainは「期限後に未投稿や未投票をどう扱うか」だけを実装する。将来はこの境界をtimer-serviceコンテナへ移せる。

- `/wordwolf`
- 部屋制、ログイン制、復帰対応、デバッグ時は1人テスト可
- 順番投稿・全員同時投稿、順番ランダム、同時投票、同率・決選投票、狼の逆転回答に対応
- お題はJST同日同語禁止、順序非依存ペアは標準30日間禁止。固有名詞は語だけで類推できない距離へ調整済み
- OpenAI OFF時はGemini、Groq、ローカルの順。逆転判定は無料APIまたはfuzzy/feedbackを使用
- 一般単語の新RAGは共通DBから難易度別に起点語3件を抽出し、1回のLLMで3件を独立審査・相方生成する。生成時の距離とフィードバック集計後の距離を別カラムで保持する。DB migration、旧197,040語の取込、Preview確認は `docs/WORDWOLF_RAG.md` を正本とする
- 旧197,040語の初回移行中だけ、develop Previewの管理画面に再開可能な取込パネルを置く。`LEGACY_WORD_DATABASE_URL`（未設定時は開発用 `APP_DATABASE_URL`）の `shared_word_catalog` だけを読み、`VOCABULARY_ADMIN_DATABASE_URL`（共通DB）へ1,000件ずつupsertする。旧カタログが開発DBにない場合は読取専用URLをdevelop Previewだけへ一時設定する。Productionでは実行不能で、完了・件数照合後に一時API、パネル、環境変数、読取ロールを撤去する

詳細な挙動を変える前に、`lib/wordwolf-command-domain.ts`、`lib/wordwolf-room-normalizer.ts`、`lib/wordwolf-room-presentation.ts`、`lib/wordwolf-room-store.ts` の境界を確認する。

### ワードアウト（非公開オンライン試作・内部ID `nigoichi`）

- `/word-out` は非公開アクセスキーかつログイン済みの利用者向け。表示名は「ワードアウト / WORD OUT」。内部IDは旧データ互換のため `nigoichi` を維持し、旧URL `/nigoichi` は `/word-out` へリダイレクトする。部屋作成前は2〜6人の最大募集人数だけを指定し、A・M・難易度は作成後のロビーで設定する。最大募集人数に達すると新規参加を締め切り、2人以上なら上限未満でも開始できる。部屋一覧、4文字コード、任意の合言葉、アクティブ部屋復帰に対応する。
- 設定はプレイヤー人数P、1人に配るカードA、書く連想語M、場のカードBとし、`P>=2`、`1<=M<=5`、`A>=2M`、`B=P×A+1<=21` をクライアントとサーバーの両方で検証する。場に並ぶカード総数は最大21枚。PまたはM変更時はAの範囲を再計算し、範囲外のAを自動補正する。初期値と旧ルームの補完値はA=2、M=1。Aを増やすことで、より多くの言葉を連想語で伝える高難度設定にできる。
- 各人は自分のA枚を見てM個の連想語を自由に提出する。カードをグループへ分類したり、各連想語と特定カードを対応付けたりする必要はない。全員の提出後に連想語を一斉公開し、余り番号を全員が予想した後、言葉一覧、所有者、手札、連想語、予想、正誤を公開する。
- Redisを正本とし、revision付きCAS、共通TTL、1人1アクティブ部屋、閲覧者別sanitizerを使う。純粋ルールは `lib/nigoichi.ts`、保存データ復元は `lib/nigoichi-room-normalizer.ts`、進行準備は `lib/nigoichi-room-domain.ts`、表示整形は `lib/nigoichi-room-presentation.ts`、保存とCommandは `lib/nigoichi-room-store.ts`、APIは `app/api/nigoichi/rooms/route.ts`、クライアント境界は `app/nigoichi/nigoichi-room-api-client.ts`、画面は `app/nigoichi/NigoichiGame.tsx`。
- デバッグONのホストはダミーを最大6人まで追加し、ダミーの連想語・予想を代行できる。未提出の一括補完、中断、行動ログ、任意のデバッグプレイバック記録に対応する。デバッグ部屋とダミーは通常戦績へ含めない。
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

`lib/tahoiya-topic-catalog.ts` はBad評価語と今回の参加者が経験済みの語を除外する。誰が見たかはプレイヤー別Redis Setへ保存する。難易度判定の正本は `tahoiya_word_screenings`、説明完成後の正本は `tahoiya_topics` / `word_definitions` とする。旧Redis Hashと既存 `active_tahoiya_topics` も再利用対象として残し、管理画面のPreview限定移行からお題と既出履歴を冪等に移す。

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
- デバッグONのホストはロビーで `debug-add-player` によりダミーユーザーを追加できる。ダミーは通常アカウントやアクティブ部屋索引を作らず、デバッグOFF時に部屋から除去する。
- 権利面・人数・詳細ルールは `docs/WORD_SCALE.md`、型と独自お題は `lib/hodoai-talk.ts`、並び順の純粋処理は `lib/hodoai-arrange.ts`、Redis進行は `lib/hodoai-room-store.ts`、APIは `app/api/hodoai/rooms/route.ts`、画面は `app/hodoai-talk/HodoaiTalkGame.tsx`、カードUIは `app/hodoai-talk/WordScaleArrangeBoard.tsx`、縦スケールは `app/hodoai-talk/WordScaleVerticalScale.tsx`、左パネルは `app/hodoai-talk/WordScaleRoomPanel.tsx`。
- ワードソナーは2人以上・人数上限なしの独自オンライン文字推理ゲーム。探知または秘密語の特定で全文公開されると脱落し、以後の手番を失う。開始前に連続探知のON/OFF、秘密語回答の有無、直接回答語をログへ表示するかを選択できる。公開文字は語順どおり左詰めで文字数を隠し、最後の1人を勝者とする。同時脱落時は最短語を優先し、同長なら同率勝利。各ラウンドの勝者は3点、ほかは0点で、同率勝者は全員3点。複数ラウンドでは累計する。秘密語は文字数上限なしのひらがなのみで、カタカナ等は変換せず再入力を求める。
- ワードソナーはラウンド数、秘密語入力時間、手番時間、対戦ルールをプレイヤー別デフォルトとして保存する。デバッグONホストはダミー追加、秘密語補完、全秘密語表示、手番代行・自動実行ができる。詳細は `docs/KOTOBA_SENPUKU.md`。
