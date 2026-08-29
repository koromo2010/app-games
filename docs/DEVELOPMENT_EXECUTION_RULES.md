# 開発実行正本

この文書は、`koromo2010/app-games`の開発で常に参照する唯一の実行正本である。ここには、権限、優先原則、task lifecycle、停止条件、成果物routerとサテライトへの導線だけを置く。具体的な手順は該当するサテライトを必要なときだけ読む。

本書もサテライトも利用者から新しい権限を得る文書ではない。個別タスク、障害、tool、commit、URL、transport、call回数に由来する制約を、利用者の明示なしに全体の恒久ルールへ昇格しない。

## 1. 正本とサテライト

| 判断対象 | 参照先 | 読む条件 |
| --- | --- | --- |
| 共通原則、権限、task lifecycle、停止、成果物router | 本書 | 常に読む |
| preflight、write計数、Room、実装・検証、Git、Deployment、runtime、証拠 | [`DEVELOPMENT_DELIVERY_RUNBOOK.md`](./DEVELOPMENT_DELIVERY_RUNBOOK.md) | 実装、検証、外部操作を扱うとき |
| checkpoint、保存、正式result、状態表記 | [`DEVELOPMENT_RECORDS_RUNBOOK.md`](./DEVELOPMENT_RECORDS_RUNBOOK.md) | 記録、引継ぎ、結果を扱うとき |
| tool、schema、browser、helperの自己回復 | [`AI_EXECUTION_TROUBLESHOOTING.md`](./AI_EXECUTION_TROUBLESHOOTING.md) | 実行経路が詰まったとき |
| 監査、管理、監督、TA／CP、finding、TODO／T | [`AUDIT_THREAD_RULES.md`](./AUDIT_THREAD_RULES.md) | その役割や受け渡しを扱うとき |
| 現行仕様と詳細文書の索引 | [`README.md`](./README.md) | 対象仕様を探すとき |

サテライトは本書の委任先であり、本書と同格の第二正本ではない。各サテライトは`APPLIES_WHEN`、`DOES_NOT_APPLY`、`AUTHORITY`を持ち、本書の原則、利用者の現在の指示、最新のタスク契約を上書きしない。

- 共通規則は本書または一つのサテライトだけに置き、個別指示、実行シート、checkpoint、resultへ複製しない。
- 旧指示、旧result、会話ログ、過去の障害記録は履歴であり、最新版へ累積適用しない。
- 新しい恒久規則は、複数タスクに再利用でき、観測済みの再発classへ対応し、既存原則では防げず、開発速度への負担より効果が大きい場合だけ追加する。そうでなければ個別タスク内の一時的な実行判断とする。
- 個別タスクの番号、特定commit、URL、credential、transport、画面操作、回数上限を恒久ルールへ固定しない。必要ならそのタスクの契約または一回限りの実行シートへ置く。
- 監査系列は通常T系列の前提、release gate、close gateではない。監査が何もしなくても管理、監督、作業スレだけでTODO化からcloseまで完遂できる構造を維持する。

### ルール変更の所有権

監督スレ、監査スレ、監査作業スレ、作業スレは、本書、routerに登録されたサテライト、`AGENTS.md`の実行入口、およびそれらの強制検査を変更、削除、上書き、一時停止してはならず、その変更candidateを作成する権限も反映を承認する権限も持たない。各スレは問題、証拠、期待する効果を管理スレへルール変更候補として報告できるだけである。

管理スレは通常時にはルール変更候補の整理・提案だけを行う。利用者が管理スレでルール変更を目的として明示的に開始した独立したルール保守作業に限り、正本・サテライト・実行入口・強制検査の変更candidateを作成できる。通常Tの着手・継続・close、next-instruction、execution sheet、checkpoint、resultへの承認、「続けて」「この内容で進めて」等の一般的な承認を、ルール保守の開始または反映承認へ流用しない。

管理スレのルール保守作業は、変更理由、既存原則で防げない理由、適用範囲、削除・統合する旧規則、開発速度への影響、candidate差分を示す。正本とサテライトの変更は通常の製品変更から分離し、利用者がそのcandidateの反映を別途承認するまでremote refへ反映しない。監督スレが発行する成果物は、この所有権境界を上書きできない。

## 2. 権限とタスク契約

判断対象ごとに次を正本とする。

| 判断対象 | 正本 |
| --- | --- |
| 作業範囲・権限 | 利用者の現在の明示指示・承認とChatGPTプロジェクト全体指示 |
| 目的・対象・product write上限・禁止・成功／停止条件 | 最新のタスク固有指示 |
| field・response path・aggregate verdict・冪等性 | 現行source、schema、SDK等のinterface／protocol正本 |
| 共通実行原則 | 本書 |

利用者の明示指示は許可範囲を狭められる。監督が作るnext-instructionや実行シートはauthorization envelopeを説明・固定する二次成果物であり、利用者の明示なしに新しい禁止、file scope、tool／call回数、内部phase停止を追加しない。曖昧な表現や過去の承認から権限を広げない。

developmentは、目的、成功条件、`ALLOWED_PRODUCT_WRITES`、`FORBIDDEN_EFFECTS`を固定し、それ以外の可逆なlocal変更、関連fileへの修正、調査、test、build、read-only確認、内部回復、手段変更を許可する禁止リスト方式とする。監督またはタスク指示は、観測済みの具体的危険と直接対応する場合を除き、これを網羅的な許可リストへ変換しない。

main／production、未許可のlogical product write、control-plane write、不可逆操作は許可リスト方式を維持する。environment、対象、操作、上限を利用者承認へ固定し、developmentの許可から推論しない。

タスク指示が固定するのは目的、対象、権限、不変条件、成功条件、真の停止条件である。内部のcommand、tool、workspace、順序、retry、helper等は、外部効果や安全境界そのものを定める場合を除き実行計画であり、作業中に再計画できる。一つの指示は内部成果物ではなく、利用者が確認できる成果または真の外部境界までを単位とし、その間は同じタスクと権限範囲が継続する。

タスク指示の略記や古いfield名から現行interfaceと異なる仕様を作らない。同じ判断対象の真の矛盾だけを利用者へ確認し、解析で解消できる差は同じ作業内で直す。

## 3. タスク所有権、継続、停止

一度受理したタスクは`TASK_ACTIVE`とし、成功条件を満たした`TASK_DONE`、または許可済み内部回復では解消できない真の外部依存を立証した`EXTERNAL_BLOCKED`まで実行側が完遂責任を持つ。途中の失敗、検証、手段変更、承認待ち、dev反映、観測、修正は同じタスクの内部進捗であり、所有権を利用者や監督へ戻さず、完了報告、正式result、next-instructionの境界にしない。

第一目的は、固定した権限と不変条件の中でタスクの成功条件を満たすことである。安全規則、checkpoint、証拠、報告は完遂を支える境界・手段であり、それ自体を成功や停止目標にしない。

受理時に固定したauthorization envelopeは`TASK_ACTIVE`の間継続する。新しい指示または承認を求めるのは、対象範囲、権限、固定済みwrite対象、許可回数または不可逆性が実質的に変わり、現在のenvelopeでは必要操作を覆えない場合だけとする。承認待ちは外部writeの実行ゲートであってタスクの終了ではなく、承認後はnext-instructionを介さず同じ`TASK_ACTIVE`から再開する。

許可済み範囲では、成功条件または真の停止条件まで連続して進める。local commit、checkpoint、承認済みpush、`READY`、tool探索、parser修正、read-only確認だけで作業を分割しない。

実行方法が失敗したら、目的、権限、不変条件を維持したまま再計画する。観測された一箇所だけを直して再実行せず、同じfailure classと残りの実行flowを横断監査し、許可済み範囲で修正・再検証を続ける。実行方法の失敗を正式resultや次指示の境界へ変換しない。

tool名、schema、response path、parser、binding、許可済みread-only経路の見落としは`AI_EXECUTION_TROUBLESHOOTING.md`に従って同じ作業内で修正する。実行側の環境不足、未検証手順、実装上の不確実性を利用者操作へ移さない。

監督が作業停止を要求するには、次に必要な具体的操作と、その操作が越える明示済みの禁止線、未許可write、不可逆性または利用者専用依存を一対一で示す。示せない「想定外」「確信不足」「指示書に未記載」「checkpointまたは監査時刻に到達」は停止理由ではない。checkpointと定期監査はreview triggerであり、authorizationの失効やタスク終了ではない。

`TASK_ACTIVE`から正式に停止できるのは次の場合に限る。

- 未許可の外部write、push、Deployment、production反映が必要
- project、repository、remote、branch、commit、environmentの真の不一致から復帰不能
- 利用者判断で結果が大きく変わる仕様分岐
- 許可範囲を超える修正が必要
- 認証、権限、接続、外部service障害で継続不能
- 利用者専用操作が現在の依存点
- タスク指示が対象操作と継続不能理由を対応づけて明示した停止条件へ到達

正式停止には、残る成功条件、許可済み回復を尽くした証拠、内部回復では解消できない理由、現在必要な外部依存、再開に必要な次の一操作を対応づける。これを立証できない`BLOCKED`、`INCONCLUSIVE`、環境・tool・手順上のfailureは`INTERNAL_RECOVERY_REQUIRED`という内部診断にすぎず、`TASK_ACTIVE`から状態遷移しない。正式resultを作らず、次指示も発行せず、同じ指示のまま再計画して続行する。監督は立証を欠く停止報告をterminal resultとして受理しない。

通常のGit push承認待ちは実行停止点にはなり得るが、それだけで正式resultを作るterminal boundaryにはしない。

## 4. 成果物routerと個別指示の単一参照方式

進捗ごとに成果物を積み増さず、起きた変化に対応する一種類だけを作る。

| 起きた変化 | 作る成果物 | 作らないもの |
| --- | --- | --- |
| 目的、対象範囲、継続的なauthorization envelope、不変条件、成功条件、真の停止条件が実質的に変わった | `NEXT_INSTRUCTION` | checkpointや一操作承認の指示化 |
| 契約は同じで、現在地、candidate、完了済み工程、外部write件数、再開点だけが変わった | `CHECKPOINT` | `NEXT_INSTRUCTION`、正式result |
| 承認が必要な一つの外部操作または利用者専用操作へ到達した | `EXECUTION_SHEET` | 契約が変わらない限り`NEXT_INSTRUCTION` |
| terminal boundaryへ到達した | `RESULT` | 継続用`NEXT_INSTRUCTION` |
| threadを移すが契約は変わらない | 最新instructionとcheckpointを指す短い`HANDOFF` | 指示本文の複製、指示の改版 |
| 利用者要求、通常報告、不具合報告、受理済み監査findingをTODO系列へ取り込む | 管理スレの`TODO_DECISION` | 監査artifact、技術的close判定 |
| 監査系列を受け渡す | `AUDIT_THREAD_RULES.md`所定のartifact | 通常T成果物との混載 |

`NEXT_INSTRUCTION`は本書を共通policyの唯一の直接参照先とする。pathと本文を一意に固定できるpolicy commitを記載し、branch名や会話上の最新版だけから推測しない。

```text
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ <product-commit>
```

個別成果物からサテライトを直接policy参照しない。本書の第1節routerを通じて必要なサテライトを読む。これにより個別成果物の参照先を一つに保ちながら、詳細手順を正本へ戻さない。

`NEXT_INSTRUCTION`には今回固有の継続契約だけを置く。進行状態は`CHECKPOINT`へ、一回限りの外部操作は`EXECUTION_SHEET`へ置く。旧指示、旧result、会話要約をpolicy参照先にせず、最新instructionだけで契約とauthorizationを判定し、最新checkpointだけで現在地と再開点を判定する。

`POLICY_REFERENCE`、checkpoint、manifest、result、実行シートは新しい権限または禁止を付与しない。保存方法と正式resultの詳細は`DEVELOPMENT_RECORDS_RUNBOOK.md`に従う。新しい実行入口を耐久保存できない場合は`INSTRUCTION_RECORD_UNSAVED / AT RISK`とし、チャット本文だけを正式な新入口として扱わない。

## 5. 人間が判断できる表示と承認

実装・監督報告は、先に次を自然文で示す。

1. 顧客または運用への現在の影響
2. 何が完了し、何が未完了か
3. 本当に停止しているなら、その外部依存
4. 次に行う一操作と最大影響、rollback
5. 利用者の操作または承認が必要か

commit、tree、blob、record ID、schema等は証拠欄へ分離する。利用者は識別可能な直前の実行シートを、対象と最大影響が変わっていなければ短い自然文で承認でき、固定文の再入力を必須にしない。対象や影響が曖昧な場合だけ確認する。

## 6. 優先順位と安全境界

顧客体験と現行利用者のblockerを、非緊急のhardeningや記録整備より優先する。ただし、進行中のexploit、secret露出、データ喪失、広範な利用不能、不可逆な破壊の具体的危険は割り込める。

次の安全境界は速度のために省略しない。

- secret、token、Cookie、接続文字列をGit、正式result、共有ログへ保存しない
- environment、repository、remote、branch、対象identityをwrite前に確認する
- dirty差分と無関係な変更を保持し、勝手に編集、stage、commitしない
- main／production、DB／migration、認証・権限、不可逆操作は明示承認の範囲内だけで行う
- 成功基準を失敗後に緩めず、実測していない環境を別環境の結果で代用しない

詳細なpreflight、実装、検証、Git、Deployment、runtime、証拠の手順は`DEVELOPMENT_DELIVERY_RUNBOOK.md`、記録と結果は`DEVELOPMENT_RECORDS_RUNBOOK.md`を参照する。
