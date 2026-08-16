# App Games agent guide

このリポジトリを編集するAI・開発者は、最初に次を確認する。

1. `git status --short --branch`、repository、worktree、branch、HEAD
2. `docs/README.md` の読書順
3. `docs/DEVELOPMENT_EXECUTION_RULES.md` の許可・保存・証拠ルール
4. 作業に該当する現行資料とコード
5. tool、schema、response解析で詰まった場合だけ`docs/AI_EXECUTION_TROUBLESHOOTING.md`

会話履歴や `docs/DEVELOPMENT_THREAD_LOG.md` を現在仕様の正本にしない。既存差分は利用者の所有物として保持し、自分の作業に必要なファイルだけを変更する。

## 最優先原則

- 一度受理したタスクは、成功条件を満たすか、許可済み内部回復では解消できない真の外部依存へ到達するまで実行側が所有する。途中の失敗、確認、手段変更、承認待ち、dev反映、観測、修正は同じタスクの内部進捗であり、所有権を利用者や監督へ戻す完了報告、次指示、再承認の理由にしない。新しい指示または承認が必要なのは、対象範囲、権限、固定済みwrite対象または不可逆性が実質的に変わる場合だけである。
- 第一目的は、許可範囲内でタスクの成功条件を満たすことである。停止、報告、証拠作成を完遂の代替成果にしない。安全規則はその中で完遂するための境界として扱う。
- 症状だけを隠す暫定対策で終えず、再現条件・根本原因・影響範囲を確認して共通境界で直す。
- tool名、schema、response path、parser等の解析問題だけで正式停止せず、sourceと契約を確認して同じ作業内で直す。
- タスク指示は目的、権限、不変条件、成功条件、真の停止条件を固定し、実行方法を固定しない。選んだ方法が失敗しても、同じ権限内で再計画し、成果または真の外部境界まで進める。
- devは利用者が早く触って学ぶための検証面である。不可逆な外部効果がなく、candidate・差分・rollback先を固定できる変更は、実装、最短の関連check、承認済みdev反映、観測、forward fixまたはrollbackを同じタスクのfeedback loopとして進める。test、lint、buildの全完了をdev pushの一律条件にせず、main／production昇格前に必要な全gateを満たす。
- 利用者操作は利用者だけが実行できる能力が現在必要な場合に限る。実行側の環境や未検証手順の代替にせず、依頼前に実行側で可能な準備と検証を完了する。
- 利用者に、実行側が生成したSHAや長い承認文を転記・復唱させない。実行側が対象と影響を実行シートへ固定し、利用者は直前の一意な実行シートを短い自然文で承認できる。
- 本番固有の再実装を作らず、devで検証した同じ実装をmainへ昇格する。
- ローカル修正、テスト、自分の差分だけのlocal checkpoint commitは、個別指示で禁止されていない限り進めてよい。
- 製品repositoryへのpush／ref更新は、Deploymentの有無にかかわらず対象refとcommitを特定した利用者の明示承認を得る。
- Vercel Deploymentが起こり得る操作は環境別の明示許可を得る。dev許可をmain／productionへ流用しない。
- Vercelへログインせず資格情報を使わない公開read-only確認と、デプロイ済み製品runtimeの検査は行ってよい。認証済みVercel control planeの閲覧・操作は利用者専用とする。
- CI、Deployment、runtime結果は対象identityが一致した場合だけ証拠として採用する。`READY`はruntime PASSではない。
- 正式resultは、タスク全体の完了、真の外部blocker、Portal owner承認待ち、または利用者の明示要求に限定する。内部phase、解析修正、通常のGit push承認待ちだけでは作らない。
- 停止する場合は、許可済みの内部回復では解消できない証拠、現在必要な外部依存、次の一操作を示す。立証できない停止は`INTERNAL_RECOVERY_REQUIRED`として同じ指示を続行する。
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
- 実行時の自己回復: `docs/AI_EXECUTION_TROUBLESHOOTING.md`
- 現在状態と資料索引: `docs/README.md`、`docs/CURRENT_STATE.md`
- 現行仕様と主要ファイル: `docs/DEVELOPMENT_HANDOFF.md`
- 既知の不具合: `docs/KNOWN_ISSUES.md`
- SDK／Runtime境界: `docs/CHATGPT_GAME_SDK.md`、`docs/SDK_HANDSHAKE.md`、`sdk/entry/START_GAME_FIELDS.md`、`sdk/entry/START_CLAUDE_CODE.md`、`docs/EXTERNAL_GAME_PACKAGE.md`
- モジュール境界: `docs/MODULAR_GAME_ARCHITECTURE.md`、`docs/UI_ARCHITECTURE.md`
- 外部設定: `docs/ENVIRONMENT_VARIABLES.md`
- durableな開発判断ログ: `docs/DEVELOPMENT_LOGGING.md`

新規ゲームまたはゲーム仕様変更では、`config/game-registry.json`と`docs/NEW_GAME_CHECKLIST.md`も確認する。お題DB、既出判定、問題再利用を変更する場合は`docs/TOPIC_HISTORY_DATABASE.md`も確認する。
