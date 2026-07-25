# App Games / Game Fields

オンラインゲーム本体、共通ゲーム基盤、外部ゲーム制作向けSDKを開発するリポジトリです。

## 最初に確認する文書

### 現在の実態

[`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md)

現在実装・運用されている機能、主要ルート、共通基盤、環境設定の概要を記録します。
「いま何が動くか」を確認するときはこちらを正本として扱います。

### 今後の構想

[`docs/FUTURE_PLAN.md`](./docs/FUTURE_PLAN.md)

未実装、検討中、段階導入中の構想を記録します。
この文書にある内容を実装済みとして扱わないでください。

### 開発資料ナビ

[`docs/README.md`](./docs/README.md)

作業内容ごとの正本、確認順、バグ調査手順をまとめています。別スレッドや別担当者が開発を再開する場合は、ここから開始してください。

## 文書の原則

- `CURRENT_STATE.md` は現在の実態を記録する
- `FUTURE_PLAN.md` は未実装の構想を記録する
- 実装と検証が完了した構想は、将来文書に残したままにせず現行文書へ移す
- READMEの記述だけで実装済みと判断せず、関連コード・設定・テストも確認する
- 仕様変更時は新規コードだけでなく、既存コードへのバックフィル対象も確認する
- 文書と実装が食い違う場合は、片方を黙って正しいものとして扱わず差分を明示する

## 開発コマンド

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run build:sdk
npm run build:runtime-packages
npm run test:sdk-package
npm run build:sdk-starter
npm run test:sdk-starter
```

## 主要な正本

- 現在の開発状態: [`docs/DEVELOPMENT_HANDOFF.md`](./docs/DEVELOPMENT_HANDOFF.md)
- 未修正事項: [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md)
- 環境変数台帳: [`docs/ENVIRONMENT_VARIABLES.md`](./docs/ENVIRONMENT_VARIABLES.md)
- ゲーム登録: [`config/game-registry.json`](./config/game-registry.json)
- 長期構想: [`docs/PLATFORM_VISION.md`](./docs/PLATFORM_VISION.md)
