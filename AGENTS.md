# App Games agent guide

このrepositoryで作業するAI・開発者は、最初にrepository、remote、worktree、branch、HEAD、dirty差分を確認し、利用者の既存差分を保持する。会話履歴や`docs/DEVELOPMENT_THREAD_LOG.md`を現在仕様の正本にしない。

## 実行入口

- 許可、タスク所有権、成果物の使い分け、保存、検証、Git、Deployment、停止・完了判定は`docs/DEVELOPMENT_EXECUTION_RULES.md`を唯一の実行正本とする。
- 作業別の追加資料は`docs/README.md`から今回に該当するものだけを読む。全資料、`CURRENT_STATE.md`、`DEVELOPMENT_HANDOFF.md`を毎回通読しない。
- 監査、TA／CP、監督との受け渡しを実際に扱う場合だけ`docs/AUDIT_THREAD_RULES.md`を読む。
- tool、schema、response解析、browser経路、または利用者PC向けhelper／PowerShellで詰まった場合だけ`docs/AI_EXECUTION_TROUBLESHOOTING.md`を読む。

## 変更してはいけない境界

- 一度受理したタスクは`docs/DEVELOPMENT_EXECUTION_RULES.md`のlife cycleに従って完遂する。checkpoint、内部failure、承認待ち、解析修正を新しいタスクや正式resultへ変換しない。
- developmentの可逆な内部手段は同書の禁止リスト方式で扱う。main／production、製品repositoryのref更新、Deployment、DB／Redis／Blob／OAuth／DNS／環境変数等の外部writeは、対象を固定した利用者の明示承認なしに行わない。devの許可をmain／productionへ流用しない。
- Vercelの認証済みcontrol planeは利用者専用とする。資格情報を使わない公開read-only情報と、デプロイ済み製品runtimeの検査だけをAIが行える。
- secret、個人情報、Room code、ゲーム秘密情報をコード、Git、checkpoint、ログ、報告へ残さない。

## 必須アーキテクチャ境界

- ゲームからLLM事業者を直接呼ばず、`lib/game-llm.ts`を通す。APIキーをclientへ出さない。
- serverを正として認証、Command、phase遷移、勝敗、永続化を処理する。request bodyのactor IDだけを本人証明にしない。
- UI、HTTP、純粋domain、時計、永続化を分離し、登録済みの共通componentとRuntimeを優先する。
- 全ゲームは`config/game-registry.json`を登録の正本とし、公開範囲や共通機能を重複定義しない。
- 構造化ログは`lib/observability`の閉じたschemaを使い、Room本文や外部例外本文を直接consoleへ出さない。
- Vercel、DB、Redis、Blob、DNS、GitHub権限、外部API設定を扱う場合は`docs/ENVIRONMENT_VARIABLES.md`と`config/environment-change-registry.json`の該当箇所を確認する。

システム全体の地図は`docs/SYSTEM_MAP.md`、現在仕様・作業別資料の入口は`docs/README.md`を使う。新規ゲームでは`docs/NEW_GAME_CHECKLIST.md`、SDKでは`docs/CHATGPT_GAME_SDK.md`、`docs/SDK_HANDSHAKE.md`、`sdk/entry/START_GAME_FIELDS.md`、`sdk/entry/START_CLAUDE_CODE.md`の該当箇所を確認する。
