# T-114 Publish Mock Fixture v002

## Identity

- Creator: `test10-1`
- Game ID: `t114-publish-mock-fixture`
- Title: `T-114 Publish Mock Fixture`
- Environment intent: `development`
- Play mode: `online-room`
- Players: exactly 2
- Contract state: `LOCAL_PROFILE_DELTA_PENDING`

This fixture is a secret-free local validation artifact. It is not a saved draft,
published mock, approved proposal, package, deployment, or runtime MCP result.

## Core loop

1. PLAYER 1 privately selects rock, paper, or scissors.
2. The UI reports that PLAYER 1 submitted without revealing PLAYER 2's hand.
3. PLAYER 2 privately selects a hand.
4. After both submissions, both hands are revealed together.
5. The result is shown as PLAYER 1 win, PLAYER 2 win, or draw.
6. Reset returns every visible and internal value to the initial state.

Rock beats scissors, scissors beats paper, and paper beats rock.

## Scope exclusions

The fixture does not use an LLM, Word DB, cards, drawing, voting, hidden roles,
spectators, replay, or rating. Room membership, lifecycle, settings, timer,
revision, common permissions, and common presentation remain SDK-owned.

## Required source set

- `src/app-set.ts`
- `src/contracts.ts`
- `src/manifest.ts`
- `src/server-module.ts`
- `src/game-client.tsx`
- `src/prototype-adapter.ts`

## Required module contract

- `start-guard` via `assertGameSdkCanStart`
- `phase-flow` via `assertGameSdkPhase`
- `collect-choice` via `recordGameSdkParticipantValue` and `allGameSdkParticipantsComplete`
- `secret-presentation` via `gameSdkPlayerSeat` and `gameSdkPlayerSeats`
- `standard-outcome` via `defineGameSdkStandardResult`

The other ten flow/resource modules are disabled by the accompanying profile
delta. Runtime evidence is rendered into the game UI from values produced by
the actual state-transition/view path.

## Binding rule

The profile delta targets confirmed base revision
`83c26b8c-18da-4933-a448-1c933ada1ea5`. It is a local future-execution
artifact only: profile update, confirmation, and publish operations remain at
zero in this task.
