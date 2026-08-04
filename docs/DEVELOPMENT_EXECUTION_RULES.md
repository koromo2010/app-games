# 開発実行ルール

この文書は、`app-games`での実装、検証、保存、Git操作、Deployment、証拠判定の正本である。スレッドの役割、TODO採番、指示書・結果書の管理はChatGPTプロジェクト側の運用ルールに置き、Gitへ重複させない。

## 1. 指示の優先順位

適用順は次のとおり。

1. 現在の利用者による個別指示と許可
2. タスク固有の指示書
3. 作業種別に該当する現行資料
4. `AGENTS.md`と本書の常設ルール

ただし、main／production Deployment、秘密情報、破壊的な外部writeの安全境界を、曖昧な文言や過去の許可で解除してはならない。矛盾がある場合は、推測で進めず対象と許可範囲を確認する。

## 2. 作業開始ゲート

開始時に次を確認する。

```text
TASK:
TARGET:
REPOSITORY:
WORKTREE:
BRANCH:
HEAD:
ALLOWED:
NOT_ALLOWED:
EXIT_CONDITION:
```

- 既存のdirty差分は所有者と対象を確認し、無関係な変更を編集、stage、commitしない。
- target commit、package revision、Project、semantic environmentが指定されている場合は開始前に一致を確認する。
- 認証、Cookie、プラグイン、ブラウザsessionの有無を推測しない。利用可能なread-only preflightで実状態を確認する。
- 人間操作が必要な場合は、service、screen、action、success condition、resume pointを一度に示す。

## 3. 実装原則

- 最初に再現条件と根本原因を特定する。workaroundしか安全に実施できない場合は、暫定であること、残る根本原因、恒久対応の条件を明記する。
- 共通化できる挙動は既存のdomain、Runtime、adapter、componentへ置き、ゲーム・画面・環境ごとの複製を増やさない。
- local、mock、isolated Preview、formal Preview、dev、productionを別の検証面として扱い、相互代用しない。
- 外部writeを伴う診断は、同等のread-onlyまたはlocal再現で足りないことを確認してから許可を求める。

## 4. 検証

変更後は、影響に応じて次の順で実行する。

1. 根本原因を直接覆うfocused test
2. 変更境界の回帰テスト
3. lint、typecheck、build等のrepository gate
4. UIまたはruntimeを変えた場合の実操作シナリオ

標準コマンドは`npm run lint`、`npm test`、`npm run build`だが、文書だけの変更では`git diff --check`等の内容に見合う検証でよい。依存不足や既存baseline failureは対象変更の失敗と混同せず、`NOT_RUN`、`BLOCKED`、`BASELINE_FAILURE`を区別する。

不具合修正では、可能な限り実際の利用者導線を再現する恒久テストを追加する。unit testがGreenでも、対象runtimeシナリオを代用したことにはならない。

## 5. 成果保存

保存強度は作業内容で決める。

| Level | 対象 | 必須保存 |
| --- | --- | --- |
| L1 | 調査、相談、変更なし | 作業結果の報告のみ |
| L2 | 通常の製品コード・正本文書変更 | 自分の変更だけlocal checkpoint commit＋検証 |
| L3 | migration、認証、重要基盤、復元困難な一時成果 | L2＋個別指定のbundle、closure、耐久保存 |

次は原則としてGit checkpoint対象外とする。

- 調査・分析だけ
- TODO指示書、監督結果、handoff等の運用Markdownだけ
- コードも正本文書も変更していない作業
- 個別指示が`NO COMMIT`の作業

bundle、immutable tag、object closure、remote read-back、追加保存は毎回行わない。scratch消失リスク、通常リポジトリにないGit object、L3指定がある場合だけ実施する。保存できなかった成果は消失と断定せず、`UNSAVED / AT RISK`として実在場所と復元可能性を報告する。

## 6. Push・Deployment許可

- ローカル修正、テスト、task-owned local commitは、個別禁止がなければ進めてよい。
- Git push自体ではなく、Vercel Deploymentが起こり得るかを許可境界とする。
- Deploymentが起こり得るpush、ref更新、Redeploy、設定変更は、実行前に対象Projectと環境を示して許可を得る。
- devは、1回または指定Project単位の明示許可後、同一修正のDeployment、build log、runtime確認まで進めてよい。
- main反映とproduction Deploymentはdevとは別の明示許可を必要とする。
- 過去の許可、Vercel表示上の`Production`、Deploymentされないだろうという推測を許可根拠にしない。
- force push、履歴改変、手動Redeploy、DB／Redis／Blob／OAuth／DNS／環境変数writeは、個別の明示許可と対象特定なしに行わない。

## 7. 証拠identity

CI、test、Deployment、runtime確認は、対象identityが一致した場合だけ採用する。該当する項目を最低限確認する。

```text
repository
branch
targetCommit
tree
vercelProject
semanticEnvironment
deploymentId / deploymentUrl
packageRevision
roomCode / testScenarioId
```

- target commitが違うCI Greenは対象修正の証拠にしない。
- Vercelの`READY`はDeployment完了であり、runtime動作成功ではない。
- build skip、ignored build、`CANCELED`を対象Projectの検証PASSにしない。
- dev結果をproduction結果へ、mock結果をformal Preview結果へ読み替えない。
- identity不一致を検出したら、内容評価より先に`EVIDENCE_IDENTITY_MISMATCH`として止める。

## 8. 状態と終了報告

単独の「完了」は使わず、到達した状態を組み合わせて報告する。

```text
IMPLEMENTATION_COMPLETE
LOCAL_PASS
CHECKPOINT_SAVED
DEV_DEPLOYED
DEV_RUNTIME_PASS
PRODUCTION_AUTHORIZED
PRODUCTION_DEPLOYED
PRODUCTION_RUNTIME_PASS
CLOSED
```

例: `LOCAL_PASS / CHECKPOINT_SAVED / DEV_DEPLOYMENT_PENDING`

終了報告には次を含める。

```text
STATUS:
ROOT_CAUSE:
CHANGED_FILES:
COMMIT / TREE:
VERIFICATION:
DEPLOYMENT:
RUNTIME_EVIDENCE:
UNRESOLVED:
NEXT_STATE:
```

`CLOSED`はタスク固有の完了条件をすべて満たした場合だけ使用する。production runtimeを完了条件とするタスクを、local PASSやDeployment `READY`だけで閉じない。

## 9. DurableなGit記録

Gitへ残すログは、コードまたは正本仕様へ影響する確定事項に限定する。日々のTODO進行、監督判定、指示書・結果書の履歴はChatGPTプロジェクト側で管理する。詳細は`docs/DEVELOPMENT_LOGGING.md`に従う。
