# Development Delivery Runbook

`APPLIES_WHEN`: 許可済みの実装、検証、write計数、Room、Git、Deployment、runtime、証拠取得を行うとき。

`DOES_NOT_APPLY`: 権限、task state、停止条件、記録形式、監査・管理・監督の責任を決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は許可済み作業の方法だけを定め、権限、禁止、task固有の上限を作らない。

## 1. Preflight

作業開始時とref更新前に次を現在値として固定する。これは実行状態であり、新しいtask contractや承認資料ではない。

```text
TASK / TARGET
REPOSITORY / REMOTE / WORKTREE / BRANCH
BASE / TARGET_COMMIT
POLICY_APPLIED
```

保護対象、非冪等、または結果不明になり得るwriteだけは、実行前に`SEMANTIC_ENVIRONMENT / TARGET_IDENTITY / MAXIMUM_EXTERNAL_EFFECT / APPROVAL_IDENTITY`も固定する。通常の可逆なDevelopment loopへ`ALLOWED_PRODUCT_WRITES`、`FORBIDDEN_EFFECTS`、attempt表を毎回再生成しない。

- repository、remote、project、branch、baseが不一致ならwriteせずcanonical sourceを確認する。訂正不能な真のidentity不一致だけを正本のdecision kernelへ返す。
- dirty差分を利用者の所有物として保持し、無関係な変更を編集、stage、commitしない。
- 認証、Cookie、browser session、Deployment、runtime-selected resourceを推測しない。
- 検証前に対象identity、必要証拠、成功条件を固定し、失敗後に基準を緩めない。

指定artifactが見つからない場合は、対象branchのcanonical Git、checkpoint repository、共有済み領域、Library、current pointerを探索し、取得不能が現在の依存点になった場合だけ正確な対象を利用者へ依頼する。

## 2. 保護対象writeの計数

| 種類 | 数えるもの |
| --- | --- |
| logical product write | 保護対象または非冪等な製品domainの永続状態を変える一つの論理操作 |
| control-plane write | main／production、設定、OAuth、DNS、環境変数等の保護対象基盤変更 |
| tool invocation | MCP、HTTP、browser、CLI等を実際に呼んだtransport attempt |

通常のprototype／development loopでは、commit、non-force `develop`更新、決定的な自動Deployment、retryをattempt ledgerで数えず、最終refと関係する結果だけを記録する。利用者がtask固有の上限を明示した場合、または保護対象・非冪等・結果不明writeを扱う場合だけ論理件数を管理する。tool invocationを利用者承認の消費単位にしない。checkpoint保存、read-only確認、local変更・test、非write handshake、同一request IDによるread-backはproduct writeではない。

利用者が明示した「最大1件」「1回」は、transport attemptと明記されない限り一つのlogical product writeを意味する。同じrequest ID・同じ意味内容の冪等replayは二件目ではない。別request ID、意味内容を変えたpayload、別対象は新しいwriteである。artifact作成者が独自に回数上限を追加しない。

write結果が不明なら保持済みresponseを現行schemaで再解析し、必要な場合だけ同じrequest ID・payloadを冪等replayする。永続化前の拒否をread-backできた場合だけ`WRITE_REJECTED_BEFORE_PERSISTENCE`、成否不明は`WRITE_OUTCOME_UNKNOWN`とし、新しいwriteを作らない。

## 3. 実装と検証

- 再現条件、root cause、影響範囲を確認し、共通境界で恒久修正する。
- 外部writeを伴う診断は、read-onlyまたはlocal再現では足りないことを確認してから承認・実行する。
- 観測箇所だけでなく同じfailure classと残りのflowを横断確認する。
- local、mock、Preview、development、productionを相互代用しない。
- focused test、変更境界の回帰、repository gate、必要なruntime scenarioの順に確認する。
- 文書・契約変更では、構造を固定するcontract testと`git diff --check`を最低限実行する。
- `NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`、対象変更によるfailureを区別する。

developmentは早期のruntime feedbackを得る環境である。candidate、更新前SHA、rollback、差分を固定し、不可逆なmigration、再生成不能なdata write、実credential・account／MFA登録・role／grant・環境binding等の保護対象状態変更を含まない可逆な変更では、最短の関連check、dev反映、決定的な自動delivery、runtime観測、forward fixまたはrollbackをstanding authorization内の一つのfeedback loopとして進める。認証・権限・接続logicのsource変更は、それらの保護対象状態を実際に変更しない限りこのloopに含む。各commit、再配備、runtime failure、forward fixを新しいapproval requestやExecution sheetへ変換しない。

専用development dataの変更は、task contractが対象を含み、resetまたはrollback可能で、実利用者・再生成不能data・別environmentへ影響しない場合だけこのloopへ含められる。結果不明時は新しいwriteを作らず、read-only reconciliationとlocal原因修正を先に行う。

全test、lint、build、視覚検証、全履歴artifactをdev反映前の一律gateにしない。未実施項目とリスクは示し、main／production昇格前までに変更リスクに応じた必要gateを満たす。

### Rollbackの成立と最小証拠

rollbackは計画書、事前commit、復旧bundle等の成果物ではなく、許可済み変更から既知の以前の状態へ復元できる性質を指す。通常のDevelopmentコード／Git変更では、変更前のremote commitまたはtreeが取得可能で、対象bytesを再構成でき、同じbranchへrevert／restore commitをnon-forceで追加できることを確認すれば成立する。変更前SHA、対象branch、変更範囲を通常のpreflightまたはcurrent statusで識別できれば十分である。

実際のrevert／restore commitは、実行時にremote read-backしたcurrent headをparentとし、対象logical changeの逆差分だけを適用して無関係な後続変更を保持する。変更前commit／treeは対象bytesを特定する参照であり、古いtree全体への置換には使わない。対象pathに後続変更との競合がある場合はcurrent head上で逆差分をlocal再構成して検証し、競合を理由にforce更新や全tree復元へ切り替えない。

この条件を満たす変更に、別のrollback計画書、事前rollback commit、approval request／Execution sheet、復元訓練、重複bundle、rollback専用checkpointを要求しない。実際に復元が必要になった場合も、scope、environment、最大影響が同じならstanding authorization内でforward fixまたは新しいrevert／restore commitを進める。一回のrollbackやfailureを理由に権限を消費済みにしない。

Git refを過去へforceで巻き戻すことは通常のrollbackとみなさない。履歴を保持する新しいcommitを前向きに追加し、その自動Development deliveryとread-backを同じfeedback loopで確認する。force更新、保護対象ref、別environmentへの反映は正本の追加承認境界へ返す。

コードやremote historyだけでは永続状態を復元できない変更は、task scope内でreset、再生成、または既存snapshotからの復元経路が確認でき、実利用者・再生成不能data・別environmentへ影響しない場合だけ通常のDevelopment loopへ含める。これを満たさないdata、migration、credential・account／MFA登録・role／grant・環境binding等の永続状態変更は、rollback文書の有無にかかわらず正本の保護対象である。

## 4. Git、Deployment、Room

- local candidateはtask範囲だけをstageし、base、parent、tree、changed paths、検証結果を固定する。
- direct pushとGit-data materializationは実行方法であり、固定対象・tree・最大外部効果が同じならtransport failureだけで新しいtaskや規則を作らない。
- `develop` ref更新が正本のstanding authorization内にある場合は、固定したbase、tree、差分、rollbackを確認してnon-forceで進める。同じtask scopeのremote head前進、transport failure、forward fixだけを理由に再承認を作らない。
- mainその他の保護対象ref、force更新、scopeまたは最大影響が変わるref更新は、対象を識別した利用者承認後に行う。
- main ref反映とProduction Deploymentは別の外部効果であり、それぞれを明示した承認がない限り一方から他方を推論しない。
- push後は更新対象remote refをread-backする。対象変更により自動Deploymentが期待される、または実際に開始された場合だけ、関係するDeploymentのidentity、source SHA、statusを確認する。runtime healthはruntime surfaceを変更した場合、またはtaskの受入主張に必要な場合だけ確認し、docs・test・配備対象外pathや`IGNORED`だけの変更へ一律に要求しない。不一致は成功扱いせずforward fixまたはrollbackを判断する。

通常のprototype／development taskでは、受入scenarioに必要なdisposable Development Roomの作成、通常操作、正規cleanupを正本のstanding authorization内の同じ検証単位として扱い、操作ごとの追加承認を作らない。task contractが明示的に除外するRoom、実利用者・再生成不能data・無関係な別Roomへ影響する操作、production Roomはこの既定に含めない。production Roomはenvironment、目的、対象を含む明示承認を必要とし、承認範囲に通常操作やcleanupを含むかをapproval requestで固定する。Room権限からDB／Redis管理write、credential・role／grant・環境binding変更、別environment操作を推論しない。

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
| Deployment | identity、source SHA、status。runtime主張がある場合だけhealth |
| runtime | environment、route／scenario、時刻、結果 |
| external write | 対象、request identity、論理件数、read-back |

browser確認は、値だけで判定可能な`VALUE_VERIFIABLE`、利用者の認証・入力が必要な`INTERACTION_REQUIRED`、見た目自体が要件の`VISUAL_REQUIRED`に分ける。値を別経路で取得できる場合は画面操作を要求しない。

利用者操作を求める前に`REQUIREMENT_SATISFIED`、`USER_ACTION_REQUIRED`、`STATE_UNKNOWN`を判定する。返却済みの証拠を再要求せず、`STATE_UNKNOWN`は許可済みread-only経路で解消する。真に`USER_ACTION_REQUIRED`なら、理由、対象、最大影響、成功表示、失敗時の停止方法を一つの短い手順として示す。この待機だけで`EXTERNAL_BLOCKED`、final result、新しいtask contract、approval requestを作らず、操作後は同じ`TASK_ACTIVE`へ再開する。

反復的なDevTools操作やsecret／token／接続文字列の表示・転記を利用者へ依頼しない。
