# 監査・監督スレッド運用ルール

この文書は、監査スレ、監査作業スレ、監督スレ、作業スレを分離し、監査結果の欠落・重複・誤昇格と、監査への責任委譲を防ぐための正本である。実行・保存・Git・Deploymentの一般規則は`DEVELOPMENT_EXECUTION_RULES.md`に従う。

## 0. 最上位原則: 監査なしで通常運用が完結する

監査は独立した追加の検知・再検証線であり、通常のT運用、修正、検証、結果判定、closeの前提条件または最終gateではない。

- 監査が未起動、停止、遅延、未完了、または一件も存在しなくても、監督スレと作業スレだけで全ての既存Tを完遂できなければならない。
- 監督スレは監査起点かどうかに関係なく、全ての既存Tについて成功条件を確認し、自分の責任で`TASK_DONE / CLOSED`を判定する。監査の確認待ち、監査不在、TA／CP未完了をTの停止・保留・close回避理由にしない。
- 監査スレはfinding、TA／CPを自分の責任で追跡・再検証・closeする。Tの状態判定を代行せず、既存Tをcloseまたはreopenしない。
- Tのcloseとfinding／TA／CPのcloseは別の状態であり、片方をもう片方へ自動伝播しない。
- 監督と監査は、相手の要約や判定へ自分の確認責任を委譲せず、相手の稼働を自分の進行gateにしない。

## 1. 役割と専有責務

### 監査スレ

監査スレは監査系列の判断者であり、次を専有する。

- 監査目的、対象、範囲、成功条件、非対象、TA／CPを固定した`AUDIT_INSTRUCTION`の発行
- 監査作業スレから返った`AUDIT_RESULT`のread-back、証拠確認、重複整理、既知／新規／再検証／未検証の判定
- `AUDIT_ACCEPTANCE`の発行
- 受理済みfindingから必要な新規Tを作成・採番し、監督スレの通常T系列へ渡すこと
- finding、TA／CPの再監査と最終close判断

監査スレは実装、runtime操作、Git ref更新、Deployment、migration、製品write、既存Tの優先順位・実装指示・状態変更・closeを行わない。監督スレへTA／CPの進行管理を委ねない。

### 監査作業スレ

監査作業スレは監査実行者であり、受理した`AUDIT_INSTRUCTION`の範囲で再現、read-only確認、許可済み検証、証拠取得、耐久checkpoint、`AUDIT_RESULT`作成を行う。途中の不都合は許可済み内部回復で解消し、真の停止条件まで同じ監査を所有する。

監査作業スレはTを作成・採番せず、findingの重複統合、優先順位、実装指示、Tまたは監査のcloseを決定しない。再監査では監督スレまたは作業スレの要約を成功証拠として信頼せず、固定されたsource、diff、ref／Deployment identity、test・runtime結果を直接取得またはread-backする。

### 監督スレ

監督スレは全ての既存Tを、起票経路に関係なく同じ通常T系列で管理する。担当は現在地、優先順位、依存関係、owner、反映順、結果判定、次指示、close判断である。

- 監督スレは新規Tを作成・採番しない。
- 監査起点Tか、利用者・作業・不具合報告等の非監査起点Tかで、完遂責任、成功条件の確認、close基準を弱めない。
- 監査スレの確認へTの結果判定を委ねず、自分が取得・read-backしたTの正本証拠で`TASK_DONE / CLOSED`を判定する。
- 監査の開始、再開、停止、範囲、頻度、TA／CPの状態を指示または変更しない。
- 監査から`AUDIT_ACCEPTANCE`と新規Tが届いた場合だけ通常T系列へ受け入れ、以後は他のTと同じく独立して完遂する。
- 監査記録をTの証拠として参照できるが、finding、TA／CP自体を書き換えたりcloseしたりしない。
- 未受理finding、途中checkpoint、ファイル名だけの報告から新規T、優先順位、完了を推定しない。

### 作業スレ

作業スレは、監督スレが示した既存Tの目的、権限、不変条件、成功条件、真の停止条件の中で実装と検証を完遂する。監査の稼働や確認を待たず、通常Tの成功条件または真の停止条件まで進める。監査の受理、TA／CPの状態変更、新規T採番は行わない。

## 2. 監査内部の崩れない受け渡し

監査内部の正式な受け渡しは、次の三つのimmutable Markdownを順に作る。

1. `AUDIT_INSTRUCTION`: 監査スレが発行する。監査ID、対象identity、目的、範囲、非対象、許可、禁止、成功条件、真の停止条件、必要証拠を固定する。
2. `AUDIT_RESULT`: 監査作業スレが作る。参照したinstructionのpath、record commit、blob SHAを記載し、実行identity、実施内容、証拠、未実施、findingを返す。
3. `AUDIT_ACCEPTANCE`: 監査スレがresultをremote read-backして作る。resultのpath、record commit、blob SHAを固定し、各findingを`NEW`、`KNOWN`、`DUPLICATE`、`RETESTED`、`UNCONFIRMED`のいずれかに分類する。新規Tを作る場合はここでだけ採番し、findingとの対応を記録する。

前段artifactを後段で上書きしない。訂正は新しいpathの後続artifactとして作り、置換対象と理由を記載する。チャット本文、画面表示、ファイル名だけ、local fileだけでは正式受け渡しにならない。各artifactはcheckpoint repository上のrecord commit、blob SHA、path、内容をremote read-backして初めて有効とする。

`AUDIT_RESULT`提出は監査完了を意味しない。`AUDIT_ACCEPTANCE`がない状態は`AUDIT_RESULT_SUBMITTED`であり、新規Tとして監督スレまたは作業スレへ渡さない。ただし、これは監査系列内部のgateであり、既に存在する通常Tの進行やcloseには影響しない。

## 3. AUDIT_RESULTの必須区分

resultはfindingを必ず次の四区分に分ける。

- `KNOWN_FINDINGS`: 監査開始前から登録済みの問題
- `NEW_FINDINGS`: 今回初めて確認した問題
- `RETEST_RESULTS`: 既知findingの再検証結果
- `NOT_TESTED`: 範囲外、依存未成立、時間切れ等で実施していない項目

各findingには少なくとも次を含める。

```text
FINDING_ID
FIRST_SEEN
ENVIRONMENT / REF / DEPLOYMENT
REPRODUCTION
EXPECTED
ACTUAL
EVIDENCE
RELATED_FINDING / RELATED_T
STATUS
```

- `NOT_TESTED`をPASSまたは問題なしへ読み替えない。
- 既知findingを新規件数へ再計上しない。
- 症状が似ているだけでfindingを統合せず、原因または再現・証拠の一致を示す。
- 証拠不足は`UNCONFIRMED`とし、成功・失敗・重複を推定しない。
- 監査作業スレは関連候補を記載できるが、既存Tへの統合や新規T採番を確定しない。

## 4. 独立したcloseと再監査

- 監督スレは、通常Tの正本証拠と成功条件に基づきTをcloseする。監査の再確認を待たず、監査へ最終判定を依頼しない。
- 監査スレは、必要と判断した時点で対象source、diff、ref／Deployment identity、test・runtime結果を独立再取得し、finding、TA／CPを`FIX_VERIFIED / AUDIT_CLOSED`または継続状態にする。
- Tがcloseしても、対応finding、TA／CPは自動closeしない。finding、TA／CPがcloseしても、対応Tは自動closeしない。
- T close後の独立再監査で問題が残っていた場合、監査スレは既存Tをreopenせずfindingを継続する。必要な修正作業がなく、activeな対応Tもない場合は、新規Tを作成・採番して監督スレへ渡す。
- 監査が再監査を行わない、または完了しない場合でも、T系列は既に監督スレの責任で完結しており、通常運用を停止しない。

## 5. checkpointと正式報告

保存頻度、`RECOVERY_CHECKPOINT`と`FULL_RECOVERY_CHECKPOINT`の境界、remote read-backは`DEVELOPMENT_EXECUTION_RULES.md`第9節をそのまま使い、この文書へ別の保存手順を作らない。監査checkpointへ追加する固有情報は監査ID、対象identity、証拠所在地だけとする。

checkpointは復旧用であり、`AUDIT_RESULT`または`AUDIT_ACCEPTANCE`ではない。checkpoint到達だけで監査を止めず、途中checkpointを監督スレが正式報告として受理しない。

## 6. 二本の正規flow

```text
通常T系列（監査なしで完結）
  既存T
    → 監督スレが目的・優先順位・成功条件を管理
    → 作業スレが実装・検証
    → 監督スレが正本証拠を確認
    → TASK_DONE / CLOSED

監査系列（独立した追加線）
  監査スレが AUDIT_INSTRUCTION / TA・CP を発行
    → 監査作業スレが checkpointを取りながら監査
    → AUDIT_RESULT
    → 監査スレがremote read-back・重複整理
    → AUDIT_ACCEPTANCE
    → findingを継続／AUDIT_CLOSED、または必要な新規Tを通常T系列へ渡す
```

二本のflowはartifact IDで相互参照するが、相手の稼働、進捗、closeを待つ直列flowにしない。監査作業スレから作業スレへfindingを直送せず、監督スレから監査スレへ監査の開始・再開・停止を指示しない。利用者の明示判断はいつでも範囲を狭められるが、各スレが別の役割を代行したことにはしない。
