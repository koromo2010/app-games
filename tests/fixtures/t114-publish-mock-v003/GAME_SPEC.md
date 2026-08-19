# T-114 Publish Mock Fixture v003

## Identity

- Creator: `test10-1`
- Game ID: `t114-publish-mock-fixture`
- Title: `T-114 Publish Mock Fixture`
- Environment intent: `development`
- Play mode: `online-room`
- Players: exactly 2
- Contract state: `CONFIRMED_PROFILE_CARRY_FORWARD`

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

The fixture does not use the optional LLM, content-source, card, or drawing
resources. It also does not use voting, hidden roles, spectators, replay, or
rating. Room membership, lifecycle, settings, timer, revision, common
permissions, common storage, and common presentation remain platform/SDK-owned.

## Required source set

- `source/app-set.ts`
- `source/contracts.ts`
- `source/manifest.ts`
- `source/server-module.ts`
- `source/game-client.tsx`
- `source/prototype-adapter.ts`

## Required module contract

- `start-guard` via `assertGameSdkCanStart`
- `phase-flow` via `assertGameSdkPhase`
- `collect-choice` via `recordGameSdkParticipantValue` and `allGameSdkParticipantsComplete`
- `secret-presentation` via `gameSdkPlayerSeat` and `gameSdkPlayerSeats`
- `standard-outcome` via `defineGameSdkStandardResult`

Six unused flow modules are disabled by the confirmed profile. The four
external resource modules remain available and unconstrained; this fixture
simply does not use them. Runtime evidence is rendered into the game UI from
values produced by the actual state-transition/view path.

## Binding rule

The fixture carries forward confirmed revision
`4c029ae9-0eef-4b77-9625-b309d947dbcf` and module contract digest
`04a8d1f8ae6edb559c12d5717b738b29c9807cae928f0d5b62456393fbeb17f8`.
`manifest.json` is the canonical machine-readable game manifest.
`publish-input.json` maps every builder key directly to the same relative path;
no custom `mock/` remap or TypeScript manifest extraction is permitted.
Profile update, confirmation, and publish operations remain at zero in v014.
