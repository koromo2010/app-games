# Game Fields SDK Starter

ChatGPTと共同で、Game Fields向けゲーム固有packageを作るための外部開発スターターです。

## ファイル

- `START_HERE.md`: 初回利用者向けの最短手順
- `GAME_SPEC.md`: ゲームルールの正本
- `APP_REQUIREMENTS.md`: Game Fieldsへ載せるアプリの共通要件
- `MOCK_GUIDE.md`: 仕様確定後に昇格可能なゲーム画面を作る手順
- `mock/`: 旧称。Previewと昇格後で同じものを使うゲーム固有クライアント
- `mock/preview.json`: SDKの制作者広場へ表示するゲームID・名称・説明
- `AGENTS.md`: ChatGPT/Codexが守る編集範囲と安全境界
- `SDK_API.md`: 公開SDK v0.2.0 の最小リファレンス
- `SDK_MODULE_CATALOG.md`: 初期状態で全件必須となる既存共通モジュール一覧
- `SUBMISSION_CHECKLIST.md`: Game Fieldsへ返す前の確認項目
- `src/manifest.ts`: ゲームの機能宣言
- `src/contracts.ts`: ゲーム固有のsettings、AppState、AppCommand、AppViewとSDK合成型
- `src/app-set.ts`: ゲーム固有state、Command、勝敗、閲覧者別固有表示
- `src/server-module.ts`: SDK基本セットとアプリセットの合成だけを行う入口
- `tests/game-contract.test.ts`: DB不要のMock Runtime契約テスト
- `src/demo.ts`: ダミー2人で1ゲームを完走する例
- `vendor/game-fields-game-sdk-0.2.0.tgz`: 同梱SDK package
- `starter-manifest.json`: 公式取得元、starter version、SDK version
- `scripts/build-submission.mjs`: 提出ZIP生成器
- `scripts/publish-mock.mjs`: 既存管理トークン運用だけで使う互換スクリプト
- `scripts/check-promotion-readiness.mjs`: AppSetとクライアントの昇格前診断
- `scripts/build-game-package.mjs`: AppSetを改変せずhash固定packageへまとめる
- `scripts/publish-game-package.mjs`: 既存管理トークン運用だけで使う互換スクリプト

## Commands

```bash
npm install
npm run build
npm test
npm run demo
npm run check:mock
npm run check
npm run diagnose:promotion
npm run build:game-package
npm run package
```

新規Work／Codex制作はOAuth接続済みGame Fields SDK MCPの`publish_mock`と`publish_game_package`を使います。正式なPreviewではAppSet・クライアント・source hashを一緒に保存します。`npm run publish:mock:legacy`と`npm run publish:game-package:legacy`は既存管理トークン運用専用です。Previewと昇格後は同じpackage revisionを実行し、昇格時にAppSetを変換・再buildしません。

共通モジュール39件は最初すべて必須です。ChatGPTはprofileを変更せず、確定済みの`requiredModuleIds`と各moduleの公開契約を使ってAppSetを実装します。
