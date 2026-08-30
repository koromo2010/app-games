# App Games agent guide

最初にrepository、remote、worktree、branch、HEAD、dirty差分を確認し、利用者の既存差分を保持する。会話履歴や`docs/DEVELOPMENT_THREAD_LOG.md`を現在仕様の正本にしない。

## 実行入口

- 新しいthread／workspaceで最初のtaskを受理するとき、承認済みpolicy変更が通知されたとき、またはpolicy identityが不明なときだけ、`origin/develop:docs/DEVELOPMENT_EXECUTION_RULES.md`をremote read-backする。同時に観測した`origin/develop`のexact commitを`POLICY_APPLIED`にし、同じtaskの連続turnでは再利用する。commitとpathでpolicy bytesを一意に取得できるためhistory探索や別blob fieldは使わず、未反映のlocal candidateや作業branchを承認済みpolicyとして使わない。
- 作業別の仕様は`docs/README.md`から探す。全資料、`CURRENT_STATE.md`、`DEVELOPMENT_HANDOFF.md`を毎回通読しない。
- 認証済みVercel control planeは利用者専用とする。AIは資格情報を使わない公開read-only情報と、デプロイ済み製品runtimeだけを検査できる。

## 必須アーキテクチャ境界

- ゲームからLLM事業者を直接呼ばず、`lib/game-llm.ts`を通す。APIキーをclientへ出さない。
- serverを正として認証、Command、phase遷移、勝敗、永続化を処理する。request bodyのactor IDだけを本人証明にしない。
- UI、HTTP、純粋domain、時計、永続化を分離し、登録済みの共通componentとRuntimeを優先する。
- 全ゲームは`config/game-registry.json`を登録の正本とし、公開範囲や共通機能を重複定義しない。
- 構造化ログは`lib/observability`の閉じたschemaを使い、Room本文や外部例外本文を直接consoleへ出さない。
- Vercel、DB、Redis、Blob、DNS、GitHub権限、外部API設定を扱う場合は`docs/ENVIRONMENT_VARIABLES.md`と`config/environment-change-registry.json`の該当箇所を確認する。

システム全体の地図は`docs/SYSTEM_MAP.md`、現在仕様・作業別資料の入口は`docs/README.md`を使う。新規ゲームでは`docs/NEW_GAME_CHECKLIST.md`、SDKでは`docs/CHATGPT_GAME_SDK.md`、`docs/SDK_HANDSHAKE.md`、`sdk/entry/START_GAME_FIELDS.md`、`sdk/entry/START_CLAUDE_CODE.md`の該当箇所を確認する。
