import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("execution rules separate product writes, recovery, checkpoints and formal results", () => {
  const rules = [
    read("docs/DEVELOPMENT_EXECUTION_RULES.md"),
    read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md"),
    read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md"),
  ].join("\n");
  assert.match(rules, /外部call回数、logical product write件数、control-plane write件数を混同しない/);
  assert.match(rules, /logical product write/);
  assert.match(rules, /control-plane write/);
  assert.match(rules, /同じrequest ID・同じ意味内容による冪等replay.*二件目のlogical product writeではない/);
  assert.match(rules, /Git push、Deployment、checkpoint保存はlogical product write件数へ含めず/);
  assert.match(rules, /tool名、schema、response path、parser、binding/);
  assert.match(rules, /通常のGit push承認待ち.*正式resultを作るterminal boundaryにはしない/);
  assert.match(rules, /Portal owner承認/);
  assert.match(rules, /remote未到達のままturnを終える場合は下記耐久checkpoint/);
  assert.match(rules, /canonical Git、checkpoint正本、共有済み領域、Library、current pointer/);
  assert.match(rules, /取得経路、対象DeploymentまたはURL、identity、取得時刻/);
  assert.match(rules, /内部のcommand、tool、workspace、順序、retry、helper等は.*実行計画/);
  assert.match(rules, /一つの指示は内部成果物ではなく、利用者が確認できる成果または真の外部境界までを単位とし、その間は同じタスクと権限範囲が継続する/);
  assert.match(rules, /同じfailure classと残りの実行flowを横断監査/);
  assert.match(rules, /実行方法の失敗を正式resultや次指示の境界へ変換しない/);
  assert.match(rules, /実行側の環境不足、未検証手順、実装上の不確実性を利用者操作へ移さない/);
  assert.match(rules, /第一目的は.*タスクの成功条件を満たすこと/);
  assert.match(rules, /立証できない`BLOCKED`、`INCONCLUSIVE`.*`INTERNAL_RECOVERY_REQUIRED`/);
  assert.match(rules, /監督は立証を欠く停止報告をterminal resultとして受理しない/);
  assert.match(rules, /次指示も発行せず、同じ指示のまま再計画して続行する/);
  assert.match(rules, /devは早期の実装・runtime feedback自体に価値がある検証環境/);
  assert.match(rules, /実装、利用可能な最短の関連check、承認済みdev反映、runtime観測、forward fixまたはrollback/);
  assert.match(rules, /test、lint、build、視覚検証、全履歴artifactをdev push前の一律必須条件にしない/);
  assert.match(rules, /未検証項目だけでdev反映をblockしない/);
  assert.match(rules, /main／production昇格前までに必要な全gateを満たす/);
  assert.match(rules, /利用者は識別可能な直前の実行シートを.*短い自然文で承認でき/);
  assert.match(rules, /direct push、Git-data materialization等のtransport選択は実行方法/);
  assert.match(rules, /main／productionまたは不可逆操作では、ref更新前に最終commitを確定/);
  assert.match(rules, /一度受理したタスクは`TASK_ACTIVE`/);
  assert.match(rules, /`TASK_DONE`.*`EXTERNAL_BLOCKED`/);
  assert.match(rules, /所有権を利用者や監督へ戻さず/);
  assert.match(rules, /authorization envelopeは`TASK_ACTIVE`の間継続/);
  assert.match(rules, /承認待ちは外部writeの実行ゲートであってタスクの終了ではなく/);
  assert.match(rules, /`INTERNAL_RECOVERY_REQUIRED`という内部診断にすぎず、`TASK_ACTIVE`から状態遷移しない/);
  assert.match(rules, /一つの`TASK_ACTIVE` feedback loop/);
  assert.match(rules, /タスクlife cycleは`TASK_ACTIVE`、`TASK_DONE`、`EXTERNAL_BLOCKED`/);
  assert.match(rules, /`TASK_ACTIVE`中のmilestoneであり、それだけで所有権を手放さない/);
  assert.match(rules, /developmentは.*禁止リスト方式/);
  assert.match(rules, /監督が作るnext-instructionや実行シート.*新しい禁止、file scope、tool／call回数、内部phase停止を追加しない/);
  assert.match(rules, /次に必要な具体的操作.*越える明示済みの禁止線/);
  assert.match(rules, /checkpointと定期監査はreview triggerであり、authorizationの失効やタスク終了ではない/);
  assert.match(rules, /成果物routerと個別指示の単一参照方式/);
  assert.match(rules, /最新instructionだけで契約とauthorizationを判定し、最新checkpointだけで現在地と再開点を判定/);
  assert.match(rules, /`NEXT_INSTRUCTION`.*`CHECKPOINT`.*`EXECUTION_SHEET`.*`RESULT`/s);
  assert.match(rules, /INSTRUCTION_RECORD_UNSAVED \/ AT RISK/);
  assert.match(rules, /`RECOVERY_CHECKPOINT`.*`FULL_RECOVERY_CHECKPOINT`/s);
  assert.match(rules, /fresh restoreはこの軽量checkpointごとには行わない/);
});

test("execution policy has one canonical root and conditionally loaded satellites", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const satellites = [
    "docs/DEVELOPMENT_DELIVERY_RUNBOOK.md",
    "docs/DEVELOPMENT_RECORDS_RUNBOOK.md",
    "docs/AI_EXECUTION_TROUBLESHOOTING.md",
    "docs/AUDIT_THREAD_RULES.md",
  ];

  assert.match(root, /唯一の実行正本/);
  assert.match(root, /正本とサテライト/);
  assert.match(root, /個別成果物からサテライトを直接policy参照しない/);
  assert.match(root, /個別タスクの番号、特定commit、URL、credential、transport、画面操作、回数上限を恒久ルールへ固定しない/);
  assert.match(root, /監督スレ、監査スレ、監査作業スレ、作業スレは、本書.*変更candidateを作成する権限も反映を承認する権限も持たない/s);
  assert.match(root, /管理スレは通常時にはルール変更候補の整理・提案だけを行う/);
  assert.match(root, /利用者が管理スレでルール変更を目的として明示的に開始した独立したルール保守作業に限り.*変更candidateを作成できる/s);
  assert.match(root, /通常Tの着手・継続・close.*一般的な承認を、ルール保守の開始または反映承認へ流用しない/s);
  assert.match(root, /監督スレが発行する成果物は、この所有権境界を上書きできない/);
  assert.doesNotMatch(root, /\bT-\d+/);

  for (const path of satellites) {
    const satellite = read(path);
    assert.match(root, new RegExp(path.split("/").at(-1)!.replaceAll(".", "\\.")));
    assert.match(satellite, /`APPLIES_WHEN`/);
    assert.match(satellite, /`DOES_NOT_APPLY`/);
    assert.match(satellite, /`AUTHORITY`.*DEVELOPMENT_EXECUTION_RULES\.md/);
  }
});

test("troubleshooting fixes the MCP response paths and proposal reconciliation", () => {
  const troubleshooting = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");
  assert.match(troubleshooting, /`structuredContent\.environmentBinding`/);
  assert.match(troubleshooting, /`structuredContent\.proposal\.id`/);
  assert.match(troubleshooting, /`structuredContent\.sdkIdentity`/);
  assert.match(troubleshooting, /`isError`を先に判定/);
  assert.match(troubleshooting, /同じtool flow/);
  assert.match(troubleshooting, /別request IDや二件目proposalを作らない/);
  assert.match(troubleshooting, /同一request ID・同一payloadで`prepare_module_profile_update`を冪等replay/);
  assert.match(troubleshooting, /`get_game_module_profile_proposal`をrequest IDで呼ばない/);
  assert.match(troubleshooting, /DevTools操作やスクリーンショットが反復/);
  assert.match(troubleshooting, /未検証scriptの反復実行を利用者へ依頼しない/);
  assert.match(troubleshooting, /Windows path separator、空白、文字code、quoting/);
  assert.match(troubleshooting, /観測された一行だけを直さず、同じfailure classと残りの全分岐を横断監査/);
  assert.match(troubleshooting, /PowerShellのdouble-quoted string内では/);
  assert.match(troubleshooting, /-split '\\r\\n\|\\n\|\\r'/);
  assert.match(troubleshooting, /表示行数やraw multiline stringを比較しない/);
  assert.match(troubleshooting, /`missing`、`unexpected`、`equal`/);
  assert.match(troubleshooting, /`expected count`だけが1/);
  assert.match(troubleshooting, /改行parserの不具合/);
  assert.match(troubleshooting, /成功したGitのstderrがPowerShell error recordとなり得る/);
  assert.match(troubleshooting, /非空stderrではなくcommand直後の`\$LASTEXITCODE`で判定/);
  assert.match(troubleshooting, /成功・停止のどちらでも`pause`/);
  assert.match(troubleshooting, /LF、CRLF、lone CR、順序違い、重複、空行/);
});

test("Windows helper troubleshooting is reachable from every canonical entry point", () => {
  const agents = read("AGENTS.md");
  const navigation = read("docs/README.md");
  const systemMap = read("docs/SYSTEM_MAP.md");
  assert.match(agents, /利用者PC向けhelper／PowerShell.*`docs\/AI_EXECUTION_TROUBLESHOOTING\.md`/);
  assert.match(navigation, /利用者PC向けone-click helper・PowerShell/);
  assert.match(navigation, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
  assert.match(systemMap, /利用者PC向けhelperやPowerShellを作る/);
  assert.match(systemMap, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
});

test("handshake documentation matches the implemented request and aggregate verdict", () => {
  const documentation = read("docs/SDK_HANDSHAKE.md");
  const implementation = read("packages/game-sdk/src/handshake.ts");
  const authoringContract = JSON.parse(read("config/sdk-authoring-contract.json"));
  assert.match(documentation, /"name": "ChatGPT Work"/);
  assert.match(documentation, /"canonicalMcpUrl": "https:\/\/sdk-dev\.game-fields\.com\/api\/mcp"/);
  assert.match(documentation, /"onboardingProfileId": "game-fields-development-authoring-v1"/);
  assert.match(documentation, /`accepted`は`problems\.length === 0`から生成されるaggregate verdict/);
  assert.match(documentation, /`accepted=false`だけを正式resultのterminal boundaryにしない/);
  assert.match(implementation, /accepted: problems\.length === 0/);
  assert.match(implementation, /"ChatGPT Work",\s*"Claude Code"/);
  assert.ok(authoringContract.invariants.must.some((rule: string) => (
    rule.includes("post-handshake SDK response")
    && rule.includes("handshake response itself")
  )));
});

test("DownloadMe parses one handshake verdict and reads proposals back before Portal wait", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /SET HANDSHAKE := MCP_RESULT\.structuredContent/);
  assert.match(entry, /HANDSHAKE\.accepted != true/);
  assert.match(entry, /HANDSHAKE\.environmentBinding/);
  assert.match(entry, /MCP_RESULT\.content contains exactly one JSON text item/);
  assert.match(entry, /CLASSIFY HANDSHAKE\.problems\[\*\]\.code/);
  assert.match(entry, /HALT on the true compatibility blocker/);
  assert.doesNotMatch(entry, /IF HANDSHAKE\.accepted != true:\n\s+EMIT C1\.HANDSHAKE_FAILURE_PREFIX[^\n]*\n\s+HALT\./);
  assert.doesNotMatch(entry, /ASSERT response\.accepted == true/);
  assert.doesNotMatch(entry, /ASSERT response\.environment == C0\.release\.environment/);
  assert.match(entry, /CALL get_game_module_profile_proposal/);
  assert.match(entry, /proposalId: PREPARED_PROPOSAL\.proposal\.id/);
  assert.match(entry, /PROPOSAL_READBACK\.proposal\.compatibilityState != "compatible"/);
  assert.doesNotMatch(entry, /PROPOSAL_READBACK\.proposal\.requestId/);
  assert.match(entry, /PROPOSAL_READBACK\.activeProfileChanged == false/);
  assert.match(entry, /identical frozen MODULE_PROPOSAL_PAYLOAD/);
  assert.match(entry, /HALT without a new requestId or second logical proposal/);
});

test("Claude Code profile uses the same aggregate verdict and proposal read-back contract", () => {
  const profile = read("sdk/entry/START_CLAUDE_CODE.md");
  assert.match(profile, /`accepted=true` is the aggregate verdict/);
  assert.match(profile, /`structuredContent\.environmentBinding`/);
  assert.match(profile, /`structuredContent\.sdkIdentity`/);
  assert.match(profile, /`structuredContent\.proposal\.id`/);
  assert.match(profile, /`get_game_module_profile_proposal` in the same tool flow/);
  assert.match(profile, /`activeProfileChanged=false`/);
  assert.match(profile, /`humanApprovalRequired=true`/);
  assert.match(profile, /canonical MCP URL, release, or onboarding profile mismatches/);
  assert.match(profile, /same frozen requestId and identical semantic payload/);
  assert.doesNotMatch(profile, /Require `accepted=true`, `problems=\[\]`, and exact matches/);
});

test("current SDK specifications name the supported clients and do not recheck an accepted handshake", () => {
  const agents = read("AGENTS.md");
  const navigation = read("docs/README.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  const external = read("docs/EXTERNAL_GAME_PACKAGE.md");
  const overview = read("docs/CHATGPT_GAME_SDK.md");
  for (const document of [handoff, external, overview]) {
    assert.doesNotMatch(document, /Codex/);
  }
  assert.match(handoff, /ChatGPT WorkとClaude Code/);
  assert.match(agents, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  assert.match(navigation, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  assert.match(handoff, /`accepted=true`をaggregate verdictとして採用/);
  assert.doesNotMatch(handoff, /`accepted=true`とcanonical endpoint一致を確認/);
  assert.match(overview, /handshake response自体にはpost-handshake用`sdkIdentity`を要求しない/);
  assert.match(agents, /`docs\/DEVELOPMENT_EXECUTION_RULES\.md`を唯一の実行正本/);
  assert.match(agents, /checkpoint、内部failure、承認待ち、解析修正を新しいタスクや正式resultへ変換しない/);
  assert.match(agents, /developmentの可逆な内部手段は同書の禁止リスト方式/);
});


test("audit, management and supervision remain independent responsibility lines", () => {
  const audit = read("docs/AUDIT_THREAD_RULES.md");
  const agents = read("AGENTS.md");
  const execution = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const navigation = read("docs/README.md");

  assert.match(audit, /監査なしで通常運用が完結する/);
  assert.match(audit, /監査が未起動、停止、遅延、未完了、または一件も存在しなくても/);
  assert.match(audit, /通常報告または利用者要求を管理スレが受理/);
  assert.match(audit, /監査は通常報告を監査経由へ迂回させる入口でも、TODO化、T採番/);
  assert.match(audit, /監査起点かどうかに関係なく、全ての既存T/);
  assert.match(audit, /管理スレは通常T系列の案件管理者/);
  assert.match(audit, /`NO_ACTION`、`ABSORB:<existing-T>`、`NEW_T_REQUIRED`/);
  assert.match(audit, /空きT番号の採番、title、priority、owner、依存関係、実行順/);
  assert.match(audit, /正式なintake判断は`TODO_DECISION`/);
  assert.match(audit, /管理スレはタスク固有のauthorization envelope.*`TASK_DONE \/ CLOSED`を決定せず/s);
  assert.match(audit, /監督スレはintakeの`NO_ACTION \/ ABSORB \/ NEW_T_REQUIRED`、新規T作成・採番/);
  assert.match(audit, /監査の開始、再開、停止、範囲、頻度、TA／CPの状態を指示または変更しない/);
  assert.match(audit, /自分が取得・read-backしたTの正本証拠で`TASK_DONE \/ CLOSED`を判定/);
  assert.match(audit, /監査スレはTODO化、既存Tへの吸収、新規T作成・採番/);
  assert.match(audit, /監査スレは.*既存Tをcloseまたはreopenしない/s);
  assert.match(audit, /Tのcloseとfinding／TA／CPのcloseは別の状態/);
  assert.match(audit, /片方をもう片方へ自動伝播しない/);
  assert.match(audit, /監査作業スレはTODO化、既存Tへの吸収、T作成・採番/);
  assert.match(audit, /管理スレ、監督スレまたは作業スレの要約を成功証拠として信頼せず/);
  assert.match(audit, /AUDIT_INSTRUCTION/);
  assert.match(audit, /AUDIT_RESULT/);
  assert.match(audit, /AUDIT_ACCEPTANCE/);
  assert.match(audit, /KNOWN_FINDINGS/);
  assert.match(audit, /NEW_FINDINGS/);
  assert.match(audit, /RETEST_RESULTS/);
  assert.match(audit, /NOT_TESTED/);
  assert.match(audit, /record commit、blob SHA、path、内容をremote read-back/);
  assert.match(audit, /checkpointは復旧用であり/);
  assert.match(audit, /通常T系列（監査なしで完結）/);
  assert.match(audit, /利用者要求／通常報告／不具合報告/);
  assert.match(audit, /既に登録済みのT/);
  assert.match(audit, /新しい監査やTODO_DECISIONを待たず/);
  assert.match(audit, /監査系列（独立した追加線）/);
  assert.doesNotMatch(audit, /READY_FOR_REAUDIT/);
  assert.match(agents, /監査、TA／CP、管理、監督、TODO／Tの受け渡しを実際に扱う場合だけ/);
  assert.match(execution, /監査が何もしなくても管理、監督、作業スレだけでTODO化からcloseまで完遂/);
  assert.match(navigation, /AUDIT_THREAD_RULES\.md/);
});
