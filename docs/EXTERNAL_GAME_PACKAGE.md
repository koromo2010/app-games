# 外部開発者向けゲームパッケージ構想

## 目的

将来、Game Fields本体の認証・個人情報・DB・運用基盤を渡さず、ゲーム部分だけを他の開発者へ依頼できるようにする。

公開SDKは、外部開発者へGame Fields本番の公開権限を渡す仕組みではない。外部開発者はSDKを使ってゲーム固有packageを作成し、完成物をGame Fields運営者へ提出する。採用判断、`develop`への統合、最終検証、`main`への反映と本番公開はGame Fields運営者だけが行う。

## 提出・審査・公開権限

標準フローは次のとおりとする。

1. 外部開発者が公開SDKとMock Runtimeでゲームをローカル開発・検証する。
2. ゲーム固有package、manifest、テスト、権利・ライセンス情報をGame Fieldsへ提出する。
3. 自動検査でSDK契約、import境界、秘密情報、依存関係、基本動作を確認する。
4. Game Fields運営者が内容、品質、権利、安全性を審査し、採用可否を決める。
5. 採用したものだけを運営者が`develop`へ統合し、dev環境で実プレイ確認する。
6. 運営者が最終承認したものだけを`main`へ反映し、本番公開する。

- 外部開発者へ`develop`、`main`、Vercel本番、DB、Redis、Blobの書き込み権限を付与しない。
- Developer Portalから提出しても、自動でGitへmerge、Vercelへdeploy、ゲームを公開しない。
- 現段階では自動検査の成功を採用承認とせず、Game Fields運営者による最終審査を必須とする。
- 将来GitHub PRを提出手段に使う場合も、外部開発者にはmerge権限を与えず、Previewへ本番秘密情報を渡さない。
- 未審査コードをオンライン実行できるようにする場合は、本体・devとは別の使い捨てsandboxで扱う。SDK Portal自身の権限では本体Runtimeへ接続させない。

### 件数増加時の審査

提出数が人手で追えなくなった場合は、Game Fieldsが管理するAI・自動検査を審査ゲートへ組み込める。自動化してよい対象には、SDK契約、脆弱性、危険な依存関係、秘密情報、権限逸脱、既知のバグパターン、テスト不足、権利情報不足、重複・低品質な量産提出の検出を含む。

自動化後も、無審査で公開できる経路は作らない。すべての提出物は最低1つのGame Fields管理下の採用ゲートを通し、不合格・判定不能・高リスクな提出物は公開せず隔離する。AIを補助審査、一次採否、リスク別振り分けのどこまで使うかは、精度と件数を確認して運営方針として段階的に変更する。`main`の更新権限と本番公開権限を外部開発者へ渡さない点は変えない。

## リポジトリと配布単位

`app-games`、Developer Portal、公開SDKは同じGitリポジトリで管理する。ただし、同じNext.jsアプリや同じnpm packageには入れず、npm workspacesを使って物理的に分離する。

```text
apps/
  sdk-portal/     sdk.game-fields.com用の独立Next.jsアプリ
  sdk-preview/    未審査mock専用の別オリジン実行アプリ

packages/
  game-sdk/       npmへ一般配布できる公開package
  game-runtime/   Game Fields内部専用。公開・配布しない
  sdk-preview-auth/ Portalとpreviewだけが使う非公開署名契約
```

- `app-games-sdk`は同じGitリポジトリの`apps/sdk-portal`をRoot Directoryにする別Vercel Projectとする。
- 公開SDKは独立した`package.json`、SemVer、`exports`、公開ファイル一覧、契約テストを持ち、本体アプリのビルド成果物やパスaliasに依存しない。
- Gitリポジトリ自体は現時点で分けない。SDKを別組織へ移管する、外部開発者へSDKソースだけの権限を与える、リリース責任者や公開ライセンスを完全に分ける必要が生じた場合に別リポジトリ化を再検討する。
- 将来SDKを別リポジトリへ移しても利用者側のimportを変えずに済むよう、ゲームは公開package名だけへ依存する。

既存の本体Next.jsアプリは当面リポジトリ直下に維持し、SDK分離のためだけに本体全体を`apps/`へ移動しない。

## ゲームパッケージの境界

外部開発者が担当する範囲はゲーム固有パッケージ内に限定する。

```text
packages/
  game-sdk/       公開可能な型、共通UI、テスト用アダプター
  game-runtime/   Game Fields内部の認証、部屋、戦績、監査

games/
  <game-id>/
    manifest.ts
    domain/
    client/
      use<Game>Controller.ts
      <Game>DesktopLayout.tsx
      <Game>MobileLayout.tsx   # 必要になるまで未作成
      permissions.ts
    server/
      commands.ts
      presentation.ts
    locales/
    tests/
```

当面は既存ゲームのNext.js配置を維持しつつ、この依存方向へ段階的に寄せる。公開SDKとDeveloper Portalだけを先にworkspace化し、既存ゲーム全体の一括移動は行わない。

## SDK基本セットとアプリセット

SDKゲームは、`SDK基本セット + アプリセット`の二層として扱う。

- SDK基本セット: 認証済みRoom、参加・退出・復帰、一覧、保存、revision競合、Realtime、共通画面、設定枠、DEBUG、時間管理、結果・再戦・解散等、ゲームを替えても維持する部分。
- アプリセット: ルール、ゲーム固有state・Command・presentation、固有設定、固有画面等、そのゲームでなければ成立しない部分。

ワードウルフでは、お題、役職、市民・狼、ヒント、投票、決選投票、逆転回答とその固有表示をアプリセットとする。それ以外を直ちにすべて基本セットと決めるのではなく、現行`/wordwolf`をSDK-dev上で同じように動かす受け入れ試験を維持しながら、別ゲームでも再利用できることを確認した単位だけをSDK基本セットへ移す。

`/sdk-examples/word-wolf`は現行`WordWolfGame`を直接利用する基準画面とする。SDK用に機能や見た目を減らした別実装を完成判定には使わない。移行中も、部屋作成から結果・再戦までの現行機能が同じ画面で動くことを基本セットとアプリセットの結合条件にする。

## 現在の実装段階

SDK v1の公開型、認可済みactorを受けるserver module契約、閲覧者別presentation、メモリMock Runtime、manifest検証、生成雛形、import境界検査は`packages/game-sdk`と`scripts/create-game.mjs`へ実装済み。さらに、Online Roomの共通state・Lifecycle・安全な共通Viewを所有するSDK基本セットと、ゲーム固有state・Command・Viewだけを登録する`GameSdkOnlineRoomAppSet`の合成APIを実装した。Cookie認証、Redis、DB、管理機能には依存していない。

公開候補package名は`@game-fields/game-sdk`、preview versionは`0.1.0`である。独立TypeScript build、SemVer、用途別の公開`exports`、公開ファイル限定、tarballの外部install・実行検査まで実装済み。npm registryへの意図しない公開を防ぐため、初回公開承認までは`private: true`かつ`UNLICENSED`を維持する。

npm workspacesと`apps/sdk-portal`の独立Next.jsアプリは実装済みで、SDKの目的、現在の契約層、提出から`main`公開までの管理ゲートを説明する。未審査mockの実行は別アプリ`apps/sdk-preview`、短時間署名grantは非公開`packages/sdk-preview-auth`へ分離した。Portalとpreviewは`npm run build:sdk`、`npm run build:sdk-preview`で独立buildする。

SDK専用Vercel Project `app-games-sdk`は同一Gitリポジトリへ接続済みで、Root Directory `apps/sdk-portal`、Production Branch `main`、`develop` Preview、対象ブランチのbuild制御を設定している。`develop`からのGit Preview buildに成功し、Portalソースを`main`へ限定反映したうえで`https://sdk.game-fields.com`へProduction公開済みである。

本体内部には非公開`@game-fields/game-runtime`とRedis/Cookie adapterを実装し、公開SDKだけを使う小規模オンラインfixtureで、認証identity注入、host/player判定、Redis TTL保存、revision CAS、閲覧者別RoomViewを実証済みである。内部Runtime coreは公開SDK以外へ依存せず、storage-neutralなRoom mutation lifecycleとして競合再適用、保存前正規化、保存後hookを提供する。本体`lib/online-room-store-runtime.ts`がRedis、TTL、1人1部屋、一覧、解散、Realtime、戦績・リプレイを注入し、登録済みオンラインゲーム8本が利用する。

採用済みSDK module向けには、汎用`/api/game-sdk/[gameId]/rooms` Routeと公開`@game-fields/game-sdk/client-runtime`を実装済みである。Clientは部屋コード、作成input、expected revision付きCommandだけを送り、Routeが署名済みCookie、レート制限、debug資格、Telemetryを適用して非公開Runtimeへ接続する。active room、参加可能な部屋一覧、個別／host一括解散も同じRoute契約に含め、SDK用Room StoreがTTL・索引・1人1部屋を管理する。`watchRoom`はrevision-only WebSocketを使い、通知後にHTTPで閲覧者別Viewを再取得し、接続不能時はポーリングへ戻る。server moduleは`lib/game-sdk-server-registry.ts`へ静的に審査登録したものだけを読み、Portal metadataや隔離PreviewのHTMLを動的に実行しない。最初の登録moduleはdevelop限定の`wordwolf-sdk`で、mainでは利用不可とする。npm registryへの初回publish、Portal上の正式チュートリアル・APIリファレンス・提出画面は未実装である。

Pro版ChatGPTで運営者本人が外部利用者と同じ流れを試すため、入口`sdk/entry/START_GAME_FIELDS.md`、正本`sdk/starter-template`、ZIP生成`scripts/build-game-sdk-starter.mjs`、公開Git用snapshot生成`scripts/build-game-sdk-starter-repository.mjs`を実装済みである。入口は公開`koromo2010/app-games`の`sdk-starter`ブランチだけを浅く取得させ、能力不足の通常ChatにはWorkまたはCodexへの切替を案内する。スターターにはSDK tarball、ChatGPT用指示、仕様書、APIリファレンス、型付きゲームmodule、契約テスト、完走デモ、提出ZIP生成器を含む。`npm run test:sdk-starter`で入口、公開Git用snapshotとZIPの同一性、SDK install、型検査、契約テスト、完走、提出ZIPまで検査する。Portalの一般向けダウンロード導線と正式な公開ライセンスは未実装である。

初心者向け制作導線は、作りたいアプリの聞き取り、`GAME_SPEC.md`の確定、`APP_REQUIREMENTS.md`への照合、静的画面モック作成、モックの説明と利用者確認、承認後のSDK契約実装の順とする。モックは`mock/`へ外部サービス非依存のHTML/CSS/JavaScriptとして作り、`MOCK_REVIEW.md`へ画面、操作、共通要件への対応、本実装まで動かない部分を記録する。`npm run check:mock`は仕様と確認記録の未記入、モック必須ファイル、基本的なレスポンシブ設定を検査する。具体的なゲーム例を入口指示へ置かず、添付資料を今回のゲーム仕様として自動採用しない。

隔離Previewは、取得したHTMLへ公式`GameFieldsPreset` browser runtimeを自動注入する。参加者一覧、ダミー追加・削除、デバッグ表示、閲覧視点、フェーズ、開始、中断、再戦、自動進行の共通状態とCommandはPreviewが所有する。旧スターターの`data-action`属性も互換入力として扱い、静的な通知だけの飾りボタンへ戻さない。ゲーム固有JavaScriptは`registerGame`で石、カード、盤面等の固有状態の開始・初期化・自動進行だけを接続する。これは未審査Preview用adapterであり、本体統合時の認証、最終認可、永続化は引き続きplatform Runtimeが担当する。

SDK-devの確認画面は、制作者の広場からゲーム固有iframeへ直接遷移させない。共通の部屋作成・参加、参加者と設定を確認するRoomロビー、開始条件、DEBUG、同期revision、時間管理、結果、再戦、解散、戦績等の結果投影を外側へ合成し、ゲーム固有iframeはその内側のslotに限定する。ロビーからプレイ中へ移る際は同じiframeを保持し、ゲーム固有状態を画面Shellの都合で初期化しない。ゲームadapterの登録完了を外側Shellが確認できない間は開始を拒否し、共通module接続件数だけを根拠に正常扱いしない。DEBUGはダミー、閲覧視点、自動進行、中断を提供するが、`lobby / playing / result`へ無条件遷移するショートカットは置かず、公式Lifecycle導線で各面を確認する。

隔離iframeは`allow-same-origin`を付けないため、HTML用HttpOnly Cookieだけでは`styles.css`、`mock.js`、画像等の相対subresourceを取得できない。認証済みHTMLへ、同一制作者・ゲーム・確定commit・期限に限定した読取専用HMAC asset tokenの`base` URLを先頭注入し、相対assetをその経路へ解決する。これによりopaque-origin隔離を維持したまま固有CSS・JavaScriptを読み込み、asset tokenを入口sessionや別revisionへ転用させない。

広告は外側Shellの共通`GameAdSlot`だけが所有する。広告モードOFF、進行中、DEBUG中はDOMごと描画せず、ゲーム固有packageと隔離iframeから広告枠の内容・表示条件を変更できない。

`npm run publish:mock`は制作者の管理トークンでPortalの限定APIを呼び、mock一式をGame Fields管理下の専用非公開Gitへ自動commitする。Portalはcommit SHAだけをSDK DBへ紐付け、`/<creator-slug>/mock/<game-id>`を共有URLとする。未審査コードは別オリジンのiframeで、外部通信・フォーム・同一origin権限なしに実行する。隔離previewは専用Git読取以外のデータ接続を持たず、ゲームごとのVercel deploymentは不要である。専用GitとVercel Projectの実環境作成・ドメイン設定はコード反映後の外部設定として残る。

ワードウルフを基準に、正式なonline-room分離の第一段階も実装済みである。公開SDKは`GameSdkOnlineRoomState`、`GameSdkRoomPlayer`、設定schema、共通Room Lifecycle Commandと純粋reducerに加え、`defineGameSdkOnlineRoomAppSet`と`createGameSdkOnlineRoomModule`を提供する。`games/wordwolf-sdk`はSDK以外をimportせず、参加・退出・設定更新・revision・共通permissionsを実装しないAppSetへ移行した。開始後のお題配布・ヒント・投票・逆転回答・閲覧者別秘密語だけをゲームpackageが担当し、公開Viewでは内部player IDをseatへ置き換える。Mock Runtime上では3人参加から再戦まで完走済みである。

配布スターターも同じ合成APIを使い、`src/server-module.ts`は基本セットと`src/app-set.ts`を合成するだけになった。制作者はRoom作成、参加者、設定、revision、共通Viewを作り直さず、仕様承認後にアプリセットだけを実装する。

この分離moduleはserver契約と汎用Room transportの境界fixtureであり、現行ワードウルフの代替完成品ではない。SDK-devの公式ワードウルフは現行`WordWolfGame`そのものを表示する受け入れ基準へ切り替えた。今後もこの基準を保ち、現行版で再利用可能性を確認した共通UI・時間管理・DEBUG・結果導線をSDK基本セットへ順に追加する。

共通モジュールは`@game-fields/game-sdk/modules`の一つのcatalogへ集約する。初回モックはcatalog全件を必須として保存し、制作AIと管理トークンには変更手段を与えない。SDK-devへ署名済みアカウントでログインした環境所有者だけが、Platform固定以外を理由付きで必須解除できる。モック再発行では人間レビューを上書きしない。これはSDK側へ別のRoom・認証・UI基盤を再実装する仕組みではなく、既存の`online-room-route-factory`、`online-room-store-runtime`、`@game-fields/game-runtime`、共通UIと純粋domain部品を採用するprofileである。

catalogは採用方針であり、それだけを表示して実装済みとは判定しない。SDK-devは`app/sdk-preview/[creatorSlug]/games/[gameId]/sdk-preview-module-registry.ts`で全module IDを具体的な本体共通部品、SDK helper、または隔離Preview adapterへ解決する。必須IDに実装割当がない場合はPreview合成を失敗させ、`38/38`の件数表示だけで完成扱いにしない。画面を持たない進行helperやリソースも、共通モジュール確認画面から実行または表示を確認できる状態にする。

進行部品は提出完了、選択、投票、役職、チーム、ラウンド、手番、seat変換、標準結果へ物理分割した。WordWolf、Tahoiya、Word Scale、Word Sonar、Word Out、Code Intercept、Northern Branch、Daifugoの8オンラインゲームが同じ公開部品を直接利用する回帰検査を持つ。AppSetへ同じ判定をコピーしない。

## 外部へ公開するもの

- ゲームSDKの型
- 共通ボタン、トップバー、ルールダイアログ等のUI
- Roomの公開View型
- Command送信用の限定クライアント
- ローカル用のモックRuntime
- i18nインターフェース
- テスト用fixture
- ゲーム登録manifestのschema

## 外部へ公開しないもの

- DB接続情報
- Redisキーと永続化実装
- Cookie署名・認証秘密鍵
- 管理者・デバッグ資格判定
- 個人情報
- LLM APIキー
- 通報・モデレーション内部情報
- 戦績の直接書き込み
- 本番環境変数

## 依存ルール

```text
Game package -> game-sdk
Game package -> 許可されたruntime interface
Game package -X-> DB / Redis / account store / admin store
Platform runtime -> Game package manifest / commands / presentation
```

ゲーム側はGame Fields内部storeをimportせず、Runtimeから渡されたinterfaceだけを利用する。

## GameDefinitionとmodule採用方針

本体組み込みゲームとSDKゲームは、どちらも`GameDefinition`へ正規化してからGame Fieldsへ載せる。`GameDefinition`はカード情報だけではなく、組み込みmoduleまたはSDK packageへのRuntime参照と、各moduleの採否を持つ。

- `platform`: 認証、アカウントsession、共通ナビ、プレイヤーメニュー、永続化adapter、最終認可、観測。Game Fields固定で、ゲームpackageは無効化・置換できない。
- `core`: ルール、ゲーム固有surface、純粋domain、閲覧者別presentation。すべてのプレイ可能なゲームで必須。
- `capabilities`: online room、timer、debug、spectator、stats、rating、replay、result share、LLM。ゲームごとに採用できる。

任意moduleを採用しない場合も定義自体を省略せず、`disabled`と具体的な理由を宣言する。これにより、意図した不採用と実装漏れを自動検査で区別する。ゲーム種別によって実質必須になるmodule（例: `online-room`でのroom command・復帰）は、manifestとの組合せをpolicy検査する。

現行の`config/game-registry.json`は`app/games/game-definition-source.ts`で組み込み`GameDefinition`へ変換する。任意moduleの明示的な採否は`app/games/built-in-game-module-policies.ts`を正本とし、登録ゲームとの過不足と理由なし`disabled`をテストで拒否する。SDK制作者環境の定義も同じ契約へ変換し、本体の`GameLobby`と固定カード外枠へ追加する。SDK Portal独自ロビーは廃止し、制作者URLはGame Fields本体のdev UIを全画面で使用する。

## UI標準

外部ゲームも次の三層を必須とする。

```text
Game entry
  -> Controller
  -> DesktopLayout / MobileLayout
```

UI権限はControllerがpermissionsとして計算する。ただし最終認可はサーバーCommandで再検証する。

## 導入順

1. WordWolfでController・DesktopLayout・permissionsの基準を確立（完了）
2. manifestとRuntimeのTypeScript契約を作る（完了）
3. メモリMock Runtimeと契約テストを作る（完了）
4. import境界をlintで監査する（完了）
5. テンプレートゲームをRuntime契約対応にする（完了）
6. 公開部分を`packages/game-sdk`へ物理分離し、単体でpack・install・testできるようにする（完了）
7. `apps/sdk-portal`を作り、別Vercel Projectとして`sdk.game-fields.com`へ割り当てる（完了）
8. 小規模オンラインゲームでplatform adapterの認証・Redis CAS境界を実証する（完了）
9. 本体8オンラインゲームをstorage-neutral mutation lifecycleへ接続する（完了）
10. 採用済みSDK moduleを汎用HTTP Route・Client Runtime・Room lifecycle・WebSocketへ接続する（完了）
11. npmの公開前検査、SemVer、リリース手順を整備して一般配布する

## 完了条件

外部開発者が、本番DBやアカウント実装へ触れずに次を実行できること。

- ローカルでゲーム開始
- ダミープレイヤーを使った全進行テスト
- DesktopLayoutの確認
- Command単体テスト
- 多言語文言の追加
- manifest検証

統合時にはGame Fields側が認証、部屋永続化、デバッグ権限、戦績、リプレイ、広告、通報、監査を注入する。

SDKとDeveloper Portalの完成条件には、提出物が運営者の承認なしで`develop`、`main`、本番環境へ到達できないことも含む。
