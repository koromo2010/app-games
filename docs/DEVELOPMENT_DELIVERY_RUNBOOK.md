# Development Delivery Runbook

`APPLIES_WHEN`: 許可済みの実装、検証、write計数、Room、Git、Deployment、runtime、証拠取得を行うとき。

`DOES_NOT_APPLY`: 権限、task state、停止条件、記録形式、監査・管理・監督の責任を決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は許可済み作業の方法だけを定め、権限、禁止、task固有の上限を作らない。

## 1. Preflight

write前に次を現在値として固定する。これは実行状態であり、新しいtask contractではない。

```text
TASK / TARGET
REPOSITORY / REMOTE / WORKTREE / BRANCH
BASE / TARGET_COMMIT
POLICY_APPLIED
SEMANTIC_ENVIRONMENT
ALLOWED_PRODUCT_WRITES / FORBIDDEN_EFFECTS
SUCCESS_CONDITION / TRUE_STOP_CONDITIONS
```

- repository、remote、project、branch、baseが不一致ならwriteせずcanonical sourceを確認する。訂正不能な真のidentity不一致だけを正本のdecision kernelへ返す。
- dirty差分を利用者の所有物として保持し、無関係な変更を編集、stage、commitしない。
- 認証、Cookie、browser session、Deployment、runtime-selected resourceを推測しない。
- 検証前に対象identity、必要証拠、成功条件を固定し、失敗後に基準を緩めない。

指定artifactが見つからない場合は、対象branchのcanonical Git、checkpoint repository、共有済み領域、Library、current pointerを探索し、取得不能が現在の依存点になった場合だけ正確な対象を利用者へ依頼する。

## 2. 外部効果の計数

| 種類 | 数えるもの |
| --- | --- |
| logical product write | 製品domainの永続状態を変える一つの論理操作 |
| control-plane write | Git ref、Deployment、Vercel設定、OAuth、DNS、環境変数等の基盤変更 |
| tool invocation | MCP、HTTP、browser、CLI等を実際に呼んだtransport attempt |

Git push、Deployment、checkpoint保存はlogical product writeに含めず、それぞれの許可と回数で管理する。read-only確認、local変更・test・commit、非write handshake、同一request IDによるread-backはproduct writeではない。

個別contractの「最大1件」「1回」は、transport attemptと明記されない限り一つのlogical product writeを意味する。同じrequest ID・同じ意味内容の冪等replayは二件目ではない。別request ID、意味内容を変えたpayload、別対象は新しいwriteである。

write結果が不明なら保持済みresponseを現行schemaで再解析し、必要な場合だけ同じrequest ID・payloadを冪等replayする。永続化前の拒否をread-backできた場合だけ`WRITE_REJECTED_BEFORE_PERSISTENCE`、成否不明は`WRITE_OUTCOME_UNKNOWN`とし、新しいwriteを作らない。

## 3. 実装と検証

- 再現条件、root cause、影響範囲を確認し、共通境界で恒久修正する。
- 外部writeを伴う診断は、read-onlyまたはlocal再現では足りないことを確認してから承認・実行する。
- 観測箇所だけでなく同じfailure classと残りのflowを横断確認する。
- local、mock、Preview、development、productionを相互代用しない。
- focused test、変更境界の回帰、repository gate、必要なruntime scenarioの順に確認する。
- 文書・契約変更では、構造を固定するcontract testと`git diff --check`を最低限実行する。
- `NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`、対象変更によるfailureを区別する。

developmentは早期のruntime feedbackを得る環境である。candidate、更新前SHA、rollback、差分を固定し、不可逆なmigration、data write、認証・権限変更を含まない可逆な変更では、最短の関連check、承認済みdev反映、runtime観測、forward fixまたはrollbackを一つのfeedback loopとして進める。

全test、lint、build、視覚検証、全履歴artifactをdev反映前の一律gateにしない。未実施項目とリスクは示し、main／production昇格前までに変更リスクに応じた必要gateを満たす。

## 4. Git、Deployment、Room

- local candidateはtask範囲だけをstageし、base、parent、tree、changed paths、検証結果を固定する。
- direct pushとGit-data materializationは実行方法であり、固定対象・tree・最大外部効果が同じならtransport failureだけで新しいtaskや規則を作らない。
- ref更新は対象を識別した利用者承認後に行い、non-force等の既存refを不意に失わない方法を使う。
- main ref反映とProduction Deploymentは別の外部効果であり、それぞれを明示した承認がない限り一方から他方を推論しない。
- pushまたはDeployment後はremote ref、Deployment identity、source SHA、status、healthをread-backし、不一致なら成功扱いせずforward fixまたはrollbackを判断する。

Game Fields runtimeのRoom操作権限は利用者指示、project指示、task contractから得る。本書自体はRoomを許可しない。development Roomが許可されている場合、そのruntime scenarioに必要な作成、通常操作、正規cleanupを同じ検証単位として扱い、操作ごとの追加承認を作らない。production Roomはenvironment、目的、対象を含む明示承認を必要とし、承認範囲に通常操作やcleanupを含むかをapproval requestで固定する。Room許可からDB／Redis管理write、認証・権限変更、別environment操作を推論しない。

cleanupまたはremaining read-backが失敗したら対象Roomとfailure classを記録して内部回復する。同じ障害で永続状態を無制限に増殖させる具体的危険がある場合だけ、そのRoom作成経路を止める。

## 5. Runtimeと証拠

- semantic environmentをdomain名やbranch名だけで推測せず、project、Deployment、binding、runtime responseで照合する。
- environment variableは値を表示・保存せず、存在、environment、供給元identity、選択優先順位だけを確認する。
- runtime-selected resourceを診断する場合は診断対象との同一性を立証し、別resourceのSQLや画面を代用しない。
- Preview、development、productionの証拠を混ぜず、取得経路、対象identity、取得時刻を記録する。

証拠は主張へ直接対応させる。`READY`は配備処理の状態であってruntime PASSではない。別commit、別environment、`SKIPPED`、`IGNORED`、`CANCELED`、identity不明の結果をPASSへ読み替えない。

| 主張 | 最小証拠 |
| --- | --- |
| source変更 | path、diff、candidate commit／tree |
| local検証 | command、exit、pass／fail／not run |
| Git反映 | 更新前後ref、remote read-back |
| Deployment | identity、source SHA、status、health |
| runtime | environment、route／scenario、時刻、結果 |
| external write | 対象、request identity、論理件数、read-back |

browser確認は、値だけで判定可能な`VALUE_VERIFIABLE`、利用者の認証・入力が必要な`INTERACTION_REQUIRED`、見た目自体が要件の`VISUAL_REQUIRED`に分ける。値を別経路で取得できる場合は画面操作を要求しない。

利用者操作を求める前に`REQUIREMENT_SATISFIED`、`USER_ACTION_REQUIRED`、`STATE_UNKNOWN`を判定する。返却済みの証拠を再要求せず、`STATE_UNKNOWN`は許可済みread-only経路で解消する。真に`USER_ACTION_REQUIRED`なら、理由、対象、最大影響、成功表示、失敗時の停止方法を一つの短い手順として示す。

反復的なDevTools操作やsecret／token／接続文字列の表示・転記を利用者へ依頼しない。
