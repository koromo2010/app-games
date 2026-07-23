# Game Fields SDK Starter

ChatGPTと共同で、Game Fields向けゲーム固有packageを作るための外部開発スターターです。

## ファイル

- `START_HERE.md`: 初回利用者向けの最短手順
- `GAME_SPEC.md`: ゲームルールの正本
- `APP_REQUIREMENTS.md`: Game Fieldsへ載せるアプリの共通要件
- `MOCK_GUIDE.md`: 仕様確定後に画面モックを作る手順
- `mock/`: 利用者が本実装前に確認する画面モック
- `mock/preview.json`: SDKの制作者広場へ表示するゲームID・名称・説明
- `AGENTS.md`: ChatGPT/Codexが守る編集範囲と安全境界
- `SDK_API.md`: 公開SDK v__SDK_VERSION__ の最小リファレンス
- `SDK_MODULE_CATALOG.md`: 初期状態で全件必須となる既存共通モジュール一覧
- `SUBMISSION_CHECKLIST.md`: Game Fieldsへ返す前の確認項目
- `src/manifest.ts`: ゲームの機能宣言
- `src/contracts.ts`: ゲーム固有のsettings、AppState、AppCommand、AppViewとSDK合成型
- `src/app-set.ts`: ゲーム固有state、Command、勝敗、閲覧者別固有表示
- `src/server-module.ts`: SDK基本セットとアプリセットの合成だけを行う入口
- `tests/game-contract.test.ts`: DB不要のMock Runtime契約テスト
- `src/demo.ts`: ダミー2人で1ゲームを完走する例
- `vendor/__SDK_TARBALL__`: 同梱SDK package
- `starter-manifest.json`: 公式取得元、starter version、SDK version
- `scripts/build-submission.mjs`: 提出ZIP生成器
- `scripts/publish-mock.mjs`: モックをSDKの専用Git保存APIへ送る補助スクリプト

## Commands

```bash
npm install
npm run build
npm test
npm run demo
npm run check:mock
npm run publish:mock
npm run check
npm run package
```

`npm run check:mock`は、仕様の未記入がなく、モックと説明書が用意されていることを確認します。`npm run publish:mock`は入口で受け取ったSDK URL・制作者slug・管理トークンを一時環境変数から読み、モックを専用Gitへ自動保存して共有URLを返します。`npm run check`は型検査と契約テストを実行します。`npm run package`は`submission/game-fields-submission.zip`を生成します。本体への統合、認証、永続化はGame Fields運営側の審査後に接続します。

モックを初めて保存すると、共通モジュール38件はすべて必須になります。ChatGPTはモックやAppSetへ採否を書き込まず、profileも変更しません。利用者のモック承認後はChatGPTが`get_game_module_requirements`で確定済みの`requiredModuleIds`だけを読み、その一覧をすべて使うAppSetを実装します。
