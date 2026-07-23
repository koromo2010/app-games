# ゲーム追加テンプレート

新しいゲームを、自分または外部開発者が既存基盤を壊さず追加するための雛形生成コマンドです。

## 使い方

```bash
npm run create-game -- sample-game "サンプルゲーム"
```

`app/sample-game/` に次を生成します。

```text
page.tsx
SampleGameGame.tsx
use-sample-game-controller.ts
sample-game-view-permissions.ts
sample-game-manifest.ts
sample-game-contracts.ts
sample-game-app-set.ts
sample-game-server-module.ts
SampleGameDesktopLayout.tsx
SampleGameMobileLayout.tsx.example
SDK_CONTRACT.test.ts.example
GAME_SPEC.md
AGENTS.md
README.md
```

## 三層と権限層

```text
Game entry
  ↓
Controller
  ├ state
  ├ session
  ├ polling
  ├ actions
  ├ ViewModel
  └ permissions
  ↓
DesktopLayout
```

専用スマホUIを実装する段階で、`.example` を参考にMobileLayoutを追加します。現段階ではDesktopLayoutだけを実装し、既存デザインを変えません。

オンラインRoomのserver側は`SDK基本セット + アプリセット`で生成します。`<game-id>-app-set.ts`へゲーム固有state・Command・勝敗・固有Viewだけを実装し、`<game-id>-server-module.ts`は`createGameSdkOnlineRoomModule`で合成するだけに保ちます。Room作成、参加者、設定、revision、共通Viewをゲーム側へ複製しません。

## 安全性

- 既存の `app/<game-id>` が存在する場合は中断し、上書きしません。
- UI権限は表示制御専用です。最終認可は必ずサーバーCommandで行います。
- Commandへactor IDを本人証明として含めません。署名済みセッションからプラットフォームRuntimeが`context.actor`を注入します。
- 保存Roomはクライアントへ返さず、`presentRoom`で閲覧者別の`RoomView`へ変換します。
- ゲームパッケージからDB、Redis、APIキー、管理者情報へ直接アクセスしません。
- `createGameSdkMockRuntime`を使い、DBや本番データなしで作成、Command、revision、秘密情報の遮断をテストできます。
- 共通機能は既存の認証、Room同期、時間制限、デバッグ、戦績、リプレイ、広告、i18nモジュールを利用します。

## 生成後に必要な作業

1. `config/game-registry.json` へ登録する。
2. 生成されたstarter Commandをゲーム固有domainへ置き換え、`server-module`の作成・Command・presentationを実装する。
3. 日本語・英語辞書を追加する。
4. デバッグ時にダミー・CPUの手番で停止しないことを確認する。
5. `SDK_CONTRACT.test.ts.example`を正式なテストへ移し、ホスト以外の拒否、古いrevision、観戦者の秘密情報遮断を追加する。
6. `docs/NEW_GAME_CHECKLIST.md` に沿って監査する。
7. `npm run lint`、`npm test`、`npm run build` を実行する。

## 外部開発者へ渡す範囲

原則として、対象ゲームディレクトリ、ゲームSDKの公開インターフェース、仕様書、テスト環境だけを渡します。本番環境変数、DB接続情報、Redis、ユーザーデータ、管理画面は渡しません。

### ChatGPTで試す外部スターター

リポジトリを持たない試用者向けには、次でZIPを生成します。

```bash
npm run build:sdk-starter
```

`artifacts/game-fields-sdk-starter-v0.1.0.zip`には、SDK tarball、`START_HERE.md`、`AGENTS.md`、`GAME_SPEC.md`、最小APIリファレンス、manifest、保存Room／Command／RoomView、Mock Runtime契約テスト、ダミー2人で完走するデモを含めます。SDK packageのversionとtarball名は生成時に自動反映し、`artifacts/`はGitへ保存しません。

```bash
npm run test:sdk-starter
```

この検査は、生成したZIPを空の一時ディレクトリへ展開し、同梱SDKだけをinstallしたうえで型検査、契約テスト、1ゲーム完走まで確認します。現在は運営者本人によるダウンロード体験の試用段階で、Portalからの一般公開は行いません。
