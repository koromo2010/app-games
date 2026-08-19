# SDK module governance

## Purpose

This is the human-readable audit of the canonical metadata in
`packages/game-sdk/src/modules/profile.ts`. Code must derive creator/player
projections, proposal eligibility, package `moduleUsage`, and runtime policy
from `GAME_SDK_MODULE_GOVERNANCE`; this table must not become a second policy
source.

`visibility=hidden` means that the module ID, label, decision, count, diff, and
help text are not part of that actor's product surface. `mutability=none` is
enforced server-side even if a caller constructs a request manually. An
unclassified new module fails the exhaustive TypeScript record and must not be
released with an implicit default.

`profilePolicy=required` is the default for common/progression modules;
`creator-choice` permits an owner-reviewed removal proposal;
`platform-standard` is always available through the Platform-owned path; and
`available` permits package use without making use mandatory or creator-toggleable.

## Exhaustive 39-module audit

All player mutability values are `none` in the current product.

| module ID | authority | creator visibility / mutability | player visibility | proposal | package treatment | runtime policy source |
| --- | --- | --- | --- | --- | --- | --- |
| `authentication` | platform | hidden / none | hidden | no | excluded | platform-policy |
| `account-session` | platform | hidden / none | hidden | no | excluded | platform-policy |
| `authorization` | platform | hidden / none | hidden | no | excluded | platform-policy |
| `persistence` | platform | hidden / none | hidden | no | excluded | platform-policy |
| `observability` | internal | hidden / none | hidden | no | excluded | internal-policy |
| `common-navigation` | platform | hidden / none | read-only | no | excluded | platform-policy |
| `player-menu` | platform | hidden / none | read-only | no | excluded | platform-policy |
| `common-shell` | platform | hidden / none | read-only | no | excluded | platform-policy |
| `online-room` | platform | hidden / none | read-only | no | excluded | platform-policy |
| `room-sync` | internal | hidden / none | hidden | no | excluded | internal-policy |
| `room-settings` | game-derived | read-only / none | read-only | no | derived | game-manifest |
| `debug` | internal | hidden / none | hidden | no | excluded | internal-policy |
| `timer` | game-derived | read-only / none | read-only | no | derived | game-manifest |
| `result` | game-derived | read-only / none | read-only | no | derived | game-manifest |
| `rematch` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `dissolution` | platform | hidden / none | read-only | no | excluded | platform-policy |
| `stats` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `rating` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `replay` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `result-share` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `feedback` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `spectators` | creator | configurable / owner-review | read-only | yes | derived | creator-profile |
| `ai-activity` | internal | hidden / none | read-only | no | excluded | internal-policy |
| `ads` | platform | hidden / none | hidden | no | excluded | platform-policy |
| `start-guard` | game-derived | read-only / none | hidden | no | module-usage | game-package |
| `phase-flow` | game-derived | read-only / none | hidden | no | module-usage | game-package |
| `rounds` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `turn-order` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `collect-text` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `collect-choice` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `vote` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `role-assignment` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `team-assignment` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `secret-presentation` | game-derived | configurable / owner-review | read-only | yes | module-usage | game-package |
| `standard-outcome` | game-derived | read-only / none | hidden | no | module-usage | game-package |
| `content-source` | game-derived | read-only / none | read-only | no | module-usage | game-package |
| `llm` | game-derived | read-only / none | read-only | no | module-usage | game-package |
| `playing-cards` | game-derived | read-only / none | read-only | no | module-usage | game-package |
| `drawing` | game-derived | read-only / none | read-only | no | module-usage | game-package |

## Derived surfaces

- Creator Portal and SDK Preview list and serialize only creator-visible
  definitions. Player pages serialize only player-visible decisions. Each
  client reconstructs non-visible runtime defaults internally; only
  `configurable / owner-review` rows have creator controls.
- Proposal creation and editing accept only `proposal=yes` rows. Unknown and
  non-eligible IDs share one generic rejection so the guard is not an
  enumeration oracle.
- Package contracts separate `package treatment=module-usage` rows into
  required, available, and disabled sets. Every required row needs usage
  evidence. Available resources need a row only when the package uses them;
  disabled rows remain forbidden. Platform-owned and derived Shell work is not
  delegated back to a game package.
- `content-source` is the fixed Platform common-database path. Games without
  words do not have to call it, but word games cannot replace it with a local
  database. LLM, playing cards, and drawing remain available without a profile
  toggle and are never mandatory merely because they are available.
- Runtime evaluates the normalized full profile. Platform/internal rows are
  always required by their policy source, so a legacy creator decision cannot
  disable them.
- Legacy proposals are compatible only when their catalog digest matches the
  current governance and every diff row remains proposal-eligible. Otherwise
  the proposal ID and lifecycle status remain visible, but its specification,
  diff, impact, warnings, and audit diff are suppressed and approval is denied.

## Legacy T-105 proposal

Proposal `92257aed-dff9-4608-bd39-463b6885fa22` remains an untouched database
record. Its pending internal-module decision is not migrated, approved,
rejected, edited, or deleted by this change. Under the current governance it is
reported as `legacy-incompatible`, with `activeProfileChanged=false`; the owner
should leave it unapproved and create no replacement unless a later, separately
authorized product decision requires a creator-configurable change.
