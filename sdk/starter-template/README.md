# Game Fields SDK Starter

ChatGPTと共同で、Game Fields向けゲーム固有packageを作るための外部開発スターターです。

## ファイル

- `START_HERE.md`: 初回利用者向けの最短手順
- `GAME_SPEC.md`: ゲームルールの正本
- `APP_REQUIREMENTS.md`: Game Fieldsへ載せるアプリの共通要件
- `MOCK_GUIDE.md`: 仕様確定後に画面モックを作る手順
- `mock/`: 利用者が本実装前に確認する画面モック
- `AGENTS.md`: ChatGPT/Codexが守る編集範囲と安全境界
- `SDK_API.md`: 公開SDK v__SDK_VERSION__ の最小リファレンス
- `SUBMISSION_CHECKLIST.md`: Game Fieldsへ返す前の確認項目
- `src/manifest.ts`: ゲームの機能宣言
- `src/contracts.ts`: 保存Room、Command、安全なRoomView
- `src/server-module.ts`: 作成、Command、閲覧者別表示
- `tests/game-contract.test.ts`: DB不要のMock Runtime契約テスト
- `src/demo.ts`: ダミー2人で1ゲームを完走する例
- `vendor/__SDK_TARBALL__`: 同梱SDK package
- `starter-manifest.json`: 公式取得元、starter version、SDK version
- `scripts/build-submission.mjs`: 提出ZIP生成器

## Commands

```bash
npm install
npm run build
npm test
npm run demo
npm run check:mock
npm run check
npm run package
```

`npm run check:mock`は、仕様の未記入がなく、モックと説明書が用意されていることを確認します。`npm run check`は型検査と契約テストを実行します。`npm run package`は`submission/game-fields-submission.zip`を生成します。本体への統合、認証、永続化はGame Fields運営側の審査後に接続します。
