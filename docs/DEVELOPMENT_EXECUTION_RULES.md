# 開発実行ルール

この文書は、`koromo2010/app-games`での実装、検証、保存、Git操作、Deployment、証拠、終了判定の共通runbookである。権限を新たに与える文書ではない。tool、schema、response解析の復旧手順は`AI_EXECUTION_TROUBLESHOOTING.md`を正本とする。

## 1. 適用関係

文書を一列の優先順位で競合させず、判断対象ごとに正本を分ける。

| 判断対象 | 正本 |
| --- | --- |
| 作業範囲・権限 | 利用者の現在の明示指示・承認とChatGPTプロジェクト全体指示 |
| 目的・対象・product write上限・禁止・成功／停止条件 | 最新のタスク固有指示 |
| field・response path・aggregate verdict・冪等性 | 現行source、schema、SDK等のinterface／protocol正本 |
| 実行・検証・保存・証拠手順 | 本書。`AGENTS.md`は入口と変更禁止境界だけを示す |
| 解析復旧 | `AI_EXECUTION_TROUBLESHOOTING.md` |
| 監査スレ、監査作業スレ、管理スレ、監督スレ、TA／CP、finding、TODO／Tの受け渡し | `AUDIT_THREAD_RULES.md` |

- TODO化、既存Tへの吸収、新規T作成・採番、priority、owner、依存関係は`AUDIT_THREAD_RULES.md`に従い管理スレが専有する。監査起点intakeは`AUDIT_INSTRUCTION`→`AUDIT_RESULT`→`AUDIT_ACCEPTANCE`を経るが、通常報告と利用者要求は監査を経ず管理スレが直接受理する。監督は登録済みTだけを技術監督する。
- 監査系列は通常T系列の前提、release gate、close gateではない。監査が何もしなくても管理、監督、作業スレだけでTODO化からcloseまで完遂できる構造を維持し、管理は案件台帳、監督は全ての既存T、監査はfinding／TA／CPをそれぞれ独立して判定する。Tのcloseと監査closeを相互に自動伝播しない。
- 利用者の明示指示は許可範囲を狭められるが、監督が作るnext-instructionや実行シートは利用者のauthorization envelopeを説明・固定する二次成果物であり、利用者の明示なしに新しい禁止、file scope、tool／call回数、内部phase停止を追加しない。曖昧な表現や過去の承認から権限を広げない。
- developmentは、目的、成功条件、`ALLOWED_PRODUCT_WRITES`、`FORBIDDEN_EFFECTS`を固定し、それ以外の可逆なlocal変更、関連fileへの修正、調査、test、build、read-only確認、内部回復、手段変更を許可する禁止リスト方式とする。監督またはタスク指示は、観測済みの具体的危険と直接対応する場合を除き、これらを網羅的な許可リストへ変換しない。
- main／production、未許可のlogical product write、control-plane write、不可逆操作は許可リスト方式を維持し、environment、対象、操作、上限を利用者承認へ固定する。developmentの禁止リスト方式からこれらの権限を推論しない。
- タスク指示が固定するのは目的、対象、権限、不変条件、成功条件、真の停止条件である。内部のcommand、tool、workspace、順序、retry、helper等は、外部効果や安全境界そのものを定める場合を除き実行計画であり、作業中に再計画できる。一つの指示は内部成果物ではなく、利用者が確認できる成果または真の外部境界までを単位とし、その間は同じタスクと権限範囲が継続する。
- タスク指示の略記や古いfield名から、現行interfaceと異なる仕様を作らない。
- 旧指示、旧result、会話ログは履歴であり、最新版と累積適用しない。
- 同じ判断対象の真の矛盾だけを利用者へ確認する。解析で解消できる差は同じ作業内で直す。

### 成果物routerと個別指示の単一参照方式

進捗ごとに成果物を積み増さず、起きた変化に対応する一種類だけを作る。

| 起きた変化 | 作る成果物 | 作らないもの |
| --- | --- | --- |
| 目的、対象範囲、継続的なauthorization envelope、不変条件、成功条件、真の停止条件のいずれかが実質的に変わった | `NEXT_INSTRUCTION` | checkpointや一操作の承認を新しい指示へ昇格しない |
| 契約は同じで、現在地、candidate、完了済み工程、外部write件数、再開点だけが変わった | `CHECKPOINT` | `NEXT_INSTRUCTION`、正式result |
| 承認が必要な一つの外部操作または利用者専用操作へ到達した | `EXECUTION_SHEET` | 契約が変わらない限り`NEXT_INSTRUCTION` |
| 第10節のterminal boundaryへ到達した | `RESULT` | 継続用`NEXT_INSTRUCTION` |
| threadを移すが契約は変わらない | 最新instructionとcheckpointを指す短い`HANDOFF` | 指示本文の複製、指示の改版 |
| 利用者要求、通常報告、不具合報告、または受理済み監査findingをTODO系列へ取り込む | 管理スレの`TODO_DECISION` | 監査artifact、`NEXT_INSTRUCTION`、技術的close判定 |
| 監査系列の正式受け渡し | `AUDIT_THREAD_RULES.md`所定のartifact | 通常Tの指示・resultとの混載 |

`NEXT_INSTRUCTION`は本書を共通policyの唯一の直接参照先とする。参照にはpathと、参照する本文を一意に固定できるpolicy commitを記載し、branch名や会話上の最新版だけから内容を推測しない。

```text
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ <product-commit>
```

`NEXT_INSTRUCTION`へ記載するのは、今回固有の継続契約だけとする。一操作だけの外部write承認は`EXECUTION_SHEET`で固定し、その承認・消費だけを理由に指示を改版しない。

- TASK、対象、目的
- target ref、固定write対象等、変更するとauthorizationが変わるidentity
- 利用者が今回承認したproduct／control-plane writeと上限、および今回固有の禁止効果
- 維持すべき不変条件
- 成功条件と、許可済み内部回復では越えられない真の停止条件

base、current candidate、完了済み工程、未完了、診断結果、再開点等の進行状態は`CHECKPOINT`へ置き、契約を変えない限り`NEXT_INSTRUCTION`へ移さない。本書、`AGENTS.md`、`AI_EXECUTION_TROUBLESHOOTING.md`、`AUDIT_THREAD_RULES.md`に既にある保存方法、検証順、自己回復、retry、報告形式、役割分担は個別指示へ複製しない。これらの共通規則を、作業ごとのcommand、file、tool、順序、内部checkpointの許可リストへ展開しない。

旧指示、旧result、会話要約をpolicy参照先にせず、そこから条件を連鎖継承しない。最新instructionだけで契約とauthorizationを判定し、最新checkpointだけで現在地と再開点を判定する。再開に必要なartifactは正本のpath、record commit、blob、Library ID等を直接指せるが、そのartifactに書かれた過去の指示全体を累積適用しない。

詳細な操作列を持つ実行シートは、main／production、DB／migration／recovery、回数制限付き本番操作、利用者専用画面操作等、対象と不可逆な外部効果を事前固定する必要がある境界に限る。実行シートはその一操作のための一回限りの成果物であり、通常のnext-instructionへ手順を持ち越さない。

`POLICY_REFERENCE`、checkpoint、manifest、result、実行シートは、新しい権限または禁止を付与しない。利用者の現在の明示指示・承認と矛盾する場合は、利用者の境界を維持する。

新しい実行入口となる`NEXT_INSTRUCTION`は、checkpoint repositoryのbranch `ops/game-fields-supervisor-records-20260803`、`docs/gpt-save/`へ新規immutable Markdownとして保存する。record commit、blob、path、内容をremote read-backした後だけ作業スレへ引き渡す。保存不能なら`INSTRUCTION_RECORD_UNSAVED / AT RISK`とし、チャット本文だけを正式な新入口として扱わない。同じ契約の継続、checkpoint、承認待ち解除、内部phase進行、thread移行だけでは改版しない。

保存前の重複・混載検査には`scripts/check-development-artifact-policy.mjs`を使う。検査を通すために本文へfieldや手順を追加せず、共通規則、進行状態、別artifactを取り除く。

## 2. 作業開始ゲート

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

### Runtime Roomの環境別許可

ここでいう`Room`はGame Fields製品runtime上のRoomであり、ChatGPTの会話スレッドを意味しない。

- developmentでは、タスクの実装・再現・runtime検証に必要なRoomの作成、通常操作、正規導線によるcleanupを事前許可済みとする。Roomごとの追加承認や一律の作成数上限を設けず、既存Roomのcleanup未確認だけを理由に新規Roomを一律禁止しない。
- developmentでcleanupまたはremaining read-backが失敗した場合は、そのRoomとfailure classを記録して許可済み内部回復を行う。同じ障害で永続状態を無制限に増殖させる具体的危険が確認された場合だけ、その作成経路を止める。無関係なRoom作成やタスク全体の停止へ自動拡張しない。
- main／productionでのRoom作成は、environment・目的・対象を特定した利用者の明示承認を必要とする。承認済みRoomの目的達成に必要な通常操作とcleanupは、個別指示で狭められていない限り同じ許可に含む。devでの許可、過去タスクの許可、read-only検査の許可を流用しない。
- environmentを問わず、Room code、secret、Cookie、token等をGit、正式result、共有ログへ保存しない。DB／Redis管理write、認証・権限変更、別environment操作はRoom許可に含めない。

## 4. タスク所有権・実行継続・停止

一度受理したタスクは`TASK_ACTIVE`とし、成功条件を満たした`TASK_DONE`、または許可済み内部回復では解消できない真の外部依存を立証した`EXTERNAL_BLOCKED`まで実行側が完遂責任を持つ。途中の失敗、検証、手段変更、承認待ち、dev反映、観測、修正は同じタスクの内部進捗であり、所有権を利用者や監督へ戻さず、完了報告、正式result、next-instructionの境界にしない。

第一目的は、固定した権限と不変条件の中でタスクの成功条件を満たすことである。安全規則、checkpoint、証拠、報告は完遂を支える境界・手段であり、それ自体を成功や停止目標にしない。

受理時に固定したauthorization envelopeは`TASK_ACTIVE`の間継続する。新しい指示または承認を求めるのは、対象範囲、権限、固定済みwrite対象、許可回数または不可逆性が実質的に変わり、現在のenvelopeでは必要操作を覆えない場合だけとする。承認待ちは外部writeの実行ゲートであってタスクの終了ではなく、承認後はnext-instructionを介さず同じ`TASK_ACTIVE`から再開する。

許可済み範囲では、タスクの成功条件または真の停止条件まで連続して進める。local commit、checkpoint、承認済みpush、`READY`、tool探索、parser修正、read-only確認の完了だけで作業を分割しない。

tool名、schema、response path、parser、binding、許可済みread-only経路の見落としは、`AI_EXECUTION_TROUBLESHOOTING.md`に従い同じ作業内で修正する。途中経過は共有してよいが、許可済みの次工程を止めない。

実行計画は適応的に扱う。選択したcommand、tool、workspace、順序、retry、helper等が失敗した場合は、目的、権限、不変条件を維持したまま方法を再計画する。観測された一箇所だけを直して再実行せず、同じfailure classと残りの実行flowを横断監査し、許可済み範囲で修正・再検証を続ける。実行方法の失敗を正式resultや次指示の境界へ変換しない。次指示を発行するのは、第1節の契約情報が実質的に変わる場合に限る。

監督が作業停止を要求するには、次に必要な具体的操作と、その操作が越える明示済みの禁止線、未許可write、不可逆性または利用者専用依存を一対一で示す。これを示せない「想定外」「確信不足」「指示書に未記載」「checkpointまたは監査時刻に到達」は停止理由ではなく、耐久保存後も同じ`TASK_ACTIVE`で続行する。checkpointと定期監査はreview triggerであり、authorizationの失効やタスク終了ではない。

`TASK_ACTIVE`から正式に停止するのは次の場合に限る。

- 未許可の外部write、push、Deployment、production反映が必要
- project、repository、remote、branch、commit、environmentの真の不一致から復帰不能
- 利用者判断で結果が大きく変わる仕様分岐
- 許可範囲を超える修正が必要
- 認証、権限、接続、外部service障害で継続不能
- Portal owner承認など利用者専用操作が現在の依存点
- タスク指示が対象操作と継続不能理由を対応づけて明示した停止条件へ到達

正式停止には、残る成功条件、許可済み回復を尽くした証拠、内部回復では解消できない理由、現在必要な外部依存、再開に必要な次の一操作を対応づける。これを立証できない`BLOCKED`、`INCONCLUSIVE`、環境・tool・手順上のfailureは`INTERNAL_RECOVERY_REQUIRED`という内部診断にすぎず、`TASK_ACTIVE`から状態遷移しない。正式resultを作らず、次指示も発行せず、同じ指示のまま再計画して続行する。監督は立証を欠く停止報告をterminal resultとして受理しない。

通常のGit push承認待ちは実行停止点にはなり得るが、それだけで正式resultを作るterminal boundaryにはしない。

## 5. 実装と検証

- 再現条件、根本原因、影響範囲を確認し、共通境界で恒久修正する。
- 外部writeを伴う診断は、read-onlyまたはlocal再現で足りないことを確認してから承認を求める。
- local、mock、isolated Preview、formal Preview、dev、productionを相互代用しない。
- 変更後は、focused test、変更境界の回帰、repository gate、必要なruntimeシナリオの順で検証する。
- 文書・契約変更では、内容を固定するcontract testと`git diff --check`を最低限実行する。
- `NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`、対象変更の失敗を区別する。

検証深度はenvironment、可逆性、影響に比例させる。

- devは早期の実装・runtime feedback自体に価値がある検証環境である。candidate commit、更新前dev SHA、rollback先、変更範囲を固定し、不可逆なmigration／data write／認証・権限変更を含まない可逆な変更では、実装、利用可能な最短の関連check、承認済みdev反映、runtime観測、forward fixまたはrollbackを一つの`TASK_ACTIVE` feedback loopとして優先する。
- test、lint、build、視覚検証、全履歴artifactをdev push前の一律必須条件にしない。実行済みcheckと既知の未検証項目を承認依頼へ示すが、未検証項目だけでdev反映をblockしない。明白な破壊操作、secret混入、対象外差分はpush前に除外する。
- 同じturnでremoteへ到達できる場合はremote到達確認を耐久化とし、既知の更新前SHAをrollback targetにできる。Deployment／runtimeをdev検証の一部として使い、devを広く利用不能にするfailureではrollbackまたはforward fixを同じタスク内で判断する。
- 残る全体test、lint、build、runtime回帰は、変更リスクに応じてdev反映後に続け、main／production昇格前までに必要な全gateを満たす。
- production、不可逆操作、migration、認証・権限境界はdevの可逆性を根拠に緩和しない。

runtime／browser項目は`VALUE_VERIFIABLE`、`INTERACTION_REQUIRED`、`VISUAL_REQUIRED`へ分類する。値で判定できる項目へ不要なスクリーンショットを要求せず、視覚項目を値だけでPASSにしない。一つのbrowser経路の失敗だけで製品不具合または全面的な`BROWSER_UNAVAILABLE`と判定しない。

同種の検査でDevTools操作やスクリーンショットが反復する場合は、秘密を含まない診断表示、revision表示、計測hook、read-only endpoint等の製品改善候補へ登録する。

## 6. Git・Deployment・外部write

- local修正、test、task-owned local commitは個別禁止がなければ進めてよい。
- 製品repositoryへのpush／ref更新は、Deploymentの有無にかかわらず、repository、ref、更新前commit、candidate commitまたは承認済み固定tree、force有無を固定した利用者の明示承認を必要とする。
- Deploymentが起こり得る場合はProject、environment、影響も承認対象に含める。
- 実行側は承認前に、repository、ref、更新前commit、candidate commitまたは固定tree、force有無、environment、外部効果、禁止範囲を一つの実行シートへ固定する。利用者は識別可能な直前の実行シートを「この内容で進めて」等の短い自然文で承認でき、SHAや承認文全体を転記する必要はない。
- 固定したbase、tree、変更path、target ref、force有無、environment、外部効果が変わらない場合、direct push、Git-data materialization等のtransport選択は実行方法であり、追加承認を要しない。ref更新は承認済み回数を超えず、作成したcommitのparent／treeをread-backしてから行う。
- main／productionまたは不可逆操作では、ref更新前に最終commitを確定し、対象を特定した個別承認を得る。devの可逆な反映だけを理由にこの境界を緩和しない。
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

利用者操作は、利用者だけが実行できる能力または認証が現在必要な場合に限る。実行側の環境不足、未検証手順、実装上の不確実性を利用者操作へ移さない。依頼前に実行側で可能な調査、準備、検証を完了し、利用者には検証済みの一つの実行シートまたは成果物を渡す。PowerShell等の具体的な事前検証は`AI_EXECUTION_TROUBLESHOOTING.md`に従う。

## 9. 保存レベル

| Level | 対象 | 必須保存 |
| --- | --- | --- |
| L1 | 調査、相談、変更なし | チャット報告。明示要求がなければ正式result不要 |
| L2 | 通常の製品コード・正本文書変更 | 最終candidateを自分の変更だけlocal commit＋検証。remote未到達のままturnを終える場合は下記耐久checkpoint |
| L3 | migration、認証、重要基盤、復元困難な成果 | L2＋成果確定時点でbundle、manifest、fresh restore、耐久保存 |

正式resultと復旧用checkpointを分ける。正式resultは第10節のterminal boundaryでだけ作る。checkpointは現在地を失わないための非terminal成果物であり、契約、承認、報告、状態遷移を兼ねない。

- 再取得不能または回数制限のある外部responseは、取得と同じtool flowで秘密を除いたstructured JSONを新規immutable pathへatomic保存し、parse、deep equality、SHA-256、read-backを確認してから次のcall、解析、Markdown整形へ進む。machine outputの初回保存に`apply_patch`を使わない。
- 実装とfocused checkが一区切りついた時、外部操作前、または最後の耐久checkpointから約10分経過した時は`RECOVERY_CHECKPOINT`を作る。TASK、対象identity、task-owned commitまたは復元に必要な最小artifact、完了済み、未完了、外部write件数、再開点を新規immutable保存し、remote上のartifactと内容をread-backする。fresh restoreはこの軽量checkpointごとには行わない。
- scratch file、会話表示、実行中変数、local commitだけでは耐久保存完了としない。ただし同一turnの許可済みpushで正本remoteへ到達し、現在地もそこから一意に復元できる場合は、そのremote read-backをcode byteの耐久保存としてよい。
- 短時間の連続したread-only操作、内部retry、同じ意味の中間candidateは節目までまとめ、checkpoint、bundle、manifestを操作ごとに増やさない。
- checkpointには秘密、binding、Cookie、token、Room codeを含めない。

turn終了、承認待ち、利用者操作待ち、thread移行、workspace整理、長時間停止、別タスク移行、またはremote未到達bytesを失うrisk boundaryへ進む前は、最後の`RECOVERY_CHECKPOINT`を`FULL_RECOVERY_CHECKPOINT`へ確定する。内部retryや中間candidateごとには行わず、対象状態について次を1回行う。

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

相談、分析、個別指示、内部phase、local commit、checkpoint、通常のpush承認待ち、承認済みpush、`READY`、tool探索、schema／response path確認、parser修正、実行計画の修正、read-only retry、非product-write handshake、同一request IDの冪等照合は、それだけではterminal boundaryではない。

正式resultの保存先は`koromo2010/app-games-checkpoints`、branch `ops/game-fields-supervisor-records-20260803`、`docs/gpt-save/`とする。既存pathを更新せず、record commit、blob SHA、pathと内容のremote read-backを確認する。保存不能時は`RESULT_RECORD_UNSAVED / AT RISK`とする。

resultには、受領指示、実施範囲、状態、変更、commit／tree、検証、push・Deployment・外部write件数、blocker、未完了、次操作を含める。追跡対象TODOの既定名は`Game-Fields-T-<number>-result-v<NNN>-<YYYYMMDD>.md`とする。

## 11. 状態表示

タスクlife cycleは`TASK_ACTIVE`、`TASK_DONE`、`EXTERNAL_BLOCKED`で表す。`IMPLEMENTATION_COMPLETE`、`LOCAL_PASS`、`LOCAL_COMMITTED_UNSAFE`、`CHECKPOINT_SAVED`、`DEV_DEPLOYED`、`DEV_RUNTIME_PASS`、`PRODUCTION_DEPLOYED`、`PRODUCTION_RUNTIME_PASS`は`TASK_ACTIVE`中のmilestoneであり、それだけで所有権を手放さない。`CLOSED`は`TASK_DONE`かつタスク固有の完了条件をすべて満たした場合だけ使用する。`INTERNAL_RECOVERY_REQUIRED`は内部診断であり、状態遷移、正式result、close、次指示の根拠にしない。

Gitへ残す判断ログは、コードまたは正本仕様へ影響する確定事項に限定する。日々のTODO進行、指示書、result履歴はcheckpoint正本で管理する。
