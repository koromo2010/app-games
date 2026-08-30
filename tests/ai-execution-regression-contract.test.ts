import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Windows helper recovery details remain protected outside the policy kernel", () => {
  const troubleshooting = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");
  for (const pattern of [
    /DevTools操作やスクリーンショットが反復/,
    /未検証scriptの反復実行を利用者へ依頼しない/,
    /Windows path separator、空白、文字code、quoting/,
    /同じfailure classと残りの全分岐を横断監査/,
    /-split '\\r\\n\|\\n\|\\r'/,
    /表示行数やraw multiline stringを比較しない/,
    /`missing`、`unexpected`、`equal`/,
    /`expected count`だけが1/,
    /改行parserの不具合/,
    /成功したGitのstderrがPowerShell error recordとなり得る/,
    /非空stderrではなくcommand直後の`\$LASTEXITCODE`で判定/,
    /成功・停止のどちらでも`pause`/,
    /LF、CRLF、lone CR、順序違い、重複、空行/,
  ]) assert.match(troubleshooting, pattern);
});

test("Windows helper reference remains reachable from canonical navigation", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const navigation = read("docs/README.md");
  const systemMap = read("docs/SYSTEM_MAP.md");
  assert.match(root, /AI_EXECUTION_TROUBLESHOOTING\.md.*非規範reference/);
  assert.match(navigation, /利用者PC向けone-click helper・PowerShell/);
  assert.match(navigation, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
  assert.match(systemMap, /利用者PC向けhelperやPowerShellを作る/);
  assert.match(systemMap, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
});

test("SDK handshake failure classification and proposal read-back remain protected", () => {
  const documentation = read("docs/SDK_HANDSHAKE.md");
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(documentation, /`accepted=false`だけを正式resultのterminal boundaryにしない/);
  assert.match(entry, /CLASSIFY HANDSHAKE\.problems\[\*\]\.code/);
  assert.match(entry, /HALT on the true compatibility blocker/);
  assert.doesNotMatch(entry, /IF HANDSHAKE\.accepted != true:\n\s+EMIT C1\.HANDSHAKE_FAILURE_PREFIX[^\n]*\n\s+HALT\./);
  assert.match(entry, /PROPOSAL_READBACK\.proposal\.compatibilityState != "compatible"/);
  assert.match(entry, /PROPOSAL_READBACK\.activeProfileChanged == false/);
  assert.match(entry, /PROPOSAL_READBACK\.humanApprovalRequired == true/);
  assert.doesNotMatch(entry, /PROPOSAL_READBACK\.proposal\.requestId/);
});

test("Claude Code and current SDK navigation retain the shared authoring contract", () => {
  const profile = read("sdk/entry/START_CLAUDE_CODE.md");
  const navigation = read("docs/README.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  const external = read("docs/EXTERNAL_GAME_PACKAGE.md");
  const overview = read("docs/CHATGPT_GAME_SDK.md");
  assert.match(profile, /`activeProfileChanged=false`/);
  assert.match(profile, /`humanApprovalRequired=true`/);
  assert.match(profile, /canonical MCP URL, release, or onboarding profile mismatches/);
  assert.match(navigation, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  for (const document of [handoff, external, overview]) assert.doesNotMatch(document, /Codex/);
  assert.doesNotMatch(handoff, /`accepted=true`とcanonical endpoint一致を確認/);
});
