# ゲームのモジュール境界

物理コンテナへ切り出した後の責務と通信構成は `docs/CONTAINER_ARCHITECTURE.md` を参照する。

将来のコンテナ分割は、先に同一Next.jsアプリ内で境界を固定する「モジュラーモノリス」方式で進める。画面をそのまま別サービスへ切り出すのではなく、依存方向を次に限定する。

```text
UI / hooks -> API client -> HTTP route -> application/domain -> storage
                                      \-> AI gateway
```

## 境界

- UI: 描画と入力のみ。`fetch`、Redis、勝敗判定を直接持たない。
- hooks: 時計、購読、画面用状態を担当し、ゲームルールを決定しない。
- API client: URL、HTTP method、レスポンス検証を集約する。
- domain: フェーズ遷移、投票集計、勝敗判定。React、HTTP、Redisへ依存しない純粋関数にする。
- application/API route: 認証、入力検証、競合制御、domainの実行を担当する。
- storage: Redisキーと永続化だけを担当する。
- AI: `lib/game-llm.ts` の共通ゲートウェイを越えて事業者へ直接依存しない。
- timer: `lib/game-timer` が締切・猶予・再試行時刻・一意イベントIDを共通管理する。ゲームdomainは期限後の具体的な状態遷移だけを持つ。

## 全オンラインゲームの共通クライアント境界

- HTTP共通処理: `lib/online-room-api-client.ts`
- 採用済みSDKゲームのbrowser transport: `packages/game-sdk/src/client-runtime.ts`
- 採用済みSDKゲームのrevision watcher: `packages/game-sdk/src/client-realtime.ts`
- 採用済みSDKゲームの汎用HTTP入口・審査登録簿: `app/api/game-sdk/[gameId]/rooms/route.ts`, `lib/game-sdk-online-room-http.ts`, `lib/game-sdk-server-registry.ts`
- 採用済みSDKゲームのRedis Room lifecycle: `lib/game-sdk-platform-room-store.ts`, `lib/game-sdk-platform-adapter.ts`
- 表示中の部屋同期: `app/hooks/use-online-room-polling.ts`
- ログイン画面先行表示と部屋復元: `app/hooks/use-online-game-session-restore.ts`
- 広場の全ゲーム復帰概要: `app/api/player-active-rooms/route.ts`
- Redis部屋一覧・期限切れ索引整理: `lib/online-room-list.ts`
- 1プレイヤー1部屋の確保・移動: `lib/player-active-room.ts`
- storage-neutralなRoom mutation lifecycle: `packages/game-runtime/src/online-room.ts`
- 本体オンラインRoom Store adapter: `lib/online-room-store-runtime.ts`
- revision CAS・新規部屋永続化: `lib/online-room-persistence.ts`
- クライアントの単調revision採用: `lib/online-room-client-state.ts`
- 共通actor権限・ロビー退出判定: `lib/online-room-access.ts`
- 共通デバッグメニュー・ゲーム固有操作・ダミー参加者UI: `app/components/DebugModeButton.tsx`, `app/components/DebugGameTools.tsx`, `app/components/DebugParticipantControls.tsx`
- デバッグ参加者Command・active-room整理: `lib/online-room-debug-participants.ts`
- Room API Routeファクトリ: `lib/online-room-route-factory.ts`
- 共通AI通信状態・トップバナー表示: `lib/ai-activity-client.ts`, `app/components/AiActivityVital.tsx`, `app/components/GameTopBanner.tsx`
- 共通部屋操作表示: `app/components/OnlineRoomLifecycleActions.tsx`, `app/components/RoomResultActions.tsx`
- Room API共通・ゲーム別エラー表: `lib/online-room-route-errors.ts`
- 部屋解散application/storage境界: `lib/online-room-dissolution.ts`
- ワードウルフadapter: `app/wordwolf/wordwolf-room-api-client.ts`
- たほい屋adapter: `app/tahoiya/tahoiya-room-api-client.ts`
- ノーザンブランチadapter: `app/northern-branch/northern-branch-room-api-client.ts`
- ワードスケールadapter: `app/hodoai-talk/hodoai-room-api-client.ts`
- ワードスケールclient構成: `use-hodoai-room-session.ts` が復元・同期、`use-hodoai-room-actions.ts` がCommand、`use-hodoai-view-model.ts` が表示計算、`HodoaiPlayPanels.tsx` と `HodoaiRulesDialog.tsx` が表示を担当する。
- ワードソナーadapter: `app/kotoba-senpuku/kotoba-senpuku-room-api-client.ts`
- ワードアウトadapter（内部IDはnigoichi）: `app/nigoichi/nigoichi-room-api-client.ts`
- 観戦用公開スナップショット: `lib/online-room-spectator.ts`
- 観戦policy・grant・共通API: `lib/online-room-spectator-store.ts`, `lib/online-room-spectator-auth.ts`, `app/api/online-room-spectators/route.ts`

共通クライアントはURL、method、条件付きGET、JSON応答、HTTP status/payload付きエラーまでを担当する。各adapterはゲーム固有のRoom・Action型を付ける。操作・時間切れ・ポーリングの応答は `preferLatestOnlineRoom` を通し、同じ部屋で現在以下のrevisionを画面状態へ戻さない。フェーズ遷移、権限、勝敗、レスポンスの秘密情報除去は従来どおりサーバーdomain/storeの責務で、クライアント共通化へ移さない。

共通 `DebugModeButton` は、デバッグON/OFF、ダミー参加者、プレイバック、中断、行動ログに加えて、ゲーム固有操作を受け取る `gameTools` と、DBを使うゲームだけが明示的に有効化する `wordGenerationTools` を非モーダルの共通画面内ウィンドウへ表示する。ウィンドウ枠と移動・サイズ変更・最小化は `DebugToolWindow`、デバッグ内容は `DebugModeButton` が担当する。通常のフェーズ画面や参加者一覧には操作ボタンを重ねず、必要なら現在の代理操作対象などの状態表示だけを残す。ワード・お題DBを使わないゲームは `wordGenerationTools` を渡さず、生成テストを表示しない。

デバッグ用ダミー参加者は、追加・一覧・削除の表示を共通 `DebugParticipantControls` が担当する。ゲームのController／Layoutは、閲覧者向けRoomから抽出したダミー一覧と型付きCommand関数だけを渡す。サーバー側では`lib/online-room-debug-participants.ts`がホスト・ロビー・DEBUG中・削除対象の認可、IDと表示名の生成、追加、個別削除、DEBUG OFF時の一括整理、ロビー復帰状態、active-room索引の除外と旧索引解放を担う。各Storeには人数上限、Player生成、参加者変更後のゲーム固有補正、永続化だけを残し、共通UIをセキュリティ境界にしない。

たほい屋は`lib/tahoiya-debug-participants.ts`を共通Commandの補正hookとして使う。参加者配列の変更に合わせて回答者、得点、偽説明、投票、時間切れを現在の参加者へ正規化する。ほかのゲームも、並べ替え役、人数依存設定、代理操作対象、チーム所属など必要な補正だけを同じhookへ渡す。

AI APIを呼ぶ可能性があるクライアント操作は`aiActivityFetch`または`withAiActivity`を通し、共通ストアが同時処理数を管理する。`GameTopBanner`内の`AiActivityVital`だけが通信状態を表示し、各ゲームLayoutへ発光状態を複製しない。これは待機・利用量発生可能性の表示であり、課金額やサーバー側認可の正本にはしない。

オンライン部屋の操作表示は`OnlineRoomLifecycleActions`へ集約し、ゲーム側は現在の表示面を`lobby / playing / result`で渡す。ロビーではホストの解散だけ、プレイ中は何も表示せず、結果では内部の`RoomResultActions`が復帰・広場・解散を提供する。サーバー側の解散可否は従来どおり`canDissolveOnlineRoom`と各Storeを正本とする。

観戦は保存Roomや参加者向けsanitizerを流用せず、ゲーム別許可リストから小さな公開スナップショットを組み立てる。観戦者をRoomのplayers、手番、戦績、active room索引へ追加しない。公開可否はRoom外のRedis policyへ部屋作成時刻付きで保存し、コード再利用時の設定継承を防ぐ。新しいオンラインゲームは観戦registryへloaderと公開項目を明示追加し、秘密フィールド非公開テストを通す。

ゲーム入口は、ローカルに保存された表示用セッションから画面枠を先に描画できる。ただしサーバー認証とアクティブ部屋復元が終わるまでは入口操作を無効にし、Room APIのactor判定はCookieを正本とする。広場はゲーム別Room APIをブラウザから扇状に呼ばず、共通の復帰概要APIで各storeのactive-room loaderを並列実行し、安全な概要だけを返す。

オンライン部屋の解散は、ゲーム別storeがエラーコードとRedisキーをadapterとして渡し、`lib/online-room-dissolution.ts` がホスト本人確認、`room-dissolve-policy` によるフェーズ検証、部屋本体と索引の削除、参加者全員のactive room解除を担当する。進行中の退出可否や終了フェーズの作り方はゲーム固有storeに残す。

公開ロビーの部屋一覧は `lib/online-room-list.ts` がSSCAN/MGET、期限切れ部屋の整理、実体がない索引の削除までを担当する。参加可能判定、公開用Choiceへの変換、表示順はゲーム固有storeに残す。

部屋作成・参加前のactive room確保は `lib/player-active-room.ts` が担当する。現在の別室から移動可能かを共通解散ポリシーで判定し、終了済みの索引解除と新しい部屋コードのCAS確保を一続きのapplication境界として扱う。参加人数、合言葉、フェーズなどの入室条件はゲーム固有storeで検証する。

storage-neutralなrevision更新、競合時の最大6回再適用、保存前正規化、保存後hookは非公開 `@game-fields/game-runtime` の `online-room.ts` を正本とする。本体側の `lib/online-room-store-runtime.ts` がRedis CAS、TTL、一覧、1人1active room、新規作成、解散、Realtime、戦績・リプレイhookを注入し、登録済みオンラインゲーム8本のStoreは同じRuntimeを利用する。Redis Luaと索引の低水準処理は `lib/online-room-persistence.ts`、`lib/player-active-room.ts`、`lib/online-room-list.ts`、`lib/online-room-dissolution.ts` に維持する。ゲーム固有StoreにはCommand認可、進行、得点、秘匿、参加者変更後の補正、時間切れreconcileだけを残す。

登録済みオンラインゲーム8本のRoom Routeは `lib/online-room-route-factory.ts` を共通入口とする。同ファクトリが公開範囲検査、署名Cookie認証、GETの部屋・active room・一覧分岐、参加者照合、言語検査、入力actor・参加者情報の上書き、デバッグ資格、更新レート制限、Telemetry、DELETEの本人確認を所有する。ゲーム側は `load / loadActive / list / create / apply / delete / deleteHosted / sanitize` とTelemetry用の安全な状態項目だけを渡す。ゲーム固有エラーは `createOnlineRoomErrorResponder` の表で宣言し、認証・保存設定・Redis一時障害は共通変換を先に適用する。

採用済みSDKゲームは`/api/game-sdk/[gameId]/rooms`を共通入口とし、公開`createGameSdkHttpClientRuntime`から作成・閲覧・revision付きCommand・active room・公開一覧・個別／host一括解散を行う。Client payloadへactor identityを含めず、Routeが署名済みプレイヤーCookieから本人を確定して`createAuthenticatedGameSdkPlatformAdapter`へ注入する。`lib/game-sdk-platform-room-store.ts`がSDKごとのRedis TTL、索引、1人1active room、ロビー／結果後の解散、revision通知を所有する。`watchRoom`は`online-room-events`へ`game = sdk:<game-id>`で購読し、秘密情報を含まないrevision通知を受けるたびにHTTPの閲覧者別Viewを再取得する。server moduleは`lib/game-sdk-server-registry.ts`へ静的に登録した審査済みpackageだけを対象とし、制作者Portalのmetadataや未審査Previewをimport・実行しない。現時点の`wordwolf-sdk`登録はdevelop限定である。

大富豪のGET時ダミー手番復旧は `lib/daifugo-room-store.ts` のreconcile処理へ置き、Routeへ進行ルールを戻さない。たほい屋のAIお題生成を伴う `start-round` は `app/api/tahoiya/rooms/application.ts` に分離し、Routeはほかのゲームと同じファクトリ契約を保つ。

ワードスケールは物理分割の基準実装として、保存データ復元を `lib/hodoai-room-normalizer.ts`、純粋なラウンド進行とタイムアウト遷移を `lib/hodoai-room-domain.ts`、閲覧者別sanitizerとロビーChoiceを `lib/hodoai-room-presentation.ts` に分離する。`lib/hodoai-room-store.ts` はapplication処理とCommand orchestrationを担当し、Redis lifecycleは共通Room Runtimeへ委譲する。

たほい屋も同じ境界で、`lib/tahoiya-room-normalizer.ts`、`lib/tahoiya-room-domain.ts`、`lib/tahoiya-room-presentation.ts`、`lib/tahoiya-room-store.ts` に分離する。得点、投票完了、時間切れ遷移はdomainに置き、AIお題生成を含むCommand orchestrationとRedis操作はstoreに残す。

ワードソナーも、保存データ復元を `lib/kotoba-senpuku-room-normalizer.ts`、対戦・得点・タイムアウト遷移を `lib/kotoba-senpuku-room-domain.ts`、閲覧者別sanitizerとロビーChoiceを `lib/kotoba-senpuku-room-presentation.ts` に分離する。storeはRedis/application処理とCommand orchestrationを担当する。

コードインターセプトも、保存データ復元を `lib/code-intercept-room-normalizer.ts`、ラウンド準備と進行判定を `lib/code-intercept-room-domain.ts`、閲覧者別sanitizerとロビーChoiceを `lib/code-intercept-room-presentation.ts` に分離する。storeは権限を含むCommand orchestrationとチーム補正を担当し、CASと保存後処理は共通Room Runtimeへ委譲する。

ワードアウト（内部ID `nigoichi`）も、保存データ復元と旧形式移行を `lib/nigoichi-room-normalizer.ts`、配札・再戦準備・参加人数に応じた設定補正を `lib/nigoichi-room-domain.ts`、閲覧者別sanitizerとロビーChoiceを `lib/nigoichi-room-presentation.ts` に分離する。storeはCommand orchestrationと永続化を担当する。

ノーザンブランチはゲーム進行を既存の `lib/northern-branch-game.ts` に維持し、保存データ復元を `lib/northern-branch-room-normalizer.ts`、手札秘匿とロビーChoiceを `lib/northern-branch-room-presentation.ts` に分離する。storeはactor権限、Command orchestration、永続化を担当する。

部屋APIの書き込み契約は全ゲームで、`POST = 新規部屋作成`、`PATCH = 既存部屋へのCommand`、`DELETE = 解散` に固定する。既存コードへのPOSTは409で拒否し、UIは作成後のRoom全体を送信しない。参加、プロフィール、ロビー設定、デバッグ操作、次ラウンド、ゲーム進行は、変更意図だけを表すゲーム固有ActionとしてPATCHする。サーバーは認証Cookieからactorを確定し、保存済みRoomへ権限・フェーズ・対象・revisionを検証して適用する。

結果データは `lib/game-result-presentation.ts` で保存順から表示順へ一度だけ射影し、画面・共有・プレイバックで同じ行を使う。ワードスケールは `hodoaiResultPresentation` がこの基準実装で、内部の0→120保存順を外部の120→0表示順へ変換する。

## ワードウルフの移行状況

- domain: `app/wordwolf/game-flow.ts`
- API client: `app/wordwolf/wordwolf-room-api-client.ts`
- local/remote room adapter: `app/wordwolf/wordwolf-room-adapter.ts`
- room entry UI: `app/wordwolf/WordWolfEntryPanel.tsx`
- top banner/profile shell: `app/wordwolf/WordWolfHeader.tsx`
- lobby settings UI: `app/wordwolf/WordWolfLobbySettings.tsx`
- phase/status UI: `app/wordwolf/WordWolfPhaseStatus.tsx`
- player profile UI: `app/wordwolf/WordWolfPlayerProfile.tsx`
- result UI: `app/wordwolf/WordWolfResultPanel.tsx`
- room/player sidebar UI: `app/wordwolf/WordWolfRoomSidebar.tsx`
- rules dialog UI: `app/wordwolf/WordWolfRulesDialog.tsx`
- phase clock: `app/wordwolf/use-wordwolf-phase-clock.ts`
- lobby actions: `app/wordwolf/use-wordwolf-lobby-actions.ts`
- gameplay actions and expiry: `app/wordwolf/use-wordwolf-game-actions.ts`
- player profile behavior: `app/wordwolf/use-wordwolf-player-profile.ts`
- room lifecycle behavior: `app/wordwolf/use-wordwolf-room-lifecycle.ts`
- session restore and room polling: `app/wordwolf/use-wordwolf-room-session.ts`
- derived presentation model: `app/wordwolf/use-wordwolf-view-model.ts`
- gameplay command scope/idempotence: `lib/wordwolf-command-scope.ts`
- storage: `lib/wordwolf-room-store.ts`
- saved room normalizer: `lib/wordwolf-room-normalizer.ts`
- viewer presentation: `lib/wordwolf-room-presentation.ts`
- timer policy/event: `lib/game-timer/policy.ts`, `lib/game-timer/event.ts`
- timer ingress: `app/api/game-timer/expire/route.ts`

第一段階では部屋API通信と時計を巨大な画面コンポーネントから分離した。その後、部屋APIと表示中ポーリングの共通土台を全8オンラインゲームへ適用した。ブラウザ内の旧ローカル部屋互換、部屋設定default、remote優先・local fallback、空Room生成は `app/wordwolf/wordwolf-room-adapter.ts` に分離した。部屋には単調増加する `revision` を持たせ、Redis内CASで古い保存を409拒否する。参加・ロビー設定・ゲーム開始・通常の発言・投票・最終回答・時間切れは `/api/wordwolf/commands` または専用部屋Commandへ移行済みで、`lib/wordwolf-command-domain.ts` と各Room Storeが検証と状態遷移を担当する。開始・発言・投票・逆転回答は送信時のゲーム番号・フェーズ・ラウンド・開始時刻をscopeとして送り、同じフェーズ内の別操作とCAS競合した場合だけ最新Roomへ再適用する。すでに反映済みなら最新Roomを成功応答し、古いフェーズから遅れて届いたCommandは拒否する。WordWolf/Tahoiyaに残っていた部屋全体POST互換経路も廃止済みで、全8オンラインゲームのgame-server境界は同じHTTP契約になった。

保存済み部屋の正規化・旧フィールド互換・試合得点確定は `lib/wordwolf-room-normalizer.ts`、狼ID・お題・投票・発言の閲覧者別秘匿とロビーChoiceは `lib/wordwolf-room-presentation.ts` に分離した。通常CommandのCASとactive-room索引更新は共通Room Runtimeを使い、timer・専用Commandとの互換保存入口だけを `lib/wordwolf-room-store.ts` に維持する。

`config/game-registry.json` の `moduleBoundaryFiles` は分離済み境界の正本であり、`npm run lint` が存在を検査する。新しいスレッドや新ゲームでファイルを1つへ戻さない。

たほい屋のブラウザ内room互換、remote優先・local fallback、部屋設定default、Room生成は `app/tahoiya/tahoiya-room-adapter.ts`、ルール表示は `app/tahoiya/TahoiyaRulesDialog.tsx`、入室・部屋設定・デバッグ操作は `app/tahoiya/TahoiyaRoomPanel.tsx` に分離した。ラウンド概要・参加者、偽説明入力、投票、結果、得点も表示部品へ分離し、表示用の派生状態は `use-tahoiya-view-model.ts`、部屋作成・参加・ロビー設定・候補生成は `use-tahoiya-lobby-actions.ts`、通常進行は `use-tahoiya-game-actions.ts`、デバッグ進行は `use-tahoiya-debug-actions.ts`、セッション復元・room polling・結果保持は `use-tahoiya-room-session.ts`、共通room更新・解散は `use-tahoiya-room-actions.ts` に集約した。画面入口は`TahoiyaGame.tsx`、統合Controllerは`use-tahoiya-controller.ts`、PC表示は`TahoiyaDesktopLayout.tsx`を正本とする。WordWolf、Word Scale、Word Out、Code Intercept、Word Sonar、Northern Branch、Canvas、Daifugoを含む登録済み全ゲームも同じ三層へ移行済みで、対象ファイルは`docs/UI_ARCHITECTURE.md`を参照する。

プレイヤー別の連続時間切れ、5秒制限、復帰通知は `lib/player-timeout-policy.ts` を正本とする。タイマーのあるゲームはRoomへ共通フィールドを合成し、ゲーム固有Storeは「誰が時間切れになったか」と「有効な操作があったか」だけを渡す。制限解除は通常操作ではなく本人の明示的な復帰操作だけで行う。
