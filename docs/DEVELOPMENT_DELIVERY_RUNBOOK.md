# Development Delivery Runbook

`APPLIES_WHEN`: 実装、検証、write計数、Room、Git、Deployment、runtime、証拠取得、利用者操作を扱うとき。

`DOES_NOT_APPLY`: taskの権限・停止条件を新設するとき、記録形式だけを扱うとき、監査・管理・監督の役割を決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

本書は実行正本から委任された手順書であり、新しい権限、禁止、task固有の上限を作らない。task番号、commit、URL、credential、transport等の個別事情を恒久ルールへ昇格しない。

## 1. 作業開始ゲート

開始時に次を実行状態として固定する。このblockはread-onlyのpreflightであり、`NEXT_INSTRUCTION`のtemplateでも新しい成果物でもない。契約に属さない現在値はcheckpointへ置く。

```text
TASK / TARGET
REPOSITORY / REMOTE
WORKTREE / BRANCH
BASE / TARGET_COMMIT
POLICY_COMMIT
SEMANTIC_ENVIRONMENT
ALLOWED_PRODUCT_WRITES
FORBIDDEN_EFFECTS
SUCCESS_CONDITION
TRUE_STOP_CONDITIONS
```

- repository、remote、PROJECT_ID、branch、baseが不一致ならwriteせず、read-onlyで正本を再確認する。訂正不能な場合だけ`PROJECT_MISMATCH`または`IDENTITY_MISMATCH`で停止する。
- dirty差分は利用者の所有物として保持し、無関係な変更を編集、stage、commitしない。
- 認証、Cookie、plugin、browser session、Deploymentを推測しない。
- 検証前に対象identity、必要な証拠、成功条件を固定し、失敗後に基準を緩めない。

指定ファイルが見つからない場合は、添付を求める前に、対象branchのcanonical Git、checkpoint正本、共有済み領域、Library、current pointerの順で探索する。取得不能が現在の依存点になった場合だけ、正確なファイル名と探索済み範囲を示して依頼する。

## 2. 操作と回数の数え方

| 種類 | 対象 |
| --- | --- |
| logical product write | proposal、game draft、Room、Command、package、support draft、製品DB／Redis／Blob等の製品domain永続状態を変える一つの論理操作 |
| control-plane write | Git ref、Deployment、Vercel、OAuth、DNS、環境変数等の開発・配備基盤の状態変更 |
| tool invocation | MCP、HTTP、browser、CLI等を実際に呼び出したtransport attempt |

proposal作成はlogical product writeである。Git push、Deployment、checkpoint保存はlogical product write件数へ含めず、それぞれ独立した許可と回数で管理する。control-plane writeや外部送信が無許可でよいという意味ではない。

次はproduct write件数へ含めない。

- read-only確認
- local file変更、test、local commit
- 契約上product writeを行わないhandshake
- 同一request IDによるread-back／冪等照合
- checkpoint repositoryへの許可済み新規immutable記録

個別指示の「最大1件」「1回」は、`tool invocation`または`transport attempt`と明記されない限り、一つのlogical product writeを意味する。同じrequest ID・同じ意味内容による冪等replayとread-backは二件目のlogical product writeではない。tool invocation自体を制限する場合は、tool名、総call回数、retryを含むかを明記する。外部call回数、logical product write件数、control-plane write件数を混同しない。

結果不明のwriteは、保持済みresponseを正しいparserで再解析し、必要な場合だけ同じrequest ID・同じpayloadを冪等replayする。別request ID、意味内容を変えたpayload、別対象へのwriteは新しいlogical product writeである。validationで永続化前に拒否されたcallは、contractまたはread-backで無変更を確認できた場合だけ`WRITE_REJECTED_BEFORE_PERSISTENCE`、product write 0件とする。成否不明は`WRITE_OUTCOME_UNKNOWN`とし、新しい論理writeを作らない。

### Runtime Roomの環境別許可

ここでいう`Room`はGame Fields製品runtime上のRoomであり、ChatGPTの会話スレッドを意味しない。

- developmentでは、実装・再現・runtime検証に必要なRoom作成、通常操作、正規導線によるcleanupを事前許可済みとする。Roomごとの追加承認や一律の作成数上限を設けない。
- cleanupまたはremaining read-backが失敗したら、そのRoomとfailure classを記録して内部回復する。同じ障害で永続状態を無制限に増殖させる具体的危険が確認された場合だけ、その作成経路を止める。
- main／productionでのRoom作成は、environment・目的・対象を特定した利用者の明示承認を必要とする。devの許可を流用しない。
- Room code、secret、Cookie、token等をGit、正式result、共有ログへ保存しない。DB／Redis管理write、認証・権限変更、別environment操作はRoom許可に含めない。

## 3. 実装と検証

- 再現条件、根本原因、影響範囲を確認し、共通境界で恒久修正する。
- 外部writeを伴う診断は、read-onlyまたはlocal再現で足りないことを確認してから承認を求める。
- local、mock、isolated Preview、formal Preview、dev、productionを相互代用しない。
- 変更後はfocused test、変更境界の回帰、repository gate、必要なruntimeシナリオの順で検証する。
- 文書・契約変更では、内容を固定するcontract testと`git diff --check`を最低限実行する。
- `NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`、対象変更の失敗を区別する。

検証深度はenvironment、可逆性、影響に比例させる。

- devは早期の実装・runtime feedback自体に価値がある検証環境である。candidate commit、更新前dev SHA、rollback先、変更範囲を固定し、不可逆なmigration／data write／認証・権限変更を含まない可逆な変更では、実装、利用可能な最短の関連check、承認済みdev反映、runtime観測、forward fixまたはrollbackを一つの`TASK_ACTIVE` feedback loopとして優先する。
- test、lint、build、視覚検証、全履歴artifactをdev push前の一律必須条件にしない。実行済みcheckと既知の未検証項目を承認依頼へ示すが、未検証項目だけでdev反映をblockしない。明白な破壊操作、secret混入、対象外差分はpush前に除外する。
- 残る全体test、lint、build、runtime回帰は変更リスクに応じてdev反映後に続け、main／production昇格前までに必要な全gateを満たす。
- 途中のfailureでは、観測箇所だけでなく同じfailure classと残りの実行flowを横断監査する。tool名、schema、response path、parser、bindingの見落としは`AI_EXECUTION_TROUBLESHOOTING.md`で自己回復する。

## 4. Git、Deployment、外部write

- Gitの対象ref更新、Deployment、Vercel設定、DB／migration、認証・権限等は、それぞれ利用者が明示したenvironment、対象、上限の範囲だけで行う。
- local candidateはtask範囲の差分だけをstageし、base、parent、tree、changed paths、検証結果を固定する。無関係なdirty差分を含めない。
- direct push、Git-data materialization等のtransport選択は実行方法であり、安全境界ではない。固定された対象、変更内容、最大外部効果が同じなら、transport failureだけを理由に新しい全体ルールやタスクを作らない。
- developmentの可逆なref更新は、利用者がcandidateまたは直前の実行シートを識別して承認した後に行う。`force=false`等、既存refを不意に失わない方法を優先する。
- main／productionまたは不可逆操作では、ref更新前に最終commitを確定し、必要な全gate、rollback、外部影響を確認して個別承認を得る。
- pushやDeployment後はremote ref、Deployment identity、runtime healthをread-backする。期待と異なる場合は新しい成功扱いにせず、同じtask内でforward fixまたはrollbackを判断する。

## 5. Vercelとruntime確認

- semantic environmentをdomain名やbranch名だけで推測せず、PROJECT_ID、Deployment、environment binding、runtime response等で照合する。
- 公開情報、source、schema、公式API、CLI、connector、browser等の利用可能なread-only経路を目的に応じて使う。特定toolが使えないことを対象情報が取得不能であることと混同しない。
- environment variableは値を表示・保存せず、存在、適用environment、供給元identity、選択優先順位を秘密値なしで確認する。
- runtimeが選択したresourceを診断するときは、診断対象とruntime-selected resourceの同一性を立証する。別resourceのSQLや画面情報を代用しない。
- Preview、development、productionの証拠は混ぜない。取得経路、対象DeploymentまたはURL、identity、取得時刻を記録する。

## 6. 証拠と利用者操作

証拠は主張へ直接対応させる。

- source変更: path、diff、candidate commit／tree
- local検証: command、exit、pass／fail／not run
- Git反映: 更新前後ref、remote read-back
- Deployment: deployment identity、source SHA、status、health
- runtime: environment、routeまたはscenario、観測時刻、結果
- external write: 対象、request identity、論理件数、read-back

実行側の環境不足、未検証手順、実装上の不確実性を利用者操作へ移さない。利用者専用操作が真の依存点なら、既に試した自己回復、その操作が必要な理由、対象、最大影響、成功表示、失敗時の停止方法を一つの短い手順として示す。反復的なDevTools操作や秘密値の転記を依頼しない。

利用者は識別可能な直前の実行シートを、対象と最大影響が不変なら短い自然文で承認できる。固定文の完全一致を要求しない。承認後は同じ`TASK_ACTIVE`で続行する。
