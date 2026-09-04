# GF-CLAUDE-CODE-AUTHORING/__DOWNLOAD_ME_VERSION__

```text
DOCUMENT_CLASS := AI_EXECUTION_CONTRACT
HUMAN_DOCUMENTATION := false
PROTOCOL := game-fields-sdk
AUTHORING_CLIENT := Claude Code
TARGET_ENVIRONMENT := __SDK_ENVIRONMENT__
CANONICAL_MCP_URL := __SDK_MCP_URL__
ONBOARDING_PROFILE_ID := __ONBOARDING_PROFILE_ID__
```

## Scope

This profile is only for Claude Code in a dedicated empty game folder. It is
not a profile for regular Claude chat, Claude Desktop regular chat, or Cowork.
Never use an app-games checkout as the creator workspace. Do not ask the user
to install Node.js, npm, Git, or Vercel CLI as the default completion path.

The common workflow and invariants are authoritative from
`get_authoring_profile(clientId="claude-code")`; this file only defines Claude
Code connection, environment binding, workspace, and Node-free routing.

Do not implement prototype HTML, React UI, AppSet, or adapters before
`create_game_draft` and `get_game_module_requirements` return a fixed profile
revision, contract digest, SDK version, and an `initial-default` or
`human-confirmation` establishment kind. A new draft's system-default initial
contract does not require or claim human confirmation. If its canonical profile
changes, wait for human proposal review/confirmation before continuing. Honor
each module's delivery contract. Use official SDK
resources/helpers, injected platform-resource fixtures, and platform-owned host
delegation; never build bespoke substitutes or fictitious platform imports.

If a confirmed composition must change, call
`prepare_module_profile_update` with a stable requestId and only module IDs
explicitly exposed as creator-configurable by the current authoring surface. It creates a
reviewable proposal only. Check `isError` first, read the proposal ID from
`structuredContent.proposal.id`, and call
`get_game_module_profile_proposal` in the same tool flow with that ID and the
same binding. Verify the proposal ID, compatible state, pending state, public diff,
dependencies, impact, warnings, base revision/digest, sanitized audit,
`activeProfileChanged=false`, and `humanApprovalRequired=true` from that
read-back. Follow the read-back `reviewUrl` and wait for the owner-only Portal
approval before treating a new revision or digest as active.

If read-back reports a legacy-incompatible proposal, show only its generic
compatibility state and review URL. Do not request approval, display hidden
diff details, guess internal IDs, or retry with a reconstructed payload.

If the prepare outcome is unknown and no proposal ID can be parsed, reparse the
retained CallToolResult first. If the task's explicit tool-invocation limit
allows reconciliation, replay `prepare_module_profile_update` once with the
same frozen requestId and identical semantic payload; this is not a second
logical product write. Never invent a new requestId. A confirmed
pre-persistence serialization/schema error may be corrected once with the same
requestId only when the product decision is unchanged. After obtaining the ID,
recover read-back with `get_game_module_profile_proposal`; never create another
proposal because read-back failed.

## Remote HTTP MCP + OAuth

Use Claude Code's remote HTTP MCP support. Add exactly this URL:

```text
__SDK_MCP_URL__
```

Recommended CLI form when the user has not already configured the server:

```bash
claude mcp add --transport http __SDK_PLUGIN_NAME__ __SDK_MCP_URL__
```

Then run `/mcp`, select `__SDK_PLUGIN_NAME__`, and complete browser OAuth. The
server supports protected-resource discovery, authorization-server discovery,
dynamic client registration, S256 PKCE, refresh rotation, and the localhost
loopback `/callback` used by Claude Code. Never request OAuth tokens, browser
cookies, passwords, MFA codes, or Vercel credentials in chat or files.

MCP "Connected" and tool discovery are not workflow completion.

## Mandatory handshake

Before any other SDK tool, call `get_sdk_handshake` with:

```json
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": __SDK_HANDSHAKE_VERSION__,
  "client": { "kind": "ai-agent", "name": "Claude Code" },
  "expected": {
    "environment": "__SDK_ENVIRONMENT__",
    "canonicalMcpUrl": "__SDK_MCP_URL__",
    "onboardingProfileId": "__ONBOARDING_PROFILE_ID__",
    "platformVersion": "__PLATFORM_VERSION__",
    "sdkPackageVersion": "__SDK_VERSION__",
    "sdkContractVersion": __SDK_CONTRACT_VERSION__
  },
  "requiredCapabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish",
    "game-draft",
    "module-first-authoring",
    "module-usage-validation",
    "node-free-package",
    "game-package-publish",
    "formal-room-preview",
    "hash-pinned-promotion",
    "support-threads",
    "human-approved-reporting",
    "human-approved-support-replies"
  ]
}
```

Check the CallToolResult `isError` first and use `structuredContent` as the
payload. `accepted=true` is the aggregate verdict for the client, environment,
canonical MCP URL, onboarding profile, release, contract, and required
capabilities. Do not independently revalidate those same fields unless a
separate observation contradicts the verdict. Read the returned opaque binding
from `structuredContent.environmentBinding` and keep it only in tool-flow
memory. Pass it unchanged to every later SDK tool. Never decode, hand-enter,
persist, or reuse it across a Claude session, OAuth identity, URL, or
environment.

For `accepted=false`, classify `problems[*].code`. Correct a request or parser
that the current profile and source resolve, then repeat the handshake in the
same tool flow when the explicit invocation limit permits. Do not switch
environment, release, or mirror. Halt only for a true unresolved compatibility,
connection, or explicit invocation-limit blocker. When `structuredContent` is
absent, parse exactly one JSON text content item once as the compatibility
fallback; never search guessed wrapper paths.

The accepted handshake and post-handshake read responses also expose a public
`accountContext` with `accountRef`, `displayName`, `environment`, and
`contextVersion`. Treat `accountRef` as the canonical MCP account identity:
do not infer the account from the user's wording, a creator slug, a display
name, or the Portal URL. Before every owner-bound write, show the actual MCP
account and target creator once and pass that same `accountRef` as
`expectedAccountRef`. Missing, stale, different-account, or
different-environment values must fail closed before persistence. Never
request, display, persist, log, or transmit raw player IDs, OAuth grants,
tokens, Cookies, or the opaque environment binding.

Call `get_authoring_profile` with `clientId="claude-code"` and that binding.
Follow the returned common contract. Verify `structuredContent.sdkIdentity` in
every post-handshake response; halt before further read or write if its target
environment, canonical MCP URL, release, or onboarding profile mismatches the
fixed target.

## Claude Code execution profile

- Work only in the dedicated empty game folder.
- Create the specification first, then game draft. Continue from the system-default initial contract without calling it human-confirmed. Stop for human review only when a module change proposal exists.
- Freeze moduleProfileRevision, moduleContractDigest, SDK version, required/disabled lists and delivery contracts.
- Build `source/game-client.tsx`, AppSet/Command source and module components once. Use a prototype fixture adapter and formal Room adapter around that same source.
- Keep Platform room/lobby/settings/player/debug Shell out of the game-specific UI.
- `preview.json.reviewEvidence` must declare representative in-progress and
  completion states, at least four visible game-specific elements, primary
  action target/result IDs, completion result IDs, and a fixed/mock-only data
  source. All IDs must be observable in the interactive prototype.
- `publish_mock` is a compatibility tool name for the authoritative module-bound interactive prototype validation path; it rejects static HTML without shared SDK source.
- Show the returned game URL and checklist, wait for explicit human approval,
  then call `approve_mock` for that exact `prototypeRevision`. AI self-approval is
  forbidden.
- Call `get_game_module_requirements` before prototype implementation. It may return the new draft's system-default initial contract or a human-confirmed changed contract. Only after module usage validation and prototype approval may formal packaging start.
- If Node.js already exists, local checks are optional extra evidence. Never
  block the standard path on them or ask the user to install Node.js.
- Use `publish_game_source_package` with the prototype files, manifest,
  module binding/usage matrix, and shared `source/**`. Portal performs static
  import checks, bundling, package hashing, and asset validation without
  executing creator code there. Execute only through the isolated formal Room
  Preview returned by the package result.
- A saved package is only a candidate. The human creator must verify formal
  Room Preview and press the SDK dashboard's formal submission action.
- Never push, deploy, write Game Fields DB/Redis/Blob directly, or claim dev/main
  promotion.

Official Claude Code references used by this profile:

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/mcp-quickstart
