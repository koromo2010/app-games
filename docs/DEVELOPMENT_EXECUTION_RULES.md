# 開発実行ルール

この文書は、`koromo2010/app-games`での実装、検証、保存、Git操作、Deployment、証拠、終了判定の共通runbookである。権限を新たに与える文書ではない。tool、schema、response解析の復旧手順は`AI_EXECUTION_TROUBLESHOOTING.md`を正本とする。

## 1. 適用関係

文書を一列の優先順位で競合させず、判断対象ごとに正本を分ける。

| 判断対象 | 正本 |
| --- | --- |
| 作業範囲・権限 | 利用者の現在の明示指示・承認とChatGPTプロジェクト全体指示 |
| 目的・対象・product write上限・禁止・成功／停止条件 | 最新のタスク固有指示 |
| field・response path・aggregate verdict・冪等性 | 現行source、schema、SDK等のinterface／protocol正本 |
| 実行・検証・保存・証拠手順 | `AGENTS.md`と本書 |
| 解析復旧 | `AI_EXECUTION_TROUBLESHOOTING.md` |

- タスク指示は許可範囲を狭められるが、曖昧な表現や過去の承認から権限を広げない。
- タスク指示の略記や古いfield名から、現行interfaceと異なる仕様を作らない。
- 旧指示、旧result、会話ログは履歴であり、最新版と累積適用しない。
- 同じ判断対象の真の矛盾だけを利用者へ確認する。解析で解消できる差は同じ作業内で直す。

## 2. 作業開始ゲート

開始時に次を固定する。

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

## 3. 操作と回数の数え方

回数は次の三種類を分けて固定する。

| 種類 | 対象 |
| --- | --- |
| logical product write | proposal、game draft、Room、Command、package、support draft、製品DB／Redis／Blob等、製品domainの永続状態を変える一つの論理操作 |
| control-plane write | Git ref、Deployment、Vercel、OAuth、DNS、環境変数等、開発・配備基盤の状態変更 |
| tool invocation | MCP、HTTP、browser、CLI等を実際に呼び出したtransport attempt |

proposal作成はlogical product writeである。Git push、Deployment、checkpoint保存はlogical product write件数へ含めず、それぞれ独立した許可と回数で管理する。control-plane writeや外部送信が無許可でよいという意味ではない。

次はproduct write件数へ含めない。

- read-only確認
- local file変更、test、local commit
- 契約上product writeを行わないhandshake
- 同一request IDによるread-back／冪等照合
- checkpoint repositoryへの許可済み新規immutable記録

個別指示の「proposalを最大1件」「proposalを1回」は、`tool invocation`または`transport attempt`と明記されない限り、一つのlogical product writeを意味する。同じrequest ID・同じ意味内容による冪等replayとread-backは二件目のlogical product writeではない。tool invocation自体を制限する場合は、tool名、総call回数、retryを含むかを明記する。操作名のない「最大1回」「最大1件」もlogical product write上限とし、read-only確認、source／schema確認、parser修正、冪等照合、非product-write handshakeを制限しない。外部call回数、logical product write件数、control-plane write件数を混同しない。

結果が不明なwriteでは、保持済みresponseを正しいparserで再解析してから、必要な場合だけ同じrequest ID・同じpayloadを冪等replayする。これは二件目のlogical product writeではないが、明示されたtool invocation上限は超えない。別request ID、意味内容を変えたpayload、別対象へのwriteは新しいlogical product writeとして扱う。

validationで永続化前に拒否されたcallは、contractまたはread-backで無変更を確認できた場合だけ`WRITE_REJECTED_BEFORE_PERSISTENCE`、product write 0件とする。成否不明は`WRITE_OUTCOME_UNKNOWN`とし、新しいrequest IDや二つ目の論理writeを作らない。

## 4. 実行継続と停止

許可済み範囲では、タスクの成功条件または真の停止条件まで連続して進める。local commit、checkpoint、承認済みpush、`READY`、tool探索、parser修正、read-only確認の完了だけで作業を分割しない。

tool名、schema、response path、parser、binding、許可済みread-only経路の見落としは、`AI_EXECUTION_TROUBLESHOOTING.md`に従い同じ作業内で修正する。途中経過は共有してよいが、許可済みの次工程を止めない。

正式に停止するのは次の場合に限る。

- 未許可の外部write、push、Deployment、production反映が必要
- project、repository、remote、branch、commit、environmentの真の不一致から復帰不能
- 利用者判断で結果が大きく変わる仕様分岐
- 許可範囲を超える修正が必要
- 認証、権限、接続、外部service障害で継続不能
- Portal owner承認など利用者専用操作が現在の依存点
- タスク指示が対象操作とともに明示した停止条件へ到達

通常のGit push承認待ちは実行停止点にはなり得るが、それだけで正式resultを作るterminal boundaryにはしない。

## 5. 実装と検証

- 再現条件、根本原因、影響範囲を確認し、共通境界で恒久修正する。
- 外部writeを伴う診断は、read-onlyまたはlocal再現で足りないことを確認してから承認を求める。
- local、mock、isolated Preview、formal Preview、dev、productionを相互代用しない。
- 変更後は、focused test、変更境界の回帰、repository gate、必要なruntimeシナリオの順で検証する。
- 文書・契約変更では、内容を固定するcontract testと`git diff --check`を最低限実行する。
- `NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`、対象変更の失敗を区別する。

runtime／browser項目は`VALUE_VERIFIABLE`、`INTERACTION_REQUIRED`、`VISUAL_REQUIRED`へ分類する。値で判定できる項目へ不要なスクリーンショットを要求せず、視覚項目を値だけでPASSにしない。一つのbrowser経路の失敗だけで製品不具合または全面的な`BROWSER_UNAVAILABLE`と判定しない。

同種の検査でDevTools操作やスクリーンショットが反復する場合は、秘密を含まない診断表示、revision表示、計測hook、read-only endpoint等の製品改善候補へ登録する。

## 6. Git・Deployment・外部write

- local修正、test、task-owned local commitは個別禁止がなければ進めてよい。
- 製品repositoryへのpush／ref更新は、Deploymentの有無にかかわらず、repository、ref、更新前後のcommit、force有無を特定した利用者の明示承認を必要とする。
- Deploymentが起こり得る場合はProject、environment、影響も承認対象に含める。
- dev許可をmain／productionへ流用しない。main反映とproduction Deploymentは別に明示承認を得る。
- force push、履歴改変、手動Redeploy、DB／Redis／Blob／OAuth／DNS／環境変数writeは、対象を特定した個別の明示承認なしに行わない。
- checkpoint repositoryの許可済み保存は製品pushの承認として流用しない。

## 7. Vercelと製品runtime

ログイン、認証情報、Cookie、認証済みsessionを使わず、公に取得できるVercel情報はread-only確認してよい。公開Deployment状態、URL、identity、対応commit、時刻、HTTP、header、revision、公開metadata等を含む。

匿名Vercel証拠には、取得経路、対象DeploymentまたはURL、identity、取得時刻を記録する。Vercel未ログインだけを理由に`HOLD`しない。

次は利用者専用とする。

- Vercelへのログイン
- 認証済みsession、Cookie、password、MFA、tokenの取得・使用
- 認証を要するDashboard、connector、API、CLIによる閲覧・変更
- Redeploy、Promote、Rollback、Cancel等のcontrol plane操作

認証要求へ到達したら匿名確認を終了する。認証済み操作または匿名では取得不能な情報が現在の依存点の場合だけ`VERCEL_USER_ACTION_REQUIRED`とし、対象、画面、操作、禁止事項、成功条件、返却する非秘密情報、resume pointを一度に示す。秘密情報を貼らせない。

`game-fields.com`、dev／preview／SDK、対象Deploymentの製品runtimeはVercel control planeではなく、作業スレで検査してよい。

## 8. 証拠と利用者操作

test、CI、Deployment、runtimeは、固定したrepository、remote、branch、commit、tree、Project、environment、revision、対象ID等と一致する場合だけ採用する。

- 別commitのCI、build skip、ignored build、`CANCELED`を対象修正のPASSにしない。
- `READY`はDeployment完了でありruntime PASSではない。
- field pathやparserが不明な状態をidentity不一致と断定しない。
- 真のidentity不一致は証拠として不採用とし、そのidentityのままwriteしない。read-onlyで正しい対象へ復帰できるなら続行する。

利用者へ操作を依頼する前に、同一対象・surfaceの最新状態を許可済みread-onlyで確認する。

- `REQUIREMENT_SATISFIED`: 条件充足済み。再依頼せず続行する。
- `USER_ACTION_REQUIRED`: 利用者専用操作が今必要と実観測できた場合だけ依頼する。
- `STATE_UNKNOWN`: 証拠不足。未完了と推測せず、再取得または別の許可済み経路を確認する。

利用者から返却された値は再利用し、同じ操作・情報を再要求しない。`GPT_OBSERVED`、`USER_OBSERVED`、`NOT_OBSERVED`を区別する。

`USER_ACTION_REQUIRED`では依頼を小出しにせず、同一surface・identity・許可範囲で連続できる操作を一つの実行シートにまとめる。対象environment／URL、目的、発生するwriteと上限、実行前状態、手順、成功条件、即時停止条件、返却する非秘密情報、共有禁止の秘密情報、resume pointを含める。途中結果で未承認writeへ分岐する場合は、その地点を停止条件とする。

## 9. 保存レベル

| Level | 対象 | 必須保存 |
| --- | --- | --- |
| L1 | 調査、相談、変更なし | チャット報告。明示要求がなければ正式result不要 |
| L2 | 通常の製品コード・正本文書変更 | 最終candidateを自分の変更だけlocal commit＋検証。remote未到達のままturnを終える場合は下記耐久checkpoint |
| L3 | migration、認証、重要基盤、復元困難な成果 | L2＋成果確定時点でbundle、manifest、fresh restore、耐久保存 |

内部retryや中間candidateごとにbundleを作らない。remote未到達の最終task-owned commitを保持して、turn終了、承認待ち、利用者操作待ち、スレ移行、workspace整理、長時間停止、別タスク移行へ進む前に次を1回行う。

1. repository、remote、branch、base、commit、tree、parent、変更ファイルを固定する。
2. 必要objectを含むbundle等を承認済み耐久領域へ保存し、場所、size、SHA-256、identityをmanifestへ記録する。
3. 元workspaceと別の空領域からfresh restoreし、commit、tree、parent、差分、必要objectを照合する。
4. artifact、manifest、復元証拠をcheckpoint正本へ新規immutable保存し、双方をread-backした場合だけ`CHECKPOINT_SAVED`とする。

許可済みpushで同一turnに正本remoteへ到達した場合は、その到達確認を耐久保存とできる。未許可branch、tag、pushをcheckpoint目的で作らない。保存不能時は`UNSAVED / AT RISK`として所在地と復元可能性を示す。

再開時はremoteまたは耐久artifactから復元し、固定identityを再照合する。commitを再構築した場合は新しいidentityとして扱い、旧commitの承認、test、CI、Deployment、runtime証拠を流用しない。

## 10. 正式result

正式result Markdownを作るterminal boundaryは次に限定する。

- 追跡対象TODOまたは実装タスク全体の成功条件を満たした
- 許可済み作業を尽くした真の外部blocker
- proposal等がPortal owner承認待ちとなり、そのturnを終了する
- 利用者が正式報告を明示要求した

相談、分析、個別指示、内部phase、local commit、checkpoint、通常のpush承認待ち、承認済みpush、`READY`、tool探索、schema／response path確認、parser修正、read-only retry、非product-write handshake、同一request IDの冪等照合は、それだけではterminal boundaryではない。

正式resultの保存先は`koromo2010/app-games-checkpoints`、branch `ops/game-fields-supervisor-records-20260803`、`docs/gpt-save/`とする。既存pathを更新せず、record commit、blob SHA、pathと内容のremote read-backを確認する。保存不能時は`RESULT_RECORD_UNSAVED / AT RISK`とする。

resultには、受領指示、実施範囲、状態、変更、commit／tree、検証、push・Deployment・外部write件数、blocker、未完了、次操作を含める。追跡対象TODOの既定名は`Game-Fields-T-<number>-result-v<NNN>-<YYYYMMDD>.md`とする。

## 11. 状態表示

`IMPLEMENTATION_COMPLETE`、`LOCAL_PASS`、`LOCAL_COMMITTED_UNSAFE`、`CHECKPOINT_SAVED`、`DEV_DEPLOYED`、`DEV_RUNTIME_PASS`、`PRODUCTION_DEPLOYED`、`PRODUCTION_RUNTIME_PASS`、`CLOSED`を組み合わせる。`CLOSED`はタスク固有の完了条件をすべて満たした場合だけ使用する。

Gitへ残す判断ログは、コードまたは正本仕様へ影響する確定事項に限定する。日々のTODO進行、指示書、result履歴はcheckpoint正本で管理する。
