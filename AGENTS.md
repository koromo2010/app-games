# App Games agent guide

このリポジトリを編集するAI・開発者は、最初に次を確認する。

1. `git status --short --branch`、repository、worktree、branch、HEAD
2. `docs/README.md` の読書順
3. `docs/DEVELOPMENT_EXECUTION_RULES.md` の許可・保存・証拠ルール
4. 作業に該当する現行資料とコード

会話履歴や `docs/DEVELOPMENT_THREAD_LOG.md` を現在仕様の正本にしない。既存差分は利用者の所有物として保持し、自分の作業に必要なファイルだけを変更する。

## 最優先原則

- 症状だけを隠す暫定対策で終えず、再現条件・根本原因・影響範囲を確認して共通境界で直す。
- 本番固有の再実装を作らず、devで検証した同じ実装をmainへ昇格する。
- ローカル修正、テスト、自分の差分だけのlocal checkpoint commitは、個別指示で禁止されていない限り進めてよい。
- Vercel Deploymentが起こり得る操作は環境別の明示許可を得る。dev許可をmain／productionへ流用しない。
- Vercelのcontrol planeをCloud Browserで開く、確認する、操作することは禁止する。必要時は承認済みのconnector／公式API／CLIを使い、Web UIでしか実施できない操作は`VERCEL_USER_ACTION_REQUIRED`としてユーザー手順を提示する。デプロイ済み製品runtime URLのbrowser検証はこの禁止と区別する。
- CI、Deployment、runtime結果は対象identityが一致した場合だけ証拠として採用する。`READY`はruntime PASSではない。
- secret、個人情報、ゲーム秘密情報をコード、Git、ログ、報告へ残さない。

## 必須アーキテクチャ境界

- ゲームからLLM事業者を直接呼ばず、`lib/game-llm.ts`を通す。APIキーをクライアントへ出さない。
- サーバーを正として認証、Command、フェーズ遷移、勝敗、永続化を処理する。request bodyのactor IDだけを本人証明にしない。
- UI、HTTP、純粋domain、時計、永続化を分離し、登録済みの共通コンポーネントと共通Runtimeを優先する。
- 全ゲームは`config/game-registry.json`を登録の正本とし、公開範囲や共通機能を別ファイルへ重複定義しない。
- 構造化ログは`lib/observability`の閉じたschemaを使い、Room本文や外部例外本文を直接consoleへ出さない。
- Vercel、DB、Redis、Blob、DNS、GitHub権限、外部API設定を扱う前に`docs/ENVIRONMENT_VARIABLES.md`と`config/environment-change-registry.json`を確認する。

詳細は次を正本とする。

- 実行、検証、保存、公開、証拠: `docs/DEVELOPMENT_EXECUTION_RULES.md`
- 現在状態と資料索引: `docs/README.md`、`docs/CURRENT_STATE.md`
- 現行仕様と主要ファイル: `docs/DEVELOPMENT_HANDOFF.md`
- 既知の不具合: `docs/KNOWN_ISSUES.md`
- SDK／Runtime境界: `docs/CHATGPT_GAME_SDK.md`、`docs/EXTERNAL_GAME_PACKAGE.md`
- モジュール境界: `docs/MODULAR_GAME_ARCHITECTURE.md`、`docs/UI_ARCHITECTURE.md`
- 外部設定: `docs/ENVIRONMENT_VARIABLES.md`
- durableな開発判断ログ: `docs/DEVELOPMENT_LOGGING.md`

新規ゲームまたはゲーム仕様変更では、`config/game-registry.json`と`docs/NEW_GAME_CHECKLIST.md`も確認する。お題DB、既出判定、問題再利用を変更する場合は`docs/TOPIC_HISTORY_DATABASE.md`も確認する。
