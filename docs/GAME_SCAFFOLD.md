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
SampleGameDesktopLayout.tsx
SampleGameMobileLayout.tsx.example
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

## 安全性

- 既存の `app/<game-id>` が存在する場合は中断し、上書きしません。
- UI権限は表示制御専用です。最終認可は必ずサーバーCommandで行います。
- ゲームパッケージからDB、Redis、APIキー、管理者情報へ直接アクセスしません。
- 共通機能は既存の認証、Room同期、時間制限、デバッグ、戦績、リプレイ、広告、i18nモジュールを利用します。

## 生成後に必要な作業

1. `config/game-registry.json` へ登録する。
2. domain、room store、Command APIを実装する。
3. 日本語・英語辞書を追加する。
4. デバッグ時にダミー・CPUの手番で停止しないことを確認する。
5. `docs/NEW_GAME_CHECKLIST.md` に沿って監査する。
6. `npm run lint`、`npm test`、`npm run build` を実行する。

## 外部開発者へ渡す範囲

原則として、対象ゲームディレクトリ、ゲームSDKの公開インターフェース、仕様書、テスト環境だけを渡します。本番環境変数、DB接続情報、Redis、ユーザーデータ、管理画面は渡しません。
