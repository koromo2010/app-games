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

### リポジトリを持たない試用者

`npm run build:sdk-starter`で、ChatGPTへそのまま渡せる`game-fields-sdk-starter-v0.1.1.zip`を生成できる。ZIPには`@game-fields/game-sdk`のtarball、初回プロンプト、`AGENTS.md`、`GAME_SPEC.md`、APIリファレンス、AppSetと正式client、契約テスト、完走デモ、昇格診断、game package builderを含む。

試用者は`GameFieldsDownloadMe-ver10.md`をChatGPTへ渡し、そこから`downloadMeVersion: 10`の公開スターターを取得する。最初に仕様を相談して`GAME_SPEC.md`を確定したあと、同じフォルダ内だけを実装させる。`npm run test:sdk-starter`は別ディレクトリへの展開、同梱SDK install、型検査、契約テスト、デモ完走、提出ZIPまでを検査する。

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

公開可能なSDK契約は`@game-fields/game-sdk`の明示的なsubpath exportに限定する。基本契約・Runtimeに加え、Platform注入resourceとトランプ・描画の再利用ライブラリだけを公開し、本体のDB・認証・管理実装は含めない。

- `@game-fields/game-sdk`: manifest、Controller、Command envelope、保存Roomと公開RoomViewの境界
- `@game-fields/game-sdk/runtime`: 作成、認可済みactor、Command、presentationのサーバー契約
- `@game-fields/game-sdk/mock-runtime`: DB・Redis不要のローカル契約テストRuntime
- `@game-fields/game-sdk/client-runtime`: 採用後にGame Fieldsの認証済みRoom APIへ接続するbrowser transport
- `@game-fields/game-sdk/portable-server`: 未審査AppSetを隔離runnerから呼ぶeffect protocol
- `@game-fields/game-sdk/handshake`: 接続環境、release、contract schema、必須capabilityの互換性判定

MCP `initialize`、OAuth認証、Game Fields SDK handshakeは別の責務である。DownloadMeから始めるAIは最初に`get_sdk_handshake`へ環境、Platform版、SDK package版、contract schema、必須capabilityを提示し、`accepted=true`を確認してから制作者環境やゲーム仕様へ進む。初回は共通moduleを全件必須とだけ伝え、内部の解除可能性は制作AIへ渡さない。モック承認後はMCPが確定済み`requiredModuleIds`と各moduleの公開利用契約を返す。`sdk`と`sdk-dev`は同じhandshake schemaを使い、環境とcanonical endpointだけを応答で区別する。

ソースは`packages/game-sdk/src`へ物理分離し、独立した`package.json`、SemVer、`exports`、TypeScript buildを持つ。npm安定版は`0.1.0`、developの昇格基盤候補は`0.1.1`で、MIT License、public access、provenanceを固定している。`npm run test:sdk-package`はtarballを一時外部projectへinstallし、Runtime、portable protocol、Platform resource契約、トランプ・描画の純粋ロジックとReact UIをpackage名だけで利用できることを検査する。

各ゲームはmanifestを宣言し、AIと自動監査が機能要件を確認できるようにする。共通設定画面は`manifest.settings`に宣言した項目だけを表示し、最大人数やラウンド数等を固定しない。`online-room`では制限時間1項目だけを必須とし、その初期値と選択肢もゲーム側が所有する。Create/Commandの本人IDと表示名はリクエストpayloadではなく、Game Fieldsが署名済みセッションから解決した`GameSdkTrustedActor`を使う。保存Roomは`presentRoom`を通して`GameSdkRoomSnapshot<RoomView>`へ変換し、秘密情報を含む保存Room全体をクライアントへ渡さない。

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

SDK v1の型、サーバー契約、Mock Runtime、portable AppSet protocol、生成雛形、境界検査は`packages/game-sdk`へ物理分離済みである。`0.1.1`候補は単体build、tarball化、空の外部projectへのinstall、公開exportの実行検査まで成功している。正式packageはclient、server bundle、AppSet原文を同じrevisionとhashで保存し、正式Previewは本体共通Roomを使う。candidate→development→stableでは同じrevisionとhashをコピーし、AppSetを再build・変換・補正しない。

Game Fields本体では非公開`@game-fields/game-runtime`と`lib/game-sdk-platform-adapter.ts`を追加し、署名済みCookie由来identity、host/player判定、Redis TTL保存、revision CAS、閲覧者別presentationを小規模オンラインfixtureで実証済みである。外部ゲームfixtureは公開SDKだけをimportし、Commandへ偽のplayer IDを混ぜてもRuntime由来のidentityが使われ、同じrevisionの同時Commandは片方だけが保存される。

公開packageの実publishにはnpmの`@game-fields` scope所有権と限定publish資格が必要である。入口と公開スターターGitはまず運営者本人のPro版ChatGPT実機検証に使い、ゲーム作成、共有mock確認、提出ZIP返却、dev統合を確認した後に無料版の能力・利用枠を検証する。内部Runtime coreのstorage-neutralなRoom更新lifecycle、本体8オンラインゲームへのRedis／active-room／解散／戦績・リプレイ注入、審査済みSDKゲームの汎用HTTP・active room・一覧・解散・revision WebSocketは実装済みである。Developer Portalの正式チュートリアル・検索可能APIリファレンス・提出画面は未実装である。platform adapterとRedisキー実装はGame Fields内部専用で、公開SDKやPortalへ含めない。
