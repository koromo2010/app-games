# Server-clock-aligned gameplay action window

この文書は、deadlineを持つ手動ゲーム操作のクライアント共通契約と、現在のconsumer inventoryの正本である。server側のauthorization、deadline、CAS、idempotency、timeout finalizationは各server/domain契約を正本とし、このクライアント層から緩和しない。

## 共通契約

- 時間源はT-187の`lib/server-clock.ts`だけを使用する。game別のoffset計算は持たない。
- HTTP Dateの観測はserved originとdocument sessionにscopedされ、Room code、game/round/turn generation、phaseを加えたscope keyでaction windowを分離する。
- server epochは観測時点から`performance.now()`の単調経過で進める。観測後のdevice wall-clock jumpはaction判定へ使わない。
- server sampleは`fresh / missing / invalid / stale`を区別する。既定freshnessは60秒で、Realtimeの45秒reconciliationより長い。
- deadlineなしは`OPEN`、freshなserver sampleでhard acceptance deadline以前は`OPEN`、hard deadline直後は`CLOSED`、sampleがmissing/invalid/staleなら`UNCERTAIN`とする。deadline一致時はserverと同じくまだ`OPEN`である。
- `UNCERTAIN`だけを理由にmanual actionを抑止しない。serverへ送信し、serverのauthorization、deadline、CASを最終判定にする。
- countdown deadlineとserver hard acceptance deadlineを分けられる。graceはserver policy由来だけを使い、behind clockを理由に延長しない。
- hookはserver-clock更新、250ms tick、visibility復帰、focus、pageshowで再計算する。Room/phase generation replacementで旧scopeのdispatchを破棄し、unmountでinterval、listener、pending scopeをdisposeする。
- stable action keyの同時manual／timeout draft dispatchは同じin-flight promiseを共有する。成功済みまたはauthoritative expiredのkeyは同scopeで再送しない。retryable/ambiguous failureだけ、利用者または既存reconciliation契約から明示再試行できる。
- authoritative expired responseはwindowを終端化し、manual actionをblind retryしない。timeout finalizationは別のstable event keyとT-187 retry/reconciliation契約を使う。

実装入口は`lib/gameplay-action-window.ts`、React lifecycle入口は`app/hooks/use-gameplay-action-window.ts`、共通表示入口は`app/components/GamePhaseTimer.tsx`である。

## Current consumer inventory

分類は作業開始時の判定を`1→2`で移行済みとして表し、game固有server ruleを残す経路は同時に`4`を付記する。

| Surface / consumer | Initial class | Result | Thin adapter / preserved authority |
| --- | --- | --- | --- |
| WordWolf clue | 1 + 4 | 2 | `submit-clue:<actor>`を共通dispatch gateへ移行。server command scope、deadline/grace、CASを維持。 |
| WordWolf vote | 1 + 4 | 2 | `cast-vote:<actor>`を共通dispatch gateへ移行。server vote eligibilityを維持。 |
| WordWolf wolf guess | 1 + 4 | 2 | `submit-wolf-guess:<actor>`を共通dispatch gateへ移行。authoritative expiryはterminal、AI judgementはserver正本。 |
| Tahoiya writing/voting countdown and entered-definition adoption | 1 + 4 | 2 | active debug/player durationをscopeへ含め、server phase/domain ruleを維持。 |
| Word Scale clue/arrange countdown and entered-clue adoption | 1 + 4 | 2 | clue draftだけprimary deadlineで採用。arrange/score ruleはserver正本。 |
| Word Out clue/guess countdown, entered associations, phase expiry | 1 + 4 | 2 | primary deadlineのdraft adoptionとgrace後のexpiryを分離。 |
| Code Intercept code-length/clue/answer countdown, entered clues, phase expiry | 1 + 4 | 2 | team/clue/answer ruleはadapterに残し、claimant delayはdeadline延長ではなくfinalization分散として維持。 |
| Word Sonar secret/turn countdown and entered text/challenge adoption | 1 + 4 | 2 | text validationとtarget ruleはgame domainに残す。 |
| Northern Branch turn countdown and expiry | 1 + 4 | 2 | turn action authorizationとmarket/building ruleはserver正本。 |
| Daifugo turn countdown/finalization | 2（T-187 finalizer）、表示のみ1 | 2 | T-187 `useAuthoritativeTimeoutFinalizer`を維持し、countdownだけ共通windowへ移行。play/passはserver判定。 |
| Common built-in Room timer (`GamePhaseTimer`) | 1 | 2 | 全callerがRoom generation/phase scopeを必須指定。 |
| SDK Frame / Preview Frame | 2（T-187 finalizer/pending command）、表示のみ1 | 2 | generic Frameにgame/action名を追加せず、`timer.turnSequence` scopeとpackage server validationを維持。 |
| Approved SDK shell | 2（T-187 finalizer/pending command）、表示のみ1 | 2 | generic SDK timerとstable command/pending gateを維持。 |
| Legacy SDK authoring Preview shell | 1 + 4 | 2 | server-backed Room authorityを持たない模擬surface。Preview session responseのHTTP DateをT-187へ観測し、端末時計ではなくfresh server snapshotだけを`timer:sync`起点に使用。sample不確定時はtimer authorityを捏造しない。 |
| SDK package client runtime | 2 | 2 | Date.nowはtransport telemetryとHTTP Date samplingだけ。manual availabilityはserver-projected View、command resultはserver正本。 |
| Canvas | 3 | 3 | 勝敗phase、deadline付きmanual action、countdownを持たない。 |
| Common chat / Room shell navigation | 3 | 3 | deadline付きgameplay actionを持たない。realtime/chat契約は変更しない。 |

## Failure behavior

- sampleがmissing/invalid/staleの間、countdownは推定値を表示せず「サーバー時刻を同期中」とするが、manual actionは送信可能である。
- fresh sampleでcountdownが0になっても、server policyのgrace内はmanual dispatchできる。hard deadline後だけlocal stateを`CLOSED`にする。
- serverがexpiredを返したmanual actionは同じscope/action keyで再送せず、最新Roomをread-backしてtimeout finalizationへ委譲する。
- sleep/resumeやvisibility復帰時はdevice wall clockではなく、単調投影と新しいHTTP Date observationを使用する。sampleがstaleなら次のRoom readまで`UNCERTAIN`を維持する。
- Room、game/round/turn generation、phaseが変わると旧timer、draft key、terminal expiryを新scopeへcarryしない。
