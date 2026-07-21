# ChatGPT向け Game Fields ゲーム開発SDK

## 目的

初心者がゲーム案を文章で用意し、この資料・対象ゲームフォルダ・SDKをChatGPTへ渡すことで、Game Fieldsの共通基盤を壊さずゲームを追加できる状態を目指す。

このSDKは「何でも自動生成する魔法」ではない。認証、Redis、DB、秘密情報、課金、管理権限などの危険な領域をプラットフォーム側へ閉じ込め、ゲーム開発者とAIがゲーム固有部分へ集中できる境界である。

## ChatGPTへ最初に渡すもの

1. この `docs/CHATGPT_GAME_SDK.md`
2. `docs/NEW_GAME_CHECKLIST.md`
3. `docs/UI_ARCHITECTURE.md`
4. 生成された `app/<game-id>/AGENTS.md`
5. 生成された `app/<game-id>/GAME_SPEC.md`
6. 対象ゲームフォルダだけを編集する指示

## 標準手順

```bash
npm run create-game -- sample-game "サンプルゲーム"
```

生成後、`GAME_SPEC.md`へゲーム内容を記載し、ChatGPTへ次のように依頼する。

> `app/sample-game/AGENTS.md` と `GAME_SPEC.md` を正本として、このゲームを実装してください。対象ゲームフォルダ外を変更する必要がある場合は、先に理由と変更候補を列挙してください。認証、DB、Redis、APIキーへ直接アクセスせず、既存の共通Runtimeを利用してください。最後に lint/test/build と新規ゲーム監査を実行してください。

SDK利用者は、完成したゲーム固有package、manifest、テスト、権利・ライセンス情報をGame Fieldsへ提出する。SDK利用者自身が`develop`や`main`へ統合したり、本番公開したりするものではない。提出後はGame Fields運営者が審査し、採用したものだけをdevで実プレイ確認したうえで、運営者が`main`へ反映する。

## AIが編集してよい領域

原則として以下だけ。

- `app/<game-id>/`
- `lib/<game-id>-*.ts` のゲーム固有domain・型・adapter
- `tests/<game-id>*.test.ts`
- `public/game-visuals/<game-id>.webp`
- `config/game-registry.json` の当該ゲーム項目
- 当該ゲームの仕様資料

共通基盤の変更が必要な場合は、ゲーム実装と混ぜず別コミットにする。

## AIが直接触れてはいけない領域

- 認証Cookieやセッション発行
- DB接続文字列
- Redis接続と生Command
- APIキーや秘密値
- 管理者資格判定
- 課金・決済
- 他ゲームのroom state
- 本番データ移行

必要な機能はSDKまたはRuntime interfaceへ要求し、ゲーム側へ実装を複製しない。

## 必須構造

```text
<Game>Game
  ↓
use<Game>Controller
  ├ state
  ├ actions
  ├ session
  ├ viewModel
  └ permissions
  ↓
<Game>DesktopLayout
```

MobileLayoutは将来追加する。DesktopLayout内でホスト判定や秘密情報判定を組み立てず、Controllerの`permissions`を使う。

## SDK契約

公開可能なSDK契約は`@game-fields/game-sdk`の次の3 exportに限定する。

- `@game-fields/game-sdk`: manifest、Controller、Command envelope、保存Roomと公開RoomViewの境界
- `@game-fields/game-sdk/runtime`: 作成、認可済みactor、Command、presentationのサーバー契約
- `@game-fields/game-sdk/mock-runtime`: DB・Redis不要のローカル契約テストRuntime

ソースは`packages/game-sdk/src`へ物理分離し、独立した`package.json`、SemVer、`exports`、TypeScript buildを持つ。現在のpreview版は`0.1.0`で、誤公開を防ぐため`private: true`かつ`UNLICENSED`としている。`npm run test:sdk-package`はtarballを一時外部projectへinstallし、3 exportをpackage名だけで利用できることを検査する。

各ゲームはmanifestを宣言し、AIと自動監査が機能要件を確認できるようにする。Create/Commandの本人IDと表示名はリクエストpayloadではなく、Game Fieldsが署名済みセッションから解決した`GameSdkTrustedActor`を使う。保存Roomは`presentRoom`を通して`GameSdkRoomSnapshot<RoomView>`へ変換し、秘密情報を含む保存Room全体をクライアントへ渡さない。

Mock Runtimeは作成時revision 1、Commandごとの1段階revision更新、古いrevisionの409相当拒否、同時更新の再検査、Roomコード不変を検証する。`npm run check:sdk`は公開SDKからアプリ内部moduleや環境変数への依存が入っていないことを検査する。

## 完成条件

- PC表示の基本操作が成立する
- Controller・権限層・DesktopLayoutが分離されている
- UI判定とサーバー認可が分離されている
- ダミー・CPUの手番でデバッグが停止しない
- 日本語・英語の表示方針が明記されている
- 秘密情報が閲覧者別にsanitizeされる
- Commandがフェーズ・手番・権限を検証する
- lint、test、build、ゲーム監査が成功する

## 現時点の限界

SDK v1の型、サーバー契約、Mock Runtime、生成雛形、境界検査は`packages/game-sdk`へ物理分離済みである。`@game-fields/game-sdk@0.1.0`は単体build、tarball化、空の外部projectへのinstall、3つの公開exportの実行検査まで成功している。`apps/sdk-portal`はVercel Project `app-games-sdk`としてGitHubへ接続し、Root Directory、Production Branch `main`、`develop` Preview、対象ブランチのbuild制御を設定済みで、`https://sdk.game-fields.com`へProduction公開済みである。

Game Fields本体では非公開`@game-fields/game-runtime`と`lib/game-sdk-platform-adapter.ts`を追加し、署名済みCookie由来identity、host/player判定、Redis TTL保存、revision CAS、閲覧者別presentationを小規模オンラインfixtureで実証済みである。外部ゲームfixtureは公開SDKだけをimportし、Commandへ偽のplayer IDを混ぜてもRuntime由来のidentityが使われ、同じrevisionの同時Commandは片方だけが保存される。

ただし公開packageはまだnpm registryへpublishしておらず、`private: true`と`UNLICENSED`を維持している。汎用HTTP route・Client Runtime、WebSocket、1人1部屋、解散、戦績、リプレイ、Developer Portalのチュートリアル・APIリファレンス・提出画面も未実装である。platform adapterとRedisキー実装はGame Fields内部専用で、公開SDKやPortalへ含めない。
