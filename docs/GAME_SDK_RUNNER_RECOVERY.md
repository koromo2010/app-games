# Game SDK runner recovery contract

The shared owner for remote package-runner calls is
`lib/game-sdk-runner-client.ts`. Runtime adapters use it through
`lib/game-sdk-remote-module.ts`; release-time manifest verifiers call it
directly. `config/game-sdk-runner-consumers.json` is the checked consumer
inventory.

## Fixed-revision failure chain

The T-155 diagnosis proved that the selected release revision
`74e45e07fe1feb7855c2e246cdd358569e4d280c` was absent from the package
repository, rather than present with a mismatched hash. The common path now
preserves that distinction:

1. the Preview loader requests `server.bundle.js` at the exact granted
   revision;
2. after a content `404`, it checks that exact Git commit without consulting a
   branch head or another revision;
3. an absent commit becomes `SDK_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND` in the
   loader, `SERVER_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND` at the runner boundary,
   and `GAME_SDK_REMOTE_ARTIFACT_NOT_FOUND` at the caller boundary;
4. the exact-artifact breaker opens and prevents a request storm while other
   artifact identities remain independent.

An existing commit with an absent bundle path remains
`SERVER_RUNTIME_BUNDLE_NOT_FOUND`; a hash mismatch remains
`SERVER_RUNTIME_BUNDLE_HASH_MISMATCH`. None of these paths falls back to the
package branch head, a built-in game, a mock, or a different revision.

## Deadline and replay rules

One invocation budget covers every remote attempt, response-body read,
resource-effect pass, effect-journal operation, and best-effort feedback
capture. Each HTTP attempt also has a shorter abortable deadline. The Preview
source lookup and exact-commit discriminator have a separate bounded,
abortable source budget within the runner request.

Retries are bounded and use exponential jitter:

| Operation | Automatic retry eligibility |
| --- | --- |
| manifest verification | eligible; read-only |
| Room creation | only with the existing stable request ID |
| command | only with the existing stable command/request ID |
| command plus presentation | only with the existing stable command/request ID |
| standalone presentation | ineligible without an existing idempotency identity |
| resource-effect pass | only with the original request ID and effect journal |

Transport and timeout failures after dispatch retain an unknown outcome. The
caller never invents a new identity. Room and command persistence occurs only
after a valid runner result, while resource effects are executed through the
existing journal and are not run without one.

## Shared breaker and observability

The process-wide breaker has service and exact-artifact scopes. It exposes
closed, open, and half-open transitions; admits only one half-open probe; and
closes after a successful probe without restarting the process. Service
recovery does not clear an unrelated exact-artifact failure, and an artifact
failure does not suppress another artifact identity.

Dependency events contain only the public runtime ID, operation, bounded
attempt/status values, safe error code, and breaker state. Tokens, repository
source, Room codes, player identity, request IDs, prompts, and game payloads
are not logged.
