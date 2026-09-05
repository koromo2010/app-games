# GF-AECP/__DOWNLOAD_ME_VERSION__

```text
DOCUMENT_CLASS := AI_EXECUTION_CONTRACT
HUMAN_DOCUMENTATION := false
PROTOCOL := game-fields-sdk
AGENT_ROLE := GAME_PACKAGE_AUTHOR
AUTHORING_CLIENT := ChatGPT Work
NORMATIVE_TERMS := MUST | MUST_NOT | MAY | HALT | EMIT | CALL | ASSERT
```

## C0::CONSTANTS

```yaml
release:
  platform: "__PLATFORM_VERSION__"
  downloadMe: "__DOWNLOAD_ME_VERSION__"
  sdkPackage: "__SDK_VERSION__"
  sdkHandshake: __SDK_HANDSHAKE_VERSION__
  sdkContract: __SDK_CONTRACT_VERSION__
  environment: "__SDK_ENVIRONMENT__"
transport:
  portal: "__SDK_PORTAL_BASE_URL__"
  mcp: "__SDK_MCP_URL__"
plugin:
  name: "__SDK_PLUGIN_NAME__"
  displayName: "__SDK_CONNECTOR_DISPLAY_NAME__"
  toolPrefix: "__SDK_TOOL_DESCRIPTION_PREFIX__"
onboardingProfileId: "__ONBOARDING_PROFILE_ID__"
starter:
  repository: "https://github.com/koromo2010/app-games"
  ref: "__SDK_STARTER_REF__"
  directory: "game-fields-game"
capabilityVector:
  - oauth2-pkce
  - creator-environments
  - starter-download
  - mock-publish
  - game-draft
  - module-first-authoring
  - module-usage-validation
  - node-free-package
  - game-package-publish
  - formal-room-preview
  - hash-pinned-promotion
  - support-threads
  - human-approved-reporting
  - human-approved-support-replies
```

## C1::OUTPUT_LITERALS

```yaml
MODE_UNSUPPORTED: "このファイルはChatGPT Work用です。Workで新しいチャットを作成し、このファイルだけを添付してください。Claude Codeでは専用の__CLAUDE_CODE_PROFILE_FILE_NAME__を使ってください。通常のClaudeチャット、Claude Desktop通常チャット、Coworkは制作クライアントとして未対応です。"
LEGACY_THREAD: "このチャットでは制作を再開できません。古いDownloadMeまたは古い`__SDK_PLUGIN_NAME__` tool schemaが会話へ固定されています。プラグイン管理画面で`__SDK_PLUGIN_NAME__`を更新したあと、現在のチャットを閉じて新しいWorkチャットを作成し、`__SDK_PLUGIN_NAME__`を選択して__DOWNLOAD_ME_FILE_NAME__だけを添付してください。保存済みの制作者環境とゲームは、新しいチャットから再取得できます。"
PLUGIN_STALE: "`__SDK_PLUGIN_NAME__`のtool schemaがこのDownloadMeより古いため、このチャットではSDK接続確認を実行できません。更新ボタンを押しても既存チャットのtool schemaは差し替わりません。プラグイン管理画面で`__SDK_PLUGIN_NAME__`を更新したあと、現在のチャットを閉じて新しいWorkチャットを作成し、`__SDK_PLUGIN_NAME__`を選択して__DOWNLOAD_ME_FILE_NAME__だけを添付してください。"
PLUGIN_SETUP: "プラグイン一覧に`__SDK_PLUGIN_NAME__`がないため、新規プラグインとして登録します。プラグイン管理画面で「新規プラグイン」を選び、名前を`__SDK_PLUGIN_NAME__`、MCP URLを`__SDK_PORTAL_BASE_URL__/api/mcp`として作成してください。作成後に「接続」を押してGame FieldsのOAuth認証を完了し、続けて「更新」を押してください。接続済みになったら、このチャットで`__SDK_PLUGIN_NAME__`を選択してください。認証情報やトークンを会話へ貼り付ける必要はありません。"
SLUG_REQUEST: "あなた専用のGame Fields SDK環境で使うURL名を決めます。`yusuke-lab`のように、小文字英数字とハイフンで希望名を教えてください。"
MOCK_REVIEW: "操作プロトタイプを作成しました。実際に主要操作、状態変化、完了、リセット、Game Fields機能の利用状況を確認してください。変えたいところはそのまま教えてください。特になければ「これでOK」と答えてください。"
HANDSHAKE_FAILURE_PREFIX: "SDKハンドシェイクに失敗しました:"
SUBMISSION_INCOMPLETE: "SDKへの提出は未完了です。"
```

## C2::GLOBAL_INVARIANTS

```text
I00 MUST execute only when the current attachment set contains exactly one DownloadMe and its release.downloadMe == __DOWNLOAD_ME_VERSION__.
I01 MUST bind every SDK operation to C0.transport.portal, C0.transport.mcp, C0.release.environment, and C0.onboardingProfileId; MUST_NOT infer or substitute another SDK origin or semantic environment.
I02 MUST treat MCP initialize, OAuth authorization, and SDK handshake as distinct predicates.
I03 MUST_NOT request, print, persist, commit, or pass through shell arguments any password, Cookie, access token, refresh token, reservationToken, or management token.
I04 MUST use OAuth MCP tools for ChatGPT Work; MUST_NOT invoke either legacy publish script.
I05 MUST use only C0.starter.repository@C0.starter.ref when starter files are needed; MUST_NOT obtain main, develop, mirrors, or alternate templates.
I06 MUST mutate files only inside the dedicated C0.starter.directory workspace.
I07 MUST treat the draft's system-default initial module contract as Game Fields-owned and immediately usable without claiming human confirmation, then implement exactly the returned requiredModuleIds; any canonical profile change MUST enter the human-confirmation-required proposal flow; MUST_NOT duplicate Platform-owned behavior or use disabled modules.
I08 MUST keep browser state non-authoritative; Room state, identity, secrets, turn validation, result, and revision remain server-authoritative.
I09 MUST_NOT access Game Fields DB, Redis, Blob, admin state, authentication Cookie, API keys, Vercel, develop, or main.
I10 MUST_NOT push or deploy to Game Fields repositories or environments.
I11 MUST classify SDK/bridge deficiency as SDK_REQUESTS.md data; MUST_NOT conceal it with game-specific bypass code.
I12 MUST_NOT equate local HTML, local preview, chat preview, ZIP generation, mock persistence, or package candidate persistence with human formal submission.
I13 MUST_NOT report package preparation complete unless P_SUBMISSION_READY is true; only the human creator can formally submit from the SDK dashboard.
I14 MUST preserve submitted AppSet source and package hashes through preview/review/promotion; source changes require a new revision and a full rerun.
I15 MUST use returned URLs; MUST_NOT synthesize SDK URLs.
I16 MUST define bilingual standardResult.presentation.reason, no more than 3 share-safe highlights, and a participant-safe playLog for every result transition; MUST_NOT expose machine reason codes, prompts, internal IDs, undisclosed secrets, or non-consenting participant names as human-facing result text.
I17 MUST_NOT submit a new support report or reply directly; prepare_support_report and prepare_support_reply create drafts only, and the human creator MUST review and approve them in Portal.
I18 MUST keep the opaque environmentBinding returned by accepted handshake in tool-flow memory and pass it unchanged to every later SDK tool; MUST_NOT decode, hand-enter, persist, or reuse it across a chat, OAuth identity, client, origin, or environment.
I19 MUST verify sdkIdentity.targetEnvironment, canonicalMcpUrl, release, and onboardingProfileId on every post-handshake SDK response; mismatch means HALT before further read or write.
I19A MUST read the public `accountContext` from the accepted handshake or a post-handshake read response and treat `accountRef`, `environment`, and `contextVersion` as the canonical MCP account context; MUST NOT infer the actual account from the user's wording, slug, display name, or Portal URL.
I19B MUST show the user the actual MCP account context and target creator once before any owner-bound write, then pass that context's `accountRef` as `expectedAccountRef`; a missing, stale, different-account, or different-environment ref MUST fail closed before persistence.
I19C MUST treat `accountRef` as a comparison value only; MUST NOT request, display, persist, log, decode, or transmit raw player IDs, OAuth grants, tokens, Cookies, or opaque environment bindings.
I20 MUST_NOT treat MCP Connected, tool discovery, URL issuance, shared Shell rendering, local HTML, or package candidate save as completion.
I21 MUST resolve and freeze either the system-default initial module contract or a human-confirmed changed contract before prototype implementation, then require explicit human approval of the exact published prototypeRevision before formal packaging; AI self-approval is forbidden.
I22 MUST use publish_mock and publish_game_source_package as the server-side Node-free path when local Node.js is unavailable; MUST_NOT ask a general creator to install Node.js, npm, Git, or Vercel CLI as the default path.
I22A MUST submit canonical `source/**` bytes when available. `publish_mock` may losslessly normalize a path/content file list or `src/**` source root within the same game and operation, then revalidate the current module contract. It MUST NOT invent missing creator code, create a draft, change a module profile, or bypass human approval; only an unrecoverable defect may be returned for a creator decision.
I23 MUST use prepare_module_profile_update only for module IDs explicitly returned as creator-configurable by the current authoring surface; MUST read a compatible proposal back with get_game_module_profile_proposal in the same tool flow before stopping; MUST_NOT infer or submit hidden Platform modules, treat a proposal as active profile mutation, or continue past an incompatible legacy proposal.
I24 MUST parse MCP CallToolResult by checking isError first and then using structuredContent; only when structuredContent is absent MAY parse one JSON text content item once; canonical paths are structuredContent.environmentBinding and structuredContent.proposal.id; MUST_NOT search guessed aliases.
I25 MUST distinguish a logical product write from a tool invocation. A replay with the same frozen requestId and identical semantic payload for outcome reconciliation is not a second logical write; a new requestId, target, or semantic payload is a new write.
```

## P0::TERMINAL_PREDICATES

```text
P_PROTOTYPE :=
  publish_mock.saved == true
  && isNonEmpty(publish_mock.prototypeRevision)
  && publish_mock.qualityEvidence exists
  && publish_mock.moduleBinding == MODULE_CONTRACT identity fields
  && publish_mock.moduleUsage covers every MODULE_CONTRACT.requiredModuleIds item
  && isNonEmpty(publish_mock.sharedSourceSha256)
  && publish_mock.humanApprovalRequired == true
  && isURL(publish_mock.creatorUrl)
  && isURL(publish_mock.gameUrl)

P_SUBMISSION_READY :=
  formal_package.saved == true
  && isNonEmpty(formal_package.packageRevision)
  && isURL(formal_package.packagePreviewUrl)
  && formal_room_preview_verified == true

```

## S0::HOST_CAPABILITY_GATE

```text
DOWNLOADME_ATTACHMENTS := attached files matching /GameFieldsDownloadMe(?:-dev)?(?:-ver(?:[0-9]+|[0-9]+\.[0-9]+\.[0-9]+))?\.md/.

IF count(DOWNLOADME_ATTACHMENTS) != 1:
  EMIT C1.LEGACY_THREAD;
  HALT.

IF DOWNLOADME_ATTACHMENTS[0].release.downloadMe != C0.release.downloadMe:
  EMIT C1.LEGACY_THREAD;
  HALT.

REQUIRE := {
  multi_file_read_write,
  sdk_mcp_tool_access
}

IF all(REQUIRE) THEN GOTO S1 WITHOUT user_confirmation.
ELSE EMIT C1.MODE_UNSUPPORTED; HALT.
```

## S1::TOOL_DISCOVERY_AUTH_HANDSHAKE

```text
WORK_DISCOVERY_QUERY := "__SDK_PLUGIN_NAME__ get_sdk_handshake Game Fields SDK接続互換性"

IF surface == Work AND get_sdk_handshake not_loaded:
  CALL tool検索(WORK_DISCOVERY_QUERY).

IF discovered(source=C0.plugin.name, tool=get_sdk_handshake)
  AND NOT schema_accepts_all(C0.capabilityVector):
  EMIT C1.PLUGIN_STALE;
  HALT.

IF discovered(source=C0.plugin.name, any_tool)
  AND NOT discovered(source=C0.plugin.name, tool=get_sdk_handshake):
  EMIT C1.PLUGIN_STALE;
  HALT.

IF NOT discovered(source=C0.plugin.name, any_tool):
  REQUIRE user to add/select C0.plugin.name.
  IF plugin_candidate_absent:
    REQUIRE user to enable developer mode.
    EMIT C1.PLUGIN_SETUP.
    REQUIRE user to create C0.plugin.name with C0.transport.mcp,
      press Connect, complete OAuth, then press Update.
  HALT until connection is available.

REQUIRE browser authorization using the user's already-linked Game Fields account.
MUST_NOT request credentials in conversation.

CALL get_sdk_handshake WITH:
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": __SDK_HANDSHAKE_VERSION__,
  "client": {
    "kind": "ai-agent",
    "name": "ChatGPT Work"
  },
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

PARSE MCP_RESULT by checking transport/RPC failure, then isError.
SET HANDSHAKE := MCP_RESULT.structuredContent.
IF HANDSHAKE is absent AND MCP_RESULT.content contains exactly one JSON text item:
  PARSE that text once as HANDSHAKE.
IF transport/RPC failed, isError == true, or HANDSHAKE is not an object:
  INSPECT current tool schema, server source, tests, and the fixed parser.
  IF the request/parser can be corrected within the explicit invocation limit:
    REPEAT this handshake with the corrected contract in the same tool flow.
  ELSE EMIT a sanitized failure and HALT on the unresolved external or contract blocker.

IF HANDSHAKE.accepted != true:
  CLASSIFY HANDSHAKE.problems[*].code.
  IF current DownloadMe/source permits a request or parser correction within the explicit invocation limit:
    REPEAT this handshake after that correction in the same tool flow.
  ELSE:
    EMIT C1.HANDSHAKE_FAILURE_PREFIX + join(HANDSHAKE.problems[*].code);
    HALT on the true compatibility blocker.

ASSERT isNonEmpty(HANDSHAKE.environmentBinding).
KEEP HANDSHAKE.environmentBinding in tool-flow memory as ENVIRONMENT_BINDING.

# accepted=true is the aggregate verdict for client, environment, canonical MCP,
# onboarding profile, release, contract, and required capabilities. Do not
# independently re-parse those same fields to overturn the accepted verdict.

CALL get_authoring_profile WITH {
  "clientId": "chatgpt-work",
  "environmentBinding": ENVIRONMENT_BINDING
}.
ASSERT MCP_RESULT.isError != true.
SET PROFILE := MCP_RESULT.structuredContent.
ASSERT PROFILE.client.displayName == "ChatGPT Work".
ASSERT PROFILE.sdkIdentity matches C0 environment, mcp, release, and onboardingProfileId.
GOTO S2.
```

Every `CALL` after `get_sdk_handshake` in this contract includes
`environmentBinding: ENVIRONMENT_BINDING`, even where omitted below for readability.
Every `CALL` returns `MCP_RESULT`; check `MCP_RESULT.isError` before success
fields and use `MCP_RESULT.structuredContent` as the payload. The name
`response` below means that parsed payload, never the CallToolResult wrapper.

## S2::CREATOR_ENVIRONMENT_RESOLUTION

```text
CALL list_creator_environments.
ASSERT response.accountContext.accountRef exists.
SET ACTUAL_ACCOUNT_CONTEXT := response.accountContext.
EMIT the actual MCP accountRef/environment once before any owner-bound write; do not infer it from user wording, slug, display name, or Portal URL.

CASE count(environments):
  1:
    SELECT environments[0].slug.
    EMIT "既存の<url>へ再ログインしました".
    GOTO S3.
  >1:
    EMIT table(url, gameCount).
    ASK exactly_once for selection.
    SELECT chosen.slug.
    GOTO S3.
  0:
    EMIT C1.SLUG_REQUEST.
    WAIT user_input.

NORMALIZE requested_slug:
  lowercase;
  map whitespace_or_symbol -> "-";
  collapse repeated "-";
  trim "-".

CALL check_creator_url(normalized_slug).

IF unavailable:
  EMIT exactly 3 derived alternatives in one request;
  WAIT user_input;
  REPEAT check_creator_url.

IF service_failure:
  EMIT reservation_not_completed;
  HALT.

CALL reserve_creator_url(normalized_slug, expectedAccountRef=ACTUAL_ACCOUNT_CONTEXT.accountRef).
ASSERT response.url exists.
KEEP response.reservationToken in tool-flow memory only.
EMIT response.url.
CALL finalize_creator_url(response.reservationToken, expectedAccountRef=ACTUAL_ACCOUNT_CONTEXT.accountRef).
ASSERT finalized == true.
SELECT finalized.slug.

CREATOR_URL_CARDINALITY := one URL per creator, not one URL per game.
GOTO S3.
```

## O0::SUPPORT_OPERATIONS

```text
IF user asks to inspect existing reports:
  CALL list_support_threads.
  CALL get_support_thread only for the selected reportId.

IF user asks to reply to an existing report:
  ASSERT the exact reply body was provided or confirmed by the user.
  CALL prepare_support_reply with a stable UUID requestId and expectedAccountRef=ACTUAL_ACCOUNT_CONTEXT.accountRef.
  ASSERT replied == false.
  ASSERT humanApprovalRequired == true.
  ASSERT approvalUrl is URL.
  EMIT approvalUrl.
  EMIT "この返信下書きはまだ投稿されていません。内容を確認し、同意する場合だけPortalから送信してください。"
  MUST_NOT claim the reply was posted before the human approval action.

IF AI detects a probable SDK or game defect AND user asks to report it:
  CALL list_support_threads without a status filter.
  COMPARE the defect, game, page, symptom, and prior conversation with every returned thread.
  IF any thread may describe the same defect, recurrence, or follow-up:
    CALL get_support_thread for that reportId.
    CALL prepare_support_reply with a stable UUID requestId, the new evidence, and expectedAccountRef=ACTUAL_ACCOUNT_CONTEXT.accountRef.
    MUST_NOT call prepare_support_report.
  ELSE:
    CALL prepare_support_report with a stable UUID requestId, the observed evidence,
    checkedReportIds containing every reportId returned by list_support_threads,
    and expectedAccountRef=ACTUAL_ACCOUNT_CONTEXT.accountRef.
  ASSERT submitted == false.
  ASSERT humanApprovalRequired == true.
  ASSERT approvalUrl is URL.
  EMIT approvalUrl.
  EMIT "この下書きはまだ送信されていません。内容を確認し、同意する場合だけPortalから送信してください。"
  MUST_NOT claim the report was submitted before the human approval action.

IF the proposed report text says or implies "previously reported", "reported before",
"再発", or "以前にも報告":
  MUST use prepare_support_reply for the matching existing thread.
  MUST_NOT create a new support report.
```

## S3::STARTER_ACQUISITION

```text
IF an exact starter workspace is already attached or synchronized:
  USE it as C0.starter.directory.
ELSE IF the authoring host has native public repository import/download:
  IMPORT only C0.starter.repository@C0.starter.ref into C0.starter.directory.
ELSE IF Git already exists:
  MAY clone --depth 1 --single-branch --branch C0.starter.ref into C0.starter.directory.
ELSE:
  EMIT official_starter_acquisition_failed;
  HALT without asking the creator to install Git, Node.js, npm, or another CLI.

ASSERT starter-manifest.json.repository == C0.starter.repository.
ASSERT starter-manifest.json.ref == C0.starter.ref.
ASSERT starter-manifest.json.downloadMeVersion == __DOWNLOAD_ME_VERSION__.
ASSERT nonempty(starter-manifest.json.sdkVersion).
ASSERT starter-manifest.json.sdkHandshakeVersion == C0.release.sdkHandshake.
ASSERT nonempty(starter-manifest.json.platformVersion).
ASSERT nonempty(starter-manifest.json.sdkContractVersion).

ON_ASSERT_FAILURE:
  EMIT official_starter_acquisition_failed;
  HALT.

READ_FULLY_IN_ORDER := [
  START_HERE.md,
  AGENTS.md,
  APP_REQUIREMENTS.md,
  GAME_SPEC.md,
  MOCK_GUIDE.md,
  SDK_API.md
].

AFTER_READ := repository instructions become authoritative within I01..I15.
GOTO S4.
```

## S4::GAME_KERNEL_RESOLUTION

```text
DISCUSS_NATURALLY := {core_fun, player_count, win_condition}.
MUST_NOT emit a long questionnaire before DISCUSS_NATURALLY is resolved.

WHEN core_fun && player_count && win_condition are stable:
  PROPOSE_ONCE := {
    detailed_rules,
    screen_flow,
    phase_flow,
    module_usage,
    safe_general_defaults
  }.

ASK additional questions only when a non-placeholder decision affects:
  personal_data | payment | visibility | secrets | fundamental_architecture.
IF required, group all such questions into one turn.
MUST_NOT ask serial preference/detail questions.

WRITE completed GAME_SPEC.md.
GOTO S4A.
```

## S4A::GAME_DRAFT_AND_INITIAL_MODULE_CONTRACT

```text
CALL create_game_draft WITH {
  slug: selected.slug,
  gameId,
  title,
  description,
  playMode: "online-room",
  minimumPlayers,
  maximumPlayers,
  expectedAccountRef: ACTUAL_ACCOUNT_CONTEXT.accountRef
}.
ASSERT created == true.
ASSERT prototypeSaved == false.
ASSERT packageSaved == false.
ASSERT moduleReviewUrl is URL.
ASSERT humanConfirmationRequired == false.
ASSERT moduleContractState.establishmentKind == "initial-default".
ASSERT moduleContractState.origin == "system-default".
ASSERT moduleContractState.moduleProfileConfirmedAt == null.
ASSERT moduleContractState.auditRecord.event == "initial-default-established".
ASSERT moduleContractState.auditRecord.actorKind == "system".

EMIT target environment, creator URL, gameId, the system-default origin, and moduleReviewUrl as an optional configuration link.
MUST_NOT describe the initial contract as humanConfirmed, userApproved, confirmedByUser, 人間確認済み, or 利用者承認済み.

CALL get_game_module_requirements(selected.slug, gameId).
ASSERT response.editableByAi == false.
ASSERT response.moduleProfileRevision exists.
ASSERT sha256(response.moduleContractDigest).
ASSERT response.sdkPackage.version == C0.release.sdkPackage.
ASSERT every response.requiredModuleIds item has requiredModules contract data.
ASSERT response.moduleContractState.establishmentKind == "initial-default".
ASSERT response.moduleContractState.humanConfirmationRequired == false.

IF the initial-default or a human-confirmed module composition needs to change:
  ASSERT every requested module decision is present in the current creator-configurable authoring profile.
  MUST_NOT guess, enumerate, or submit Platform/internal module IDs.
  FREEZE MODULE_PROPOSAL_REQUEST_ID := stable requestId.
  FREEZE MODULE_PROPOSAL_PAYLOAD := current specification, module decisions, target, and MODULE_PROPOSAL_REQUEST_ID.
  CALL prepare_module_profile_update WITH MODULE_PROPOSAL_PAYLOAD.
  PARSE MCP_RESULT using I24.
  IF transport outcome is unknown AND proposal ID is unavailable:
    REPARSE the retained result before another call.
    IF the explicit tool invocation limit permits one reconciliation replay:
      CALL prepare_module_profile_update once with the identical frozen MODULE_PROPOSAL_PAYLOAD.
      PARSE MCP_RESULT using I24.
    ELSE EMIT WRITE_OUTCOME_UNKNOWN and HALT without a new requestId or second logical proposal.
  IF a confirmed pre-persistence validation error is caused only by serialization/schema shape:
    INSPECT source/schema, correct the representation without changing the product decision,
    and retry once with the same MODULE_PROPOSAL_REQUEST_ID when the invocation limit permits.
  IF MCP_RESULT.isError == true after recovery:
    EMIT the sanitized classified error and HALT without a new requestId or second logical proposal.
  SET PREPARED_RESULT := parsed payload.
  IF PREPARED_RESULT.noChange == true:
    ASSERT PREPARED_RESULT.prepared == false.
    ASSERT PREPARED_RESULT.activeProfileChanged == false.
    ASSERT PREPARED_RESULT.humanConfirmationRequired == false.
    ASSERT PREPARED_RESULT.proposal is absent.
    SET response := PREPARED_RESULT.moduleContract.
    GOTO S4A_FREEZE without revision/digest update or human review.
  SET PREPARED_PROPOSAL := PREPARED_RESULT.
  ASSERT isNonEmpty(PREPARED_PROPOSAL.proposal.id).
  CALL get_game_module_profile_proposal WITH {
    slug: selected.slug,
    gameId,
    proposalId: PREPARED_PROPOSAL.proposal.id
  }.
  PARSE MCP_RESULT using I24.
  IF read-back transport/parser fails, recover the same read-only call; MUST_NOT prepare another proposal.
  ASSERT MCP_RESULT.isError != true.
  SET PROPOSAL_READBACK := parsed payload.
  ASSERT PROPOSAL_READBACK.proposal.id == PREPARED_PROPOSAL.proposal.id.
  IF PROPOSAL_READBACK.proposal.compatibilityState != "compatible":
    EMIT the generic compatibility state and review URL without hidden diff detail.
    HALT. MUST_NOT request approval or retry with guessed module IDs.
  ASSERT PROPOSAL_READBACK.proposal.status == "pending".
  ASSERT PROPOSAL_READBACK.activeProfileChanged == false.
  ASSERT PROPOSAL_READBACK.humanApprovalRequired == true.
  EMIT PROPOSAL_READBACK exact diff, dependencies, impact, warnings, base identity, audit, and reviewUrl.
  MUST_NOT call any tool that assumes the proposed profile is active until the owner approves the proposal.
  HALT for the creator's Portal review.
S4A_FREEZE:
FREEZE MODULE_CONTRACT := {
  environment,
  moduleProfileRevision,
  moduleContractDigest,
  sdkPackage,
  sdkContractVersion,
  requiredModuleIds,
  disabledModuleIds,
  requiredModules,
  moduleContractState
}.
GOTO S5.
```

## S5::INTERACTIVE_PROTOTYPE_CONSTRUCTION_AND_REVIEW

```text
MUTATE := {
  index.html, styles.css, mock.js, preview.json,
  source/app-set.ts, source/contracts.ts, source/manifest.ts,
  source/server-module.ts, source/game-client.tsx, source/prototype-adapter.ts,
  specification-owned files
}.

MUST build the interactive prototype and formal package from the same game-specific source.
MUST use source/prototype-adapter.ts only to inject deterministic fixture state, scene fast-forward, and reset.
MUST_NOT rewrite the game UI, AppSet logic, module components, or Command types after prototype approval.
MUST follow each MODULE_CONTRACT.requiredModules[*].delivery:
  sdk-resource => import and use the official packageExports/publicApis;
  sdk-helper => import and call the official helper in the shared transition;
  platform-resource => use the public injected interface and a prototype fixture adapter;
  platform-owned => delegate to Game Fields host and do not create a fictitious import or duplicate implementation.
MUST_NOT import or use MODULE_CONTRACT.disabledModuleIds.

preview.json MUST define gameId, displayName, description, and declared settings.
online-room MUST declare exactly one required time-limit setting with platformRole == "time-limit".
minimumPlayers MUST equal real publication minimum.
previewMinimumPlayers MAY equal 1 only when one-player preview is required.
Game-specific UI MUST_NOT duplicate Platform settings, room, lobby, player list, debug panel, or GameFieldsRoom transport.

preview.json MUST include reviewEvidence with representative in-progress and completion states,
at least four visible game-specific element IDs, each primary action target and observable result,
completion result IDs, and mockOnlyDataSource=fixed-fixture|mock-local-state.
The declared IDs MUST be visible in index.html or mock.js.
preview.json MUST include a representative coreLoopSequence and resetAction.
CREATE moduleUsage for every requiredModuleId with delivery, status, actual exports/APIs,
source paths, observable runtime marker, and non-reimplementation evidence.
IF local Node.js already exists, MAY RUN npm run check:mock; MUST_NOT require installation.
CALL publish_mock WITH {
  slug: selected.slug,
  game metadata,
  manifest,
  moduleBinding: MODULE_CONTRACT identity fields,
  moduleUsage,
  every shared prototype/source file
}.
MUST_NOT run npm run publish:mock:legacy.
ASSERT P_PROTOTYPE.

IF NOT P_PROTOTYPE:
  EMIT C1.SUBMISSION_INCOMPLETE;
  HALT.

EMIT concise summary {
  screen_and_interaction_flow,
  common_requirement_mapping,
  mock_observable_state,
  nonfunctional_until_formal_implementation
}.
EMIT publish_mock.creatorUrl as first clickable link.
EMIT publish_mock.gameUrl as secondary clickable link.
MUST_NOT prefer backward-compatible previewUrl.

EMIT:
  "「ゲーム名」の操作プロトタイプをGame Fields SDKへ保存しました。"
  "[あなたのGame Fields環境を開く](creatorUrl)"
  "[今回のゲームを直接開く](gameUrl)"
  module usage matrix and C1.MOCK_REVIEW

WAIT explicit prototype and module-usage approval.
IF change_request:
  APPLY changes;
  REPEAT S5.
IF approval:
  CALL approve_mock WITH {
    slug: selected.slug,
    gameId,
    prototypeRevision: publish_mock.prototypeRevision,
    humanApproved: true
  }.
  ASSERT response.approved == true.
  ASSERT response.prototypeRevision == publish_mock.prototypeRevision.
  GOTO S6.
```

## S6::FORMAL_IMPLEMENTATION

```text
ASSERT current MODULE_CONTRACT still matches get_game_module_requirements.
IF profile revision or digest changed, invalidate prototype approval and REPEAT S5.
KEEP the approved shared game source unchanged.
IMPLEMENT only formal adapter wiring and tests that do not duplicate or replace the approved UI, AppSet, module components, or Command types.

IF local Node.js already exists:
  MAY RUN_IN_ORDER := [
    "npm install",
    "npm run check:mock",
    "npm run check",
    "npm run demo",
    "npm run diagnose:promotion",
    "npm run build:game-package",
    "npm run package"
  ].
  ASSERT every executed exitCode == 0.
ELSE:
  MUST_NOT request Node.js installation.
  PREPARE UTF-8 files := {
    index.html, styles.css, mock.js, preview.json,
    source/app-set.ts, source/contracts.ts, source/manifest.ts, source/server-module.ts,
    source/game-client.tsx, source/prototype-adapter.ts
  }.

IF diagnose:promotion fails:
  PARTITION findings INTO {appset_violation, sdk_contract_gap}.
  WRITE sdk_contract_gap TO SDK_REQUESTS.md WITH diagnostic_code and missing_contract.
  MUST_NOT introduce bypass.
  HALT until corrected and full RUN_IN_ORDER succeeds.

IF local package exists:
  LOAD local_manifest := game-package/game-fields-package.json.
  ASSERT sha256(local_manifest.server.bundleSha256).
  ASSERT sha256(local_manifest.server.appSetSourceSha256).
  FREEZE {AppSet source, client, package manifest, both hashes}.
GOTO S7.
```

## S7::SUBMISSION_PREPARATION

```text
IF verified local game-package/ exists:
  CALL publish_game_package WITH MODULE_CONTRACT binding, moduleUsage, and every file under game-package/.
  SET formal_package := publish_game_package.
ELSE:
  CALL publish_game_source_package WITH {slug, gameId, manifest, moduleBinding: MODULE_CONTRACT, moduleUsage, files}.
  SET formal_package := publish_game_source_package.
MUST_NOT run npm run publish:game-package:legacy.

ASSERT formal_package.saved == true.
ASSERT formal_package.packageRevision exists.
ASSERT formal_package.packagePreviewUrl is URL.
IF local_manifest exists:
  ASSERT formal_package.serverBundleSha256 == local_manifest.server.bundleSha256.
  ASSERT formal_package.appSetSourceSha256 == local_manifest.server.appSetSourceSha256.

IF any assertion fails:
  EMIT C1.SUBMISSION_INCOMPLETE;
  HALT.

OPEN formal_package.packagePreviewUrl.
VERIFY candidate revision through formal shared Room API/Redis/CAS/reconnect/participant-sync path.
MUST_NOT substitute mock preview.

IF local ZIP exists, MAY RETURN submission/game-fields-submission.zip.
EMIT {
  formal_package.packageRevision,
  formal_package.serverBundleSha256,
  formal_package.appSetSourceSha256,
  formal_package.packagePreviewUrl,
  test_summary,
  remaining_items
}.

ASSERT P_SUBMISSION_READY.
ONLY_IF P_SUBMISSION_READY MAY report formal package preparation complete.
EMIT review_gate_notice := "検査済み提出候補を保存しました。制作者本人がSDKダッシュボードで内容を確認し、「正式提出」を押すまで審査候補にはなりません。正式提出後の検査・審査・本番採用は運営管理画面で行う別工程です。制作者はSDKからdevまたはmainへ昇格できません。"
HALT SUCCESS.
```
