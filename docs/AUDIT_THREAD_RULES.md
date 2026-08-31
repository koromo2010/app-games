# 監査・管理・監督runbook

`APPLIES_WHEN`: 監査スレ、監査作業スレ、管理スレ、監督スレ、finding、TA／CP、TODO／Tの受け渡しを扱うとき。

`DOES_NOT_APPLY`: 通常taskの権限、state、実装・検証・Git・Deployment・保存方法を決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は役割と二本のflowだけを定める。通常T系列は監査なしで完結し、監査系列は独立した追加の検知・再検証線として動く。

## 1. 二本のflow

```text
通常T系列
  利用者要求／通常報告／不具合報告／受理済みfinding
    -> 管理: intake・登録・priority
    -> 監督: task contract・証拠判定
    -> 作業: 実装・検証
    -> 監督: technical close
    -> 管理: ledger同期

監査系列
  監査: AUDIT_INSTRUCTION
    -> 監査作業: 独立検証・AUDIT_RESULT
    -> 監査: AUDIT_ACCEPTANCE・finding close
    -> 行動が必要な受理済みfindingだけ管理intakeへ
```

二本はartifact IDで参照できるが、相手の起動、進捗、closeを待つ直列flowにしない。監査が未起動、停止、遅延、未完了、または存在しなくても通常T系列を完遂する。Tのcloseとfinding／TA／CPのcloseを自動伝播しない。

## 2. 責任の一意な所有者

| 役割 | 所有する判断 | 所有しない判断 |
| --- | --- | --- |
| 管理 | intake、`NO_ACTION / ABSORB / NEW_T_REQUIRED`、T採番、priority、owner、依存、実行順、ledger | task authorization、技術的成功条件、実装、証拠判定、technical close、finding close |
| 監督 | 登録済みTのtask contract、成功・停止条件、証拠受理、technical close | intake、T採番、priority、owner、監査の開始・範囲・close |
| 作業 | task contract内の実装、検証、内部回復 | intake、採番、ledger、technical close、finding判定 |
| 監査 | 監査範囲、finding分類、TA／CP、監査受理・再検証・close | TODO化、T採番、priority、実装、既存Tのclose／reopen |
| 監査作業 | `AUDIT_INSTRUCTION`内の検証、証拠、`AUDIT_RESULT` | finding受理・統合、TODO化、T操作、監査close |

別roleの要約を自分の判断の代わりにせず、各ownerがcanonical source、identity、test、runtime等の直接証拠をread-backする。未登録報告や途中checkpointを監督がTへ変換せず、未受理findingを管理が正式intakeへ変換しない。

ルール保守の権限は本書で再定義せず、実行正本の所有権境界をそのまま使う。

## 3. 通常T系列の受け渡し

管理は各intakeを一度だけ`TODO_DECISION`として保存する。

```text
SOURCE: <利用者要求またはremote read-back済みartifact>
DECISION: NO_ACTION | ABSORB:<existing-T> | NEW_T_REQUIRED
REASON: <why>
PRIORITY / OWNER / DEPENDENCIES / ORDER
```

`NEW_T_REQUIRED`なら管理が採番・登録し、監督へsource pointerを渡す。登録後は新しい監査やTODO判断を待たず、監督と作業で継続する。監督のtechnical close後、管理は結論を再判定せずledgerへ同期する。

監督はtask開始時にcontractを一度固定し、作業は成功条件と直接証拠が揃うまで同じ`TASK_ACTIVE`で内部回復する。通常Developmentの途中phase、tool failure、利用者操作待ち、ref前進を監督handoffへ変換しない。作業は完了時に一つのacceptance packetだけを渡し、監督はpacketが示すcanonical sourceと証拠identityを一度read-backしてtechnical closeを判定する。同じruntime操作・test・証拠収集の再実行や利用者の追加承認を前提にしない。保護対象operation、利用者判断が必要な仕様分岐、証拠不一致だけは実行正本のdecision kernelへ返す。

同じintakeの再掲、途中経過、checkpoint、監督の技術判定を新しい`TODO_DECISION`にしない。通常報告を監査経由へ迂回させない。

## 4. 監査系列の受け渡し

監査内部では次の三つだけを順に新規immutable recordとして作る。

1. `AUDIT_INSTRUCTION`: `AUDIT_ID`、対象identity、目的、範囲、非対象、許可、禁止、成功条件、`TRUE_STOP_CONDITIONS`、必要証拠
2. `AUDIT_RESULT`: `AUDIT_ID`、instruction identity、実行identity、実施内容、証拠、未実施、finding
3. `AUDIT_ACCEPTANCE`: `AUDIT_ID`、result identityと、各findingの`NEW / KNOWN / DUPLICATE / RETESTED / UNCONFIRMED`分類

resultはfindingを`KNOWN_FINDINGS / NEW_FINDINGS / RETEST_RESULTS / NOT_TESTED`に分け、各findingへ`FINDING_ID`、`FIRST_SEEN`、環境・ref／Deployment、再現、expected、actual、evidence、関連finding／T、statusを記載する。`NOT_TESTED`をPASSにせず、症状だけで統合せず、証拠不足は`UNCONFIRMED`とする。

前段recordを上書きしない。訂正は置換対象を示す後続recordとし、record commit、blob、path、内容をremote read-backして有効化する。`AUDIT_RESULT`提出だけでは監査受理ではなく、行動判断が必要な`AUDIT_ACCEPTANCE`だけを管理intakeへ渡す。

旧labelとの互換上、`AUDIT_RESULT_SUBMITTED`、`FIX_VERIFIED`、`AUDIT_CLOSED`を監査milestoneとして表記できるが、task stateやTのcloseへ変換しない。

## 5. Closeと記録

- 監督は通常Tの成功条件と直接証拠でtechnical closeを判定し、監査確認を待たない。
- 管理はtechnical closeをledgerへ同期し、独自にcloseまたはreopenしない。
- 監査は独立再検証でfinding／TA／CPをcloseし、既存Tをcloseまたはreopenしない。
- T close後に問題が残れば、監査はfindingを継続し、受理済みartifactを新しい管理intakeへ渡す。

checkpoint、current pointer、remote read-back、result保存は[`DEVELOPMENT_RECORDS_RUNBOOK.md`](./DEVELOPMENT_RECORDS_RUNBOOK.md)を使い、本書へ別の保存規則を作らない。checkpointは復旧用であり、`AUDIT_RESULT`、`AUDIT_ACCEPTANCE`、`TODO_DECISION`の代わりにしない。

## 6. Rule maintenance

ルール変更の権限は実行正本から得る。監督、監査、監査作業、作業スレは正本、runbook、実行入口、強制検査を変更せず、問題と期待効果だけを管理へ報告する。管理も通常時は候補整理だけを行い、利用者が独立したルール保守を明示的に開始した場合だけlocal candidateを作る。

candidateには変更理由、既存原則では防げない理由、適用範囲、削除・統合する旧規則、開発速度への影響、差分を示す。新規規則は複数taskで再利用できるfailure classに限り、個別taskの事情はtask contractへ残す。

通常taskの承認をルール保守candidateの作成やremote反映へ流用せず、remote反映は実行正本が要求する別の利用者承認まで行わない。
