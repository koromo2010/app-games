# 監査・監督スレッド運用ルール

この文書は、監査スレ、監査作業スレ、監督スレ、作業スレを分離し、監査結果の欠落・重複・誤昇格を防ぐための正本である。実行・保存・Git・Deploymentの一般規則は`DEVELOPMENT_EXECUTION_RULES.md`に従う。

## 1. 役割と専有責務

### 監査スレ

監査スレは監査の判断者であり、次を専有する。

- 監査目的、対象、範囲、成功条件、非対象、TA／CPを固定した`AUDIT_INSTRUCTION`の発行
- 監査作業スレから返った`AUDIT_RESULT`のread-back、証拠確認、重複整理、既知／新規／再検証／未検証の判定
- `AUDIT_ACCEPTANCE`の発行、監査起点の新規Tの作成・採番
- 監査起点Tの修正後再監査、finding・TA／CP・Tの最終close判断

監査スレは実装、runtime操作、Git ref更新、Deployment、migration、製品writeを行わない。

### 監査作業スレ

監査作業スレは実行者であり、受理した`AUDIT_INSTRUCTION`の範囲で再現、read-only確認、許可済み検証、証拠取得、耐久checkpoint、`AUDIT_RESULT`作成を行う。途中の不都合は許可済み内部回復で解消し、真の停止条件まで同じ監査を所有する。

監査作業スレはTを作成・採番せず、findingの重複統合、優先順位、実装指示、監査closeを決定しない。再監査では監督スレまたは作業スレの要約を成功証拠として信頼せず、固定されたsource、diff、ref／Deployment identity、test・runtime結果を直接取得またはread-backする。

### 監督スレ

監督スレは、監査スレが`AUDIT_ACCEPTANCE`で受理しTとして登録した項目だけを管理する。担当は既存Tの現在地、優先順位、依存関係、owner、反映順、実装修正の結果確認である。監査起点Tでは、実装結果を`READY_FOR_REAUDIT`として監査スレへ返すところまでを担当する。

- 監督スレは新規Tを作成・採番しない。
- 監査スレから受理済み`AUDIT_ACCEPTANCE`が届く前にTA／CPを採番、変更、close、実装指示へ転用しない。
- 受理後もTA／CPの監査記録自体は書き換えず、受理済みTへの参照として扱う。
- 監査起点Tを自分の判断で`CLOSED`にしない。修正commit、対象ref／Deployment、実施check、残る未検証を監査スレへ返し、`READY_FOR_REAUDIT`とする。
- 未受理finding、途中checkpoint、ファイル名だけの報告からT、優先順位、完了を推定しない。

### 作業スレ

作業スレは、監督スレが示した既存Tの目的、権限、不変条件、成功条件、真の停止条件の中で実装と検証を完遂する。監査の受理、TA／CPの状態変更、新規T採番は行わない。

## 2. 崩れない受け渡し

監査の正式な受け渡しは、次の三つのimmutable Markdownを順に作る。

1. `AUDIT_INSTRUCTION`: 監査スレが発行する。監査ID、対象identity、目的、範囲、非対象、許可、禁止、成功条件、真の停止条件、必要証拠を固定する。
2. `AUDIT_RESULT`: 監査作業スレが作る。参照したinstructionのpath、record commit、blob SHAを記載し、実行identity、実施内容、証拠、未実施、findingを返す。
3. `AUDIT_ACCEPTANCE`: 監査スレがresultをremote read-backして作る。resultのpath、record commit、blob SHAを固定し、各findingを`NEW`、`KNOWN`、`DUPLICATE`、`RETESTED`、`UNCONFIRMED`のいずれかに分類する。新規Tを作る場合はここでだけ採番し、findingとの対応を記録する。修正後の再監査では`FIX_VERIFIED`または`REOPENED`を判定し、`FIX_VERIFIED`のときだけ監査起点のfinding・TA／CP・Tをcloseする。

前段artifactを後段で上書きしない。訂正は新しいpathの後続artifactとして作り、置換対象と理由を記載する。チャット本文、画面表示、ファイル名だけ、local fileだけでは正式受け渡しにならない。各artifactはcheckpoint repository上のrecord commit、blob SHA、path、内容をremote read-backして初めて有効とする。

`AUDIT_RESULT`提出は監査完了を意味しない。`AUDIT_ACCEPTANCE`がない状態は`AUDIT_RESULT_SUBMITTED`であり、監督スレや作業スレへ渡さない。

監督スレの`READY_FOR_REAUDIT`は再監査の開始条件であり、修正成功の証拠でもclose条件でもない。監査スレは元のfinding・T・修正identityを参照する新しい`AUDIT_INSTRUCTION`を発行し、監査作業スレの新しい`AUDIT_RESULT`を受け、別の`AUDIT_ACCEPTANCE`で最終判定する。

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

## 4. checkpointと正式報告

再取得困難な外部responseは取得直後、監査状態は意味のある節目、risk boundary、遅くとも約10分ごとに新規immutable checkpointへ保存し、remote read-back後に続行する。checkpointには監査ID、対象identity、完了済み、未完了、証拠所在地、再開点を含める。

checkpointは復旧用であり、`AUDIT_RESULT`または`AUDIT_ACCEPTANCE`ではない。checkpoint到達だけで監査を止めず、途中checkpointを監督スレが正式報告として受理しない。

## 5. 正規flow

```text
監査スレ
  AUDIT_INSTRUCTION / TA・CP
        ↓
監査作業スレ
  checkpointを取りながら監査
  AUDIT_RESULT
        ↓
監査スレ
  remote read-back・重複整理
  AUDIT_ACCEPTANCE
  必要な新規Tだけ作成・採番
        ↓
監督スレ
  受理済みTの優先順位・依存・owner・反映順を管理
        ↓
作業スレ
  既存Tを実装・検証
        ↓
監督スレ
  READY_FOR_REAUDIT（closeしない）
        ↓
監査スレ → 監査作業スレ → 監査スレ
  再監査instruction → 独立再検証result → acceptance
  FIX_VERIFIEDならclose / 不成立ならREOPENED
```

このflowを省略して、監査作業スレから監督スレまたは作業スレへfindingを直送しない。監督スレから作業スレへ直接closeを通知せず、監査側の再検証を省略しない。利用者の明示判断はいつでも範囲を狭められるが、各スレが別の役割を代行したことにはしない。
