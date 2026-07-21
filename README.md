# Game Fields SDK Starter

ChatGPTと共同で、Game Fields向けゲーム固有packageを作るための外部開発スターターです。

## ファイル

- `START_HERE.md`: 初回利用者向けの最短手順
- `GAME_SPEC.md`: ゲームルールの正本
- `AGENTS.md`: ChatGPT/Codexが守る編集範囲と安全境界
- `SDK_API.md`: 公開SDK v0.1.0 の最小リファレンス
- `SUBMISSION_CHECKLIST.md`: Game Fieldsへ返す前の確認項目
- `src/manifest.ts`: ゲームの機能宣言
- `src/contracts.ts`: 保存Room、Command、安全なRoomView
- `src/server-module.ts`: 作成、Command、閲覧者別表示
- `tests/game-contract.test.ts`: DB不要のMock Runtime契約テスト
- `src/demo.ts`: ダミー2人で1ゲームを完走する例
- `vendor/game-fields-game-sdk-0.1.0.tgz`: 同梱SDK package
- `starter-manifest.json`: 公式取得元、starter version、SDK version
- `scripts/build-submission.mjs`: 提出ZIP生成器

## Commands

```bash
npm install
npm run build
npm test
npm run demo
npm run check
npm run package
```

`npm run check`は型検査と契約テストを実行します。`npm run package`は`submission/game-fields-submission.zip`を生成します。本体への統合、ブラウザUI、認証、永続化はGame Fields運営側の審査後に接続します。
