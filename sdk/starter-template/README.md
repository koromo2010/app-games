# Game Fields SDK Starter

ChatGPT WorkまたはClaude Codeと共同で、Game Fields向けゲーム固有packageを作るための外部開発スターターです。通常チャット、Claude Desktop通常チャット、Coworkは制作クライアントとして未対応です。

## ファイル

- `START_HERE.md`: 初回利用者向けの最短手順
- `GAME_SPEC.md`: ゲームルールの正本
- `APP_REQUIREMENTS.md`: Game Fieldsへ載せるアプリの共通要件
- `MOCK_GUIDE.md`: 仕様確定後に昇格可能なゲーム画面を作る手順
- `mock/`: 旧称。Previewと昇格後で同じものを使うゲーム固有クライアント
- `mock/preview.json`: SDKの制作者広場へ表示するゲームID・名称・説明
- `AGENTS.md`: ChatGPT Work / Claude Codeが守る編集範囲と安全境界
- `SDK_API.md`: 公開SDK v__SDK_VERSION__ の最小リファレンス
- `SDK_MODULE_CATALOG.md`: 初期状態で全件必須となる既存共通モジュール一覧
- `SUBMISSION_CHECKLIST.md`: Game Fieldsへ返す前の確認項目
- `src/manifest.ts`: ゲームの機能宣言
- `src/contracts.ts`: ゲーム固有のsettings、AppState、AppCommand、AppViewとSDK合成型
- `src/app-set.ts`: ゲーム固有state、Command、勝敗、閲覧者別固有表示
- `src/server-module.ts`: SDK基本セットとアプリセットの合成だけを行う入口
- `src/game-client.tsx`: 操作プロトタイプと正式Roomで共有するゲーム固有UI
- `src/prototype-adapter.ts`: 固定fixture、状態早送り、resetだけを注入するadapter
- `tests/game-contract.test.ts`: DB不要のMock Runtime契約テスト
- `src/demo.ts`: ダミー2人で1ゲームを完走する例
- `vendor/__SDK_TARBALL__`: 同梱SDK package
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

新規ChatGPT Work / Claude Code制作はOAuth接続済みGame Fields SDK MCPを使います。仕様確定後はgame draftを作り、system-default由来の初期module contractなら人間確認を偽装せず共有sourceの実装へ進みます。初期profileを変更する場合だけproposalと本人の明示確定が必要です。`publish_mock`は互換tool名で、module usage検査済みの操作プロトタイプを保存します。人間がその`prototypeRevision`を`approve_mock`で明示承認した後だけ正式packageへ進みます。ローカルNode.jsがない標準経路では`publish_game_source_package`がbundle・hash・package検査を行います。既にNode.jsがある環境では`publish_game_package`も使えます。`publish:*:legacy`は既存管理トークン運用専用です。

共通moduleはPlatform policyとゲーム仕様から構成されます。AIは非公開項目やactive profileを変更せず、初期デフォルトまたは人間が変更確定した`moduleProfileRevision`・`moduleContractDigest`・package向け`requiredModuleIds`と各moduleのdelivery契約を使って共有UI/AppSetを実装します。
