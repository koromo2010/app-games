# Development Records Runbook

`APPLIES_WHEN`: task contract、current status、approval request、final result、current pointer、耐久保存を扱うとき。

`DOES_NOT_APPLY`: 権限、task state、停止条件、実装・Git・Deployment手順、監査artifactを決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は正本が決めた四つの役割を保存・復旧する方法だけを定める。記録によってtask contract、権限、stateを変更しない。

## 1. 記録単位

| 役割 | 保存する内容 | 既存label |
| --- | --- | --- |
| `TASK_CONTRACT` | 目的、対象、authorization、不変条件、成功・停止条件 | `NEXT_INSTRUCTION` |
| `CURRENT_STATUS` | 現在地、candidate、完了工程、外部write件数、未完了、再開点 | `CHECKPOINT` |
| `APPROVAL_REQUEST` | 承認対象の一つのlogical change、最大影響、事前条件、rollback | `EXECUTION_SHEET` |
| `FINAL_RESULT` | 正本が判定したterminal state／dispositionと直接証拠 | `RESULT` |

同じ事実を複数の役割へ複製しない。契約が変わらない進捗、承認待ち解除、内部phase、thread移行では`TASK_CONTRACT`を改版しない。`HANDOFF`は`TASK_CONTRACT_POINTER`と`CURRENT_STATUS_POINTER`だけを持ち、第五の情報所有者にしない。

各記録には実際に適用したpolicy観測commitを一つだけ記載する。canonical locatorはremote read-backした`origin/develop:docs/DEVELOPMENT_EXECUTION_RULES.md`であり、commitとpathからpolicy bytesを取得するためhistory探索や別blob fieldは使わない。新しいthread／workspaceの初回、承認済みpolicy変更の通知時、またはidentity不明時だけ確認する。同じ`TASK_ACTIVE`で確認済みのidentityはそのまま再利用し、連続turn、内部retry、checkpoint、承認後再開、record作成、製品commitの前進だけをremote再確認の契機にしない。

```text
POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ <product-commit>
```

旧`POLICY_REFERENCE`は発行時の履歴として保持できるが、新しい権限やpolicy freezeを意味しない。重複・混載検査には`scripts/check-development-artifact-policy.mjs`を使う。

本policy反映前のimmutable recordは上書き・一括移行せず、`LEGACY_READ_ONLY`の履歴として保持する。これはtask stateではなく保存上の区分である。validatorは反映後に新規作成するrecordのsave gateとし、legacy recordの直接証拠を遡及的に無効化しない。legacyから再開するときはtask contractを再発行せず、最初の新しい`CURRENT_STATUS`へexact `POLICY_APPLIED`を記録する。

新規artifactは`ARTIFACT_TYPE`を一つだけ持つ。validatorは権限・対象・停止・承認・terminal境界と役割混載だけを検査し、進捗、結果、証拠の文章表現を固定しない。

| 役割 | 最小field |
| --- | --- |
| `TASK_CONTRACT` | `TARGET`、`AUTHORIZATION`または`ALLOWED_PRODUCT_WRITES`＋`FORBIDDEN_EFFECTS`、`SUCCESS_CONDITION`、`TRUE_STOP_CONDITIONS` |
| `CURRENT_STATUS` | `TASK_CONTRACT_POINTER`または`TASK_CONTRACT_IDENTITY` |
| `APPROVAL_REQUEST` | §4の六field |
| `FINAL_RESULT` | `TERMINAL_DISPOSITION` |

## 2. 保存先

- local worktree: 再生成可能な作業中差分
- product Git: 製品sourceと本repositoryの正本文書
- checkpoint repository: immutable task recordとcurrent pointer
- Libraryまたは共有済み領域: Git正本でない利用者向け耐久artifact

repo-backedのsourceや文書を同じ内容でLibraryへ二重保存しない。secret、token、Cookie、接続文字列、Room codeを保存しない。

checkpoint repositoryの正規位置は次に固定する。

- repository: `koromo2010/app-games-checkpoints`
- branch: `ops/game-fields-supervisor-records-20260803`
- immutable Markdown: `docs/gpt-save/`
- task current pointer: `tasks/<task-id>/current.json`

記録本文は既存pathを上書きせず、`docs/gpt-save/`へ新規immutable Markdownとして保存する。current pointerだけは、remote read-back済みの最新recordを指す可変索引として更新できる。repository、branch、path、record commit、blob、内容をremote read-backしてから引き渡す。

新しい`TASK_CONTRACT`を保存できない場合は`INSTRUCTION_RECORD_UNSAVED / AT RISK`とし、チャット本文だけを正式な新入口として扱わない。

## 3. Status checkpointと復旧

remote未到達のままturnを終える場合、または再生成困難な進捗が最後の耐久保存から約10分以上remote未到達のまま蓄積した場合は、`CURRENT_STATUS`を軽量checkpointとして保存する。最低限、task、contract identity、base、candidateまたは差分、完了工程、外部write件数、未完了、再開点を含める。

旧labelとの互換上、軽量な`CURRENT_STATUS`を`RECOVERY_CHECKPOINT`、完全復旧artifactを伴うものを`FULL_RECOVERY_CHECKPOINT`と表記できる。どちらも新しいstateや第五の成果物役割ではない。

約10分はデータ損失を防ぐ契機であり、task停止、承認失効、正式result、bundle作成の契機ではない。read-only確認、再生成可能な中間出力、同じ意味のretryだけでcheckpointを増やさない。

完全復旧artifactを作るのは、canonical remoteとcurrent statusだけでは空のworkspaceから同じcandidateまたは未反映作業を再構成できない場合だけである。その場合は不足する最小artifact、manifest、hash、復旧手順を保存し、空のworkspaceからidentity一致を確認する。exact commitや必要blobがcanonical remoteにあり再取得を確認できる場合は、重複bundleを作らない。

current pointer更新前に参照先recordとblobをremote read-backし、更新後もpointerから同じ内容を再取得する。旧pointerや会話要約から条件を累積しない。

## 4. Approval requestとfinal resultの表示

approval requestは利用者が判断する一つのlogical changeだけを対象にし、次の構造化fieldを一つずつ示す。tool callごとに分割せず、最大影響内で事前に明示した決定的な自動配備、read-back、health確認、rollbackは同じ承認へ含められる。独立して選択可能な別writeは別承認にする。直前のrequestを一意に特定でき、environment、対象、最大影響が変わらない場合は短い自然文で承認でき、固定文言を要求しない。契約が変わらなければ新しいtask contractを作らない。

```text
OPERATION: <one logical change>
SEMANTIC_ENVIRONMENT: <environment>
TARGET_IDENTITY: <exact target>
MAXIMUM_EXTERNAL_EFFECT: <maximum effect and count>
PRECONDITIONS: <required checks or NONE>
ROLLBACK: <method or NOT_AVAILABLE with reason>
```

final resultは正本がterminal state／dispositionを判定した場合だけ保存し、次のいずれかを一つ記録する。

```text
TERMINAL_DISPOSITION: TASK_DONE | EXTERNAL_BLOCKED | USER_CANCELED | SUPERSEDED:<replacement>
```

`TASK_ACTIVE`、milestone、approval待ちをterminal dispositionにしない。先に次を自然文で示し、その後に技術証拠を置く。

旧状態表記との互換上、`CLOSED:YES`は`TASK_DONE`の直接証拠が揃った場合だけ、`CLOSED:NO`は`TASK_ACTIVE`または`EXTERNAL_BLOCKED`の補助表記として使う。`DONE`、`STOPPED`、`WAITING`を独立した主stateにしない。

1. 顧客または運用への結果
2. 満たした、または残る成功条件
3. 実行した外部writeと件数
4. 未検証事項と影響
5. rollbackまたは再開点
6. commit、tree、blob、record、Deployment等の証拠

local candidate、test完了、checkpoint保存、approval待ち、`READY`、dev反映、runtime観測開始をfinal resultへ変換しない。
