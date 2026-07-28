# Async Loading and Pending UX Audit

Updated: 2026-07-28

## Purpose

This audit supports the performance/UX initiative. It identifies asynchronous operations where users can experience an unexplained wait, duplicate-submit risk, over-broad blocking, stale completion, or ambiguous failure.

Broad optimistic UI changes are intentionally deferred until the room-read telemetry baseline is available.

## Classification

- **P0**: incorrect or unsafe operation can be dispatched.
- **P1**: no visible response, duplicate execution risk, or ambiguous failure on a primary game flow.
- **P2**: blocking is broader than necessary or feedback is too generic.
- **P3**: minor clarity or consistency issue.

Recommended pending patterns:

- **local pending**: disable and label only the control that initiated the operation.
- **blocking pending**: block the relevant interaction surface because concurrent actions would be unsafe.
- **optimistic display / confirmed execution**: update display immediately but keep commands disabled until authoritative state is ready.
- **background sync**: do not block; expose connection/retry state only when degraded.

## Confirmed platform-frame findings

### 1. Shared command/lifecycle pending state

**Code path:** `app/components/GameSdkFrame.tsx`, shared `run()` wrapper.

The frame uses one boolean `pending` and one `pendingActionRef` for multiple lifecycle and command operations. This prevents duplicate execution, but it does not identify which operation is running and can disable unrelated controls.

- Current feedback: generic pending state and generic message area.
- Duplicate protection: yes, through `pendingActionRef`.
- Failure recovery: `finally` clears pending; known runtime errors are translated to messages.
- Telemetry: room reads are measured; command/lifecycle duration is not yet covered by the new room-read telemetry.
- Severity: **P2**.
- Recommendation: replace the single boolean with an operation key such as `create-room`, `join-room`, `send-command`, `dissolve-room`, `debug-auto-progress`; disable only conflicting controls and show operation-specific text.

### 2. DEBUG viewer / actor switching

**Code path:** `app/hooks/use-game-sdk-debug-control-target.ts`.

The selected target is visible while synchronization is in progress, and authoritative command execution remains blocked until the viewer snapshot is confirmed. Retry, revision-refetch, and deadline behavior are now bounded and measured.

- Current feedback: switching state exists; caller can expose `isSwitching`.
- Duplicate protection: one in-flight request per generation.
- Failure recovery: retry/refetch limits and deadline return to a safe self state.
- Telemetry: operation-level DEBUG switch telemetry implemented.
- Severity: **P2** for presentation only; dispatch safety is covered.
- Recommendation: consistently render `同期中` beside the selected seat and keep only command controls disabled. Do not block unrelated room navigation.

### 3. Room restoration

**Code path:** `useGameSdkActiveRoomRestore()` consumed by `GameSdkFrame` as `isRestoringRoom`.

A dedicated restore state exists, but the audit must verify that every SDK shell variant renders it before room-list or create-room controls become actionable.

- Current feedback: dedicated state available.
- Duplicate protection: hook-controlled initialization.
- Failure recovery: caller error handler and room-list fallback.
- Telemetry: `readActiveRoom` is now measured.
- Severity: **P1** until rendering coverage is confirmed.
- Recommendation: show a stable `進行中の部屋を確認しています` state and defer empty-room UI until restoration completes.

### 4. Room watcher synchronization

**Code path:** `packages/game-sdk/src/client-realtime.ts`.

The watcher performs an initial authoritative read, then uses WebSocket revision notifications when available, periodic reconciliation, and polling fallback. Concurrent refreshes are coalesced through one `refreshPromise`.

- Current feedback: observer supports `connecting`, `connected`, `polling`, and `closed`, but frame-level visibility must be verified.
- Duplicate protection: concurrent reads are coalesced.
- Failure recovery: polling fallback and reconnect backoff.
- Telemetry: reads are classified as `watch-initial`, `watch-websocket`, `watch-reconciliation`, or `watch-polling`.
- Severity: **P2**.
- Recommendation: background sync under normal conditions; show a non-blocking degraded indicator only when the watcher remains in polling/reconnect mode beyond a threshold.

### 5. Stale revision recovery

**Code path:** `GameSdkFrame.run()`.

On `STALE_REVISION`, the frame performs an additional authoritative room read and attaches the latest room. This is safe, but the user receives a generic update message and the operation is not automatically replayed.

- Current feedback: `部屋を最新状態へ更新しました。`
- Duplicate protection: yes.
- Failure recovery: authoritative refetch.
- Telemetry: recovery read appears as a direct room read, but the originating command and recovery relationship are not correlated yet.
- Severity: **P2**.
- Recommendation: add a shared operation ID across command and recovery read; retain the user input where safe and explain that the action itself was not applied.

### 6. DEBUG auto-progress

**Code path:** `GameSdkFrame.autoProgressDebug()` using `room/debug-auto-progress` sequentially.

The implementation already waits for each authoritative command response before the next step and applies explicit step limits. It currently shares the general pending channel and reports completion through the generic message area.

- Current feedback: completion/error message after the batch; operation-specific progress is limited.
- Duplicate protection: shared `run()` guard when invoked through the standard path.
- Failure recovery: runtime errors and safety limits stop execution.
- Telemetry: room reads are measured, but each batch step is not yet summarized as one scenario.
- Severity: **P1** for long multi-step runs.
- Recommendation: expose `step / maximumSteps`, current phase, elapsed time, and a cancel action; produce a machine-readable summary for benchmark comparison.

## Next audit targets

The following areas still require code-path-by-code-path verification before this document is considered complete:

1. Room create, join, leave, dissolve, start, abort, and return-to-lobby control rendering.
2. Dummy add/remove controls.
3. Room settings updates.
4. SDK Preview startup and authentication refresh.
5. LLM-backed operations and AI activity indicator behavior.
6. Feedback/inquiry submission and administrator reply flows.
7. Native games outside the shared SDK frame.

## Immediate implementation priorities

1. **P1:** ensure room restoration always has visible pending UI before empty-room controls render.
2. **P1:** add step-level progress and cancellation to DEBUG auto-progress/scenario runs.
3. **P2:** replace the global `pending` boolean with operation-scoped pending state.
4. **P2:** expose persistent degraded realtime status only after a threshold.
5. **P2:** correlate stale-revision recovery reads with their originating command.

## Measurement dependency

Do not decide between polling reduction, WebSocket payload changes, or broad optimistic UI until the telemetry baseline includes:

- direct and watcher room-read counts by source,
- p50/p95 duration by source,
- DEBUG initial success, error retry, and revision-refetch rates,
- average requests per viewer switch,
- time from user action to authoritative ready state.
