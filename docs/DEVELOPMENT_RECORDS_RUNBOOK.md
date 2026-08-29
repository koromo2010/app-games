# Development Records Runbook

`APPLIES_WHEN`: instruction、checkpoint、execution sheet、handoff、正式result、current pointer、耐久保存を扱うとき。

`DOES_NOT_APPLY`: taskの権限を追加するとき、実装・Git・Deployment手順を決めるとき、監査系列のartifactを定義するとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は実行正本から委任された記録手順であり、記録の作成や保存によって権限、禁止、task scope、成功条件を変えない。

## 1. 成果物の責任分離

| 成果物 | 所有する情報 |
| --- | --- |
| `NEXT_INSTRUCTION` | 目的、対象、authorization envelope、不変条件、成功条件、真の停止条件 |
| `CHECKPOINT` | 現在地、candidate、完了済み工程、外部write件数、未完了、再開点 |
| `EXECUTION_SHEET` | 承認が必要な一つの外部操作の対象、最大影響、事前条件、rollback |
| `RESULT` | terminal boundaryの結論と成功・停止の直接証拠 |
| `HANDOFF` | 最新instructionとcheckpointへの短い導線 |
| `TODO_DECISION` | 管理スレのintake判断 |

一つの事実を複数artifactへ複製しない。契約が変わらない進捗、承認待ち解除、内部phase進行、thread移行では`NEXT_INSTRUCTION`を改版しない。保存前の重複・混載検査には`scripts/check-development-artifact-policy.mjs`を使う。

`NEXT_INSTRUCTION`の直接policy参照は次の一つだけとし、サテライトを列挙しない。

```text
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ <product-commit>
```

## 2. 保存レベル

記録先は目的に応じて分ける。

- local worktree: 再生成可能な作業中差分
- product Git: 製品sourceと本repoの正本文書
- checkpoint repository: taskのimmutable instruction、checkpoint、result、current pointer
- Libraryまたは共有済み領域: Git正本でない利用者向け耐久artifact

repo-backedのsourceや文書を同じ内容でLibraryへ二重保存しない。secret、token、Cookie、接続文字列、Room codeはどの記録にも含めない。

新しい実行入口となる`NEXT_INSTRUCTION`は、所定のcheckpoint repositoryとpathへ新規immutable Markdownとして保存し、record commit、blob、path、内容をremote read-backしてから引き渡す。保存不能なら`INSTRUCTION_RECORD_UNSAVED / AT RISK`とし、チャット本文だけを正式な新入口として扱わない。

## 3. checkpointと復旧

remote未到達のままturnを終える場合は下記耐久checkpointを作り、少なくともtask、instruction identity、base、candidateまたは作業差分、完了済み工程、外部write件数、未完了、再開点を保存する。

- `RECOVERY_CHECKPOINT`: 同じ実行環境での短期再開に必要な最小記録
- `FULL_RECOVERY_CHECKPOINT`: workspaceやthreadを失っても正本から再構成できる完全記録

軽量checkpointは進捗損失を防ぐために作るが、fresh restoreはこの軽量checkpointごとには行わない。完全復旧性は重要な境界、candidate確定、外部write前後、handoff、terminal resultで検証する。

current pointerは最新の有効artifactを指す可変索引であり、履歴本文ではない。pointer更新前に対象recordとblobをremote read-backし、pointer更新後も参照先を再取得する。旧pointerや会話要約から条件を累積しない。

## 4. 正式result

正式resultを作るのは次のterminal boundaryだけとする。

- 成功条件を満たし、必要な証拠をread-backした`TASK_DONE`
- 許可済み内部回復では越えられない真の外部依存を立証した`EXTERNAL_BLOCKED`
- 利用者が明示的にtaskを中止・置換した

local candidate、test完了、checkpoint保存、push準備、`READY`、承認待ち、dev反映、runtime観測開始は正式resultの境界ではない。通常のGit push承認待ちもそれだけではterminal boundaryではない。Portal owner承認等の利用者専用操作が現在の依存点なら、残る成功条件と一操作を対応づけて`EXTERNAL_BLOCKED`を立証する。

resultは先に人間向け結論を示し、その後に証拠を置く。

1. 顧客または運用への結果
2. 完了した成功条件、または残る成功条件
3. 実行した外部writeと件数
4. 未検証事項と影響
5. rollbackまたは再開点
6. commit、tree、blob、record、Deployment等の技術証拠

## 5. 状態表記

タスクlife cycleは`TASK_ACTIVE`、`TASK_DONE`、`EXTERNAL_BLOCKED`の三つだけとする。

`READY`、`CANDIDATE_READY`、`PUSH_PENDING`、`DEPLOYED`、`OBSERVING`、`INTERNAL_RECOVERY_REQUIRED`、`RECOVERY_CHECKPOINT_SAVED`は`TASK_ACTIVE`中のmilestoneであり、それだけで所有権を手放さない。

状態行を使う場合は、主状態を一つだけ書き、milestoneと原因を別行にする。

```text
TASK_STATE: TASK_ACTIVE
MILESTONE: CANDIDATE_READY
NEXT: <next concrete action>
```

`CLOSED:YES`は`TASK_DONE`の証拠が揃った場合だけ、`CLOSED:NO`はactiveまたはblockedの補助表記として使う。曖昧な`DONE`、`STOPPED`、`WAITING`を主状態にしない。
