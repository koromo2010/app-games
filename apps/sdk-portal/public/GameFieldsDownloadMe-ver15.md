# GF-AECP/15

```text
DOCUMENT_CLASS := AI_EXECUTION_CONTRACT
HUMAN_DOCUMENTATION := false
PROTOCOL := game-fields-sdk
AGENT_ROLE := GAME_PACKAGE_AUTHOR
NORMATIVE_TERMS := MUST | MUST_NOT | MAY | HALT | EMIT | CALL | ASSERT
```

## C0::CONSTANTS

```yaml
release:
  platform: "0.1.1"
  downloadMe: 15
  sdkPackage: "0.1.1"
  sdkHandshake: 1
  sdkContract: 1
  environment: "development"
transport:
  portal: "https://sdk-dev.game-fields.com"
  mcp: "https://sdk-dev.game-fields.com/api/mcp"
starter:
  repository: "https://github.com/koromo2010/app-games"
  ref: "sdk-starter-dev"
  directory: "game-fields-game"
capabilityVector:
  - oauth2-pkce
  - creator-environments
  - starter-download
  - mock-publish
  - game-package-publish
  - formal-room-preview
  - hash-pinned-promotion
  - support-threads
  - human-approved-reporting
```

## C1::OUTPUT_LITERALS

```yaml
MODE_UNSUPPORTED: "このゲーム制作にはコード操作が必要です。ChatGPTのWorkモードまたはCodexを開き、このファイルをもう一度添付してください。"
LEGACY_THREAD: "このチャットでは制作を再開できません。古いDownloadMeまたは古い`gameapp-dev` tool schemaが会話へ固定されています。プラグイン管理画面で`gameapp-dev`を更新したあと、現在のチャットを閉じて新しいWork／Codexチャットを作成し、`gameapp-dev`を選択してGameFieldsDownloadMe-ver15.mdだけを添付してください。保存済みの制作者環境とゲームは、新しいチャットから再取得できます。"
PLUGIN_STALE: "`gameapp-dev`のtool schemaがこのDownloadMeより古いため、このチャットではSDK接続確認を実行できません。更新ボタンを押しても既存チャットのtool schemaは差し替わりません。プラグイン管理画面で`gameapp-dev`を更新したあと、現在のチャットを閉じて新しいWork／Codexチャットを作成し、`gameapp-dev`を選択してGameFieldsDownloadMe-ver15.mdだけを添付してください。"
SLUG_REQUEST: "あなた専用のGame Fields SDK環境で使うURL名を決めます。`yusuke-lab`のように、小文字英数字とハイフンで希望名を教えてください。"
MOCK_REVIEW: "モックを作成しました。実際に画面を見て、変えたいところはありますか？ 気になる部分をそのまま教えてください。特になければ「これでOK」と答えてください。"
HANDSHAKE_FAILURE_PREFIX: "SDKハンドシェイクに失敗しました:"
SUBMISSION_INCOMPLETE: "SDKへの提出は未完了です。"
```

## C2::GLOBAL_INVARIANTS

```text
I00 MUST execute only when the current attachment set contains exactly one DownloadMe and its release.downloadMe == 15.
I01 MUST bind every SDK operation to C0.transport.portal; MUST_NOT infer or substitute another SDK origin.
I02 MUST treat MCP initialize, OAuth authorization, and SDK handshake as distinct predicates.
I03 MUST_NOT request, print, persist, commit, or pass through shell arguments any password, Cookie, access token, refresh token, reservationToken, or management token.
I04 MUST use OAuth MCP tools for new Work/Codex flows; MUST_NOT invoke either legacy publish script.
I05 MUST clone only C0.starter.repository@C0.starter.ref; MUST_NOT clone main, develop, mirrors, or alternate templates.
I06 MUST mutate files only inside C0.starter.directory after checkout.
I07 MUST treat all 39 initial Platform modules as immutable mandatory dependencies; MUST_NOT duplicate Platform-owned behavior.
I08 MUST keep browser state non-authoritative; Room state, identity, secrets, turn validation, result, and revision remain server-authoritative.
I09 MUST_NOT access Game Fields DB, Redis, Blob, admin state, authentication Cookie, API keys, Vercel, develop, or main.
I10 MUST_NOT push or deploy to Game Fields repositories or environments.
I11 MUST classify SDK/bridge deficiency as SDK_REQUESTS.md data; MUST_NOT conceal it with game-specific bypass code.
I12 MUST_NOT equate local HTML, local preview, chat preview, ZIP generation, mock persistence, or package candidate persistence with human formal submission.
I13 MUST_NOT report package preparation complete unless P_SUBMISSION_READY is true; only the human creator can formally submit from the SDK dashboard.
I14 MUST preserve submitted AppSet source and package hashes through preview/review/promotion; source changes require a new revision and a full rerun.
I15 MUST use returned URLs; MUST_NOT synthesize SDK URLs.
I16 MUST define bilingual standardResult.presentation.reason, no more than 3 share-safe highlights, and a participant-safe playLog for every result transition; MUST_NOT expose machine reason codes, prompts, internal IDs, undisclosed secrets, or non-consenting participant names as human-facing result text.
I17 MUST_NOT submit a new support report directly; prepare_support_report creates a draft only, and the human creator MUST review and approve it in Portal.
```

## P0::TERMINAL_PREDICATES

```text
P_MOCK :=
  check_mock.exitCode == 0
  && publish_mock.saved == true
  && isURL(publish_mock.creatorUrl)
  && isURL(publish_mock.gameUrl)

P_SUBMISSION_READY :=
  check.exitCode == 0
  && demo.exitCode == 0
  && diagnose_promotion.exitCode == 0
  && build_game_package.exitCode == 0
  && publish_game_package.saved == true
  && publish_game_package.immutableAppSet == true
  && publish_game_package.serverBundleSha256 == local_manifest.server.bundleSha256
  && publish_game_package.appSetSourceSha256 == local_manifest.server.appSetSourceSha256
  && isNonEmpty(publish_game_package.packageRevision)
  && isURL(publish_game_package.packagePreviewUrl)

```

## S0::HOST_CAPABILITY_GATE

```text
DOWNLOADME_ATTACHMENTS := attached files matching /GameFieldsDownloadMe(?:-ver[0-9]+)?\.md/.

IF count(DOWNLOADME_ATTACHMENTS) != 1:
  EMIT C1.LEGACY_THREAD;
  HALT.

IF DOWNLOADME_ATTACHMENTS[0].release.downloadMe != C0.release.downloadMe:
  EMIT C1.LEGACY_THREAD;
  HALT.

REQUIRE := {
  public_git_fetch,
  multi_file_read_write,
  node_command_execution,
  zip_artifact_return,
  sdk_mcp_tool_access
}

IF all(REQUIRE) THEN GOTO S1 WITHOUT user_confirmation.
ELSE EMIT C1.MODE_UNSUPPORTED; HALT.
```

## S1::TOOL_DISCOVERY_AUTH_HANDSHAKE

```text
WORK_DISCOVERY_QUERY := "gameapp-dev get_sdk_handshake Game Fields SDK接続互換性"

IF surface == Work AND get_sdk_handshake not_loaded:
  CALL tool検索(WORK_DISCOVERY_QUERY).

IF discovered(gameapp-dev.get_sdk_handshake)
  AND NOT schema_accepts_all(C0.capabilityVector):
  EMIT C1.PLUGIN_STALE;
  HALT.

IF discovered(gameapp-dev.*) AND NOT discovered(gameapp-dev.get_sdk_handshake):
  EMIT C1.PLUGIN_STALE;
  HALT.

IF NOT discovered(gameapp-dev.*):
  REQUIRE user to add/select Game Fields App.
  IF plugin_candidate_absent:
    REQUIRE user to enable developer mode and connect C0.transport.mcp as OAuth App.
  HALT until connection is available.

IF surface == Codex AND sdk_mcp_not_connected:
  REQUIRE user to connect C0.transport.mcp as remote MCP.
  HALT until connection is available.

REQUIRE browser authorization using the user's already-linked Game Fields account.
MUST_NOT request credentials in conversation.

CALL get_sdk_handshake WITH:
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": 1,
  "client": {
    "kind": "ai-agent",
    "name": "ChatGPT"
  },
  "expected": {
    "environment": "development",
    "platformVersion": "0.1.1",
    "sdkPackageVersion": "0.1.1",
    "sdkContractVersion": 1
  },
  "requiredCapabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish",
    "game-package-publish",
    "formal-room-preview",
    "hash-pinned-promotion",
    "support-threads",
    "human-approved-reporting"
  ]
}

ASSERT response.accepted == true.
ASSERT response.problems.length == 0.
ASSERT response.environment == C0.release.environment.
ASSERT response.release matches C0.release.
ASSERT response.endpoints.portal == C0.transport.portal.

ON_ASSERT_FAILURE:
  EMIT C1.HANDSHAKE_FAILURE_PREFIX + join(response.problems[*].code);
  HALT.

ON_ASSERT_SUCCESS:
  GOTO S2.
```

## S2::CREATOR_ENVIRONMENT_RESOLUTION

```text
CALL list_creator_environments.

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

CALL reserve_creator_url(normalized_slug).
ASSERT response.url exists.
KEEP response.reservationToken in tool-flow memory only.
EMIT response.url.
CALL finalize_creator_url(response.reservationToken).
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
  CALL reply_support_thread with a stable UUID requestId.
  ASSERT replied == true.

IF AI detects a probable SDK or game defect AND user asks to report it:
  CALL prepare_support_report with a stable UUID requestId and the observed evidence.
  ASSERT submitted == false.
  ASSERT humanApprovalRequired == true.
  ASSERT approvalUrl is URL.
  EMIT approvalUrl.
  EMIT "この下書きはまだ送信されていません。内容を確認し、同意する場合だけPortalから送信してください。"
  MUST_NOT claim the report was submitted before the human approval action.
```

## S3::STARTER_ACQUISITION

```bash
git clone --depth 1 --single-branch --branch sdk-starter-dev https://github.com/koromo2010/app-games.git game-fields-game
cd game-fields-game
```

```text
ASSERT starter-manifest.json.repository == C0.starter.repository.
ASSERT starter-manifest.json.ref == C0.starter.ref.
ASSERT starter-manifest.json.downloadMeVersion == 15.
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
GOTO S5.
```

## S5::MOCK_CONSTRUCTION_AND_REVIEW

```text
MUTATE := {
  mock/**,
  mock/preview.json,
  specification-owned starter files
}.

preview.json MUST define gameId, displayName, description, and declared settings.
online-room MUST declare exactly one required time-limit setting with platformRole == "time-limit".
minimumPlayers MUST equal real publication minimum.
previewMinimumPlayers MAY equal 1 only when one-player preview is required.
Game-specific UI MUST_NOT duplicate Platform settings, room, lobby, player list, debug panel, or GameFieldsRoom transport.
All 39 initial modules remain mandatory.

RUN npm run check:mock.
ASSERT exitCode == 0.
CALL publish_mock WITH {creatorSlug, game metadata, every validated mock/** file}.
MUST_NOT run npm run publish:mock:legacy.
ASSERT P_MOCK.

IF NOT P_MOCK:
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
  "「ゲーム名」をGame Fields SDKへ保存しました。"
  "[あなたのGame Fields環境を開く](creatorUrl)"
  "[今回のゲームを直接開く](gameUrl)"
  C1.MOCK_REVIEW

WAIT explicit mock approval.
IF change_request:
  APPLY changes;
  REPEAT S5.
IF approval:
  GOTO S6.
```

## S6::FORMAL_IMPLEMENTATION

```text
CALL get_game_module_requirements(selected.slug, gameId).
ASSERT response.editableByAi == false.
ASSERT every response.requiredModuleIds item has requiredModules contract data.

ON_ASSERT_FAILURE:
  EMIT sdk_profile_unavailable;
  HALT.

IMPLEMENT only game-specific AppSet, client surface, and tests.
FOLLOW each requiredModules[*].delivery/packageExports/publicApis/usage.
MUST_NOT infer internal SDK classification or edit module profile.

RUN_IN_ORDER := [
  "npm install",
  "npm run check:mock",
  "npm run check",
  "npm run demo",
  "npm run diagnose:promotion",
  "npm run build:game-package",
  "npm run package"
].

ASSERT every exitCode == 0.

IF diagnose:promotion fails:
  PARTITION findings INTO {appset_violation, sdk_contract_gap}.
  WRITE sdk_contract_gap TO SDK_REQUESTS.md WITH diagnostic_code and missing_contract.
  MUST_NOT introduce bypass.
  HALT until corrected and full RUN_IN_ORDER succeeds.

LOAD local_manifest := game-package/game-fields-package.json.
ASSERT sha256(local_manifest.server.bundleSha256).
ASSERT sha256(local_manifest.server.appSetSourceSha256).
FREEZE {AppSet source, client, package manifest, both hashes}.
GOTO S7.
```

## S7::SUBMISSION_PREPARATION

```text
CALL publish_game_package WITH every file under game-package/.
MUST_NOT run npm run publish:game-package:legacy.

ASSERT publish_game_package.saved == true.
ASSERT publish_game_package.packageRevision exists.
ASSERT publish_game_package.serverBundleSha256 == local_manifest.server.bundleSha256.
ASSERT publish_game_package.appSetSourceSha256 == local_manifest.server.appSetSourceSha256.
ASSERT publish_game_package.immutableAppSet == true.
ASSERT publish_game_package.packagePreviewUrl is URL.

IF any assertion fails:
  EMIT C1.SUBMISSION_INCOMPLETE;
  HALT.

OPEN publish_game_package.packagePreviewUrl.
VERIFY candidate revision through formal shared Room API/Redis/CAS/reconnect/participant-sync path.
MUST_NOT substitute mock preview.

RETURN submission/game-fields-submission.zip.
EMIT {
  packageRevision,
  serverBundleSha256,
  appSetSourceSha256,
  packagePreviewUrl,
  test_summary,
  remaining_items
}.

ASSERT P_SUBMISSION_READY.
ONLY_IF P_SUBMISSION_READY MAY report formal package preparation complete.
EMIT review_gate_notice := "検査済み提出候補を保存しました。制作者本人がSDKダッシュボードで内容を確認し、「正式提出」を押すまで審査候補にはなりません。正式提出後の検査・審査・本番採用は運営管理画面で行う別工程です。制作者はSDKからdevまたはmainへ昇格できません。"
HALT SUCCESS.
```
