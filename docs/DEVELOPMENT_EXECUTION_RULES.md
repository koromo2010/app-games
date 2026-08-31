# 開発実行正本

この文書は、`koromo2010/app-games`の開発で常に読む唯一の実行正本である。権限の出所、task state、続行・承認・停止の判断、成果物の責任、詳細文書へのrouterだけを置く。

本書、runbook、reference、checkpoint、実行シートは利用者から新しい権限を得ず、個別taskや一度の障害から全体の恒久規則を作らない。

## 1. 権限と所有権

| 判断対象 | 正本 |
| --- | --- |
| 作業範囲と外部writeの許可 | 利用者の現在の明示指示・承認とChatGPTプロジェクト全体指示 |
| 目的、対象、不変条件、成功条件、真の停止条件 | 最新のtask contract |
| field、response path、protocol、仕様 | 現行source、schema、SDK等のinterface正本 |
| 共通の実行判断 | 本書 |

task contractが固定するのは目的、対象、authorization envelope、不変条件、成功条件、真の停止条件である。command、tool、workspace、transport、順序、retry、helperは、外部効果や安全境界を変えない限り再計画できる。

現在のauthorization envelope内の可逆な作業は進める。通常のprototype／development taskの受理は、対象scope内のlocal実装、test、Preview、`develop`のnon-force更新、決定的な自動Development delivery、runtime観測、forward fixまたはrollbackを一つのstanding authorizationとして扱う。同じscopeと最大影響のままなら、phase、retry、commit、Deployment、checkpointごとの承認へ分割せず、単一failureでこの権限を消費済みにしない。

追加承認が必要なのは、main／production、実利用者または再生成不能なdataへの変更、不可逆なmigration／data write、secret・認証・権限・接続設定の変更、課金や公開等の独立した外部効果である。environment名だけで安全性を決めず、専用developmentでも再生成不能なdataを持つ場合は保護し、Previewや自動配備でも別environmentまたは最大影響が変わる場合は権限を流用しない。

write結果や永続状態が不明で同じ操作の再実行が重複・破壊を招き得る場合は、そのwriteとretryだけを止める。許可済みread-only照合、local原因修正、検証、記録は追加承認なしで続け、状態または次の保護対象operationを確定する。

ルール変更の所有者は利用者である。通常taskの承認をルール保守やremote反映へ流用せず、candidateのremote反映には別の利用者承認を必要とする。役割別の保守手順はGovernance Runbookへ委任する。

承認はtool callではなく、利用者が判断する一つのlogical changeを単位とする。直前の対象と最大影響が一意なら短い自然文で承認でき、固定文言を必要としない。表示と記録はRecords Runbookへ委任する。

## 2. Decision kernel

task stateは次の三つだけである。

| 状態 | 判定 |
| --- | --- |
| `TASK_ACTIVE` | 受理後の既定状態。内部回復、検証、承認待ち、dev反映、観測を含む |
| `TASK_DONE` | 成功条件を満たし、対象identityと必要証拠をread-backした |
| `EXTERNAL_BLOCKED` | 許可済み内部回復では越えられない外部依存だけが残った |

その他の状態名はmilestoneでありtask stateではない。利用者が中止または置換を明示した場合だけ、`TERMINAL_DISPOSITION: USER_CANCELED`または`SUPERSEDED:<replacement>`として所有を終了する。

各判断では上から最初に一致する行を使う。

| 観測 | 行動 |
| --- | --- |
| 利用者がtaskの中止または置換を明示した | terminal dispositionと未実行の外部効果を記録して終了する |
| 成功条件を満たし、identityと証拠が一致する | `TASK_DONE`として結果を作る |
| 利用者専用操作、仕様分岐、権限・接続・外部service等が唯一の残存依存である | 根拠と次の一操作を示し`EXTERNAL_BLOCKED`とする |
| 未承認の外部writeまたは不可逆操作が次に必要である | approval requestを作り、`TASK_ACTIVE`のまま承認を待つ |
| write結果または永続状態が不明で、同じwriteの再実行が危険である | writeとretryだけを止め、read-only照合とlocal原因修正を続ける |
| 現在のauthorization envelope内で可逆に進められる | 利用者へ返さず続行する |
| tool、schema、parser、transport、browser、手順、検証が失敗・不明である | 再計画し、`TASK_ACTIVE`のまま内部回復を続ける |

正式停止には、残る成功条件、試した内部回復、内部では解消できない理由、必要な外部依存、再開に必要な一操作を対応づける。これを示せないfailure、checkpoint、時間経過、単一手段の失敗は停止理由ではない。

一度受理したtaskはterminalまで実行側が所有する。承認待ちは外部writeのgateであってtask終了ではなく、承認後は同じ`TASK_ACTIVE`から再開する。

## 3. Task contractと成果物

task contractはtask固有のauthorizationと成功条件を固定し、共通policyを複製しない。契約の実質変更時だけ更新し、現在地の変化では改版しない。

承認済みpolicyは既存の`TASK_ACTIVE`にも次回再開時から適用するが、task固有の権限、不変条件、成功条件を変更しない。artifactには実際に適用したremote commitを`POLICY_APPLIED`として記録し、取得・再利用方法は`AGENTS.md`とRecords Runbookへ委任する。

| 役割 | 所有する情報 |
| --- | --- |
| `TASK_CONTRACT` | 目的、対象、authorization、不変条件、成功・停止条件 |
| `CURRENT_STATUS` | 現在地、外部write件数、未完了、再開点 |
| `APPROVAL_REQUEST` | 一つの利用者判断、最大影響、事前条件、rollback |
| `FINAL_RESULT` | terminal dispositionと直接証拠 |

成果物のlabel、field、保存、handoff、legacy互換はRecords Runbook、`TODO_DECISION`と監査artifactはGovernance Runbookへ委任する。

## 4. Router

| 必要な情報 | 参照先 | 種別 |
| --- | --- | --- |
| preflight、write計数、実装、検証、Git、Deployment、Room、runtime、証拠 | [`DEVELOPMENT_DELIVERY_RUNBOOK.md`](./DEVELOPMENT_DELIVERY_RUNBOOK.md) | 手順runbook |
| artifact、current pointer、checkpoint、復旧、result、表示 | [`DEVELOPMENT_RECORDS_RUNBOOK.md`](./DEVELOPMENT_RECORDS_RUNBOOK.md) | 記録runbook |
| tool、SDK response、browser、helper、PowerShellの既知手法 | [`AI_EXECUTION_TROUBLESHOOTING.md`](./AI_EXECUTION_TROUBLESHOOTING.md) | 非規範reference |
| 監査、管理、監督、rule maintenance、finding、TODO／T | [`AUDIT_THREAD_RULES.md`](./AUDIT_THREAD_RULES.md) | governance runbook |
| 現行仕様と詳細文書の索引 | [`README.md`](./README.md) | navigation |

runbookは許可済み作業の方法だけを定め、権限、task state、停止条件を新設しない。referenceは検索用の既知手法でありpolicyではない。旧指示、旧result、会話ログ、過去の障害記録を現在の規則へ累積適用しない。

## 5. 優先原則

顧客体験と現行利用者のblockerを非緊急hardeningや記録整備より優先する。ただし、secret露出、データ喪失、広範な利用不能、不可逆な破壊の具体的危険は割り込める。
