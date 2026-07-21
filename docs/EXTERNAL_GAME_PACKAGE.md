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

packages/
  game-sdk/       npmへ一般配布できる公開package
  game-runtime/   Game Fields内部専用。公開・配布しない
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

## 現在の実装段階

SDK v1の公開型、認可済みactorを受けるserver module契約、閲覧者別presentation、メモリMock Runtime、manifest検証、生成雛形、import境界検査は`packages/game-sdk`と`scripts/create-game.mjs`へ実装済み。Cookie認証、Redis、DB、管理機能には依存していない。

公開候補package名は`@game-fields/game-sdk`、preview versionは`0.1.0`である。独立TypeScript build、SemVer、3つの`exports`、公開ファイル限定、tarballの外部install・実行検査まで実装済み。npm registryへの意図しない公開を防ぐため、初回公開承認までは`private: true`かつ`UNLICENSED`を維持する。

npm workspacesと`apps/sdk-portal`の独立Next.jsアプリは実装済みで、SDKの目的、現在の契約層、提出から`main`公開までの管理ゲートを説明する初期ランディングを持つ。Portal単体の起動は`npm run dev:sdk`、production buildは`npm run build:sdk`を使う。

SDK専用Vercel Project `app-games-sdk`は同一Gitリポジトリへ接続済みで、Root Directory `apps/sdk-portal`、Production Branch `main`、`develop` Preview、対象ブランチのbuild制御を設定している。`develop`からのGit Preview buildに成功し、Portalソースを`main`へ限定反映したうえで`https://sdk.game-fields.com`へProduction公開済みである。

本体内部には非公開`@game-fields/game-runtime`とRedis/Cookie adapterを実装し、公開SDKだけを使う小規模オンラインfixtureで、認証identity注入、host/player判定、Redis TTL保存、revision CAS、閲覧者別RoomViewを実証済みである。内部Runtime coreは公開SDK以外へ依存せず、Cookie・Redis実装は本体`lib`側から注入する。汎用HTTP route・Client Runtime、WebSocket、1人1部屋、解散、戦績、リプレイ、npm registryへの初回publish、利用者向けインストール手順、APIリファレンス、提出画面は未実装である。

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
9. npmの公開前検査、SemVer、リリース手順を整備して一般配布する

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
