import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SDK_HELP_ENTRIES } from "../apps/sdk-portal/lib/sdk-help.ts";

const REQUIRED_HELP_IDS = [
  "package-candidate-and-formal-submission",
  "submission-permission",
  "after-formal-submission",
  "draft-game-persistence",
];

const root = fileURLToPath(new URL("../", import.meta.url));
const mcpRoute = await readFile(`${root}apps/sdk-portal/app/api/mcp/route.ts`, "utf8");
const helpPage = await readFile(`${root}apps/sdk-portal/app/help/page.tsx`, "utf8");

assert.ok(SDK_HELP_ENTRIES.length > 0, "SDK Help正本にFAQが1件もありません");

const ids = new Set();
for (const entry of SDK_HELP_ENTRIES) {
  assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `SDK Help IDが不正です: ${entry.id}`);
  assert.ok(!ids.has(entry.id), `SDK Help IDが重複しています: ${entry.id}`);
  ids.add(entry.id);

  assert.ok(entry.title.trim().length > 0, `${entry.id}: titleが空です`);
  assert.ok(entry.question.trim().endsWith("？"), `${entry.id}: questionは質問文にしてください`);
  assert.ok(entry.answer.trim().length >= 20, `${entry.id}: answerが短すぎます`);
  assert.ok(entry.keywords.length >= 2, `${entry.id}: keywordsを2件以上登録してください`);
  assert.equal(
    new Set(entry.keywords.map((keyword) => keyword.trim().toLocaleLowerCase("ja"))).size,
    entry.keywords.length,
    `${entry.id}: keywordsが重複しています`,
  );

  for (const toolName of entry.relatedToolNames) {
    assert.ok(
      mcpRoute.includes(`name: "${toolName}"`),
      `${entry.id}: 関連MCPツール ${toolName} が公開ツール一覧にありません`,
    );
  }
}

for (const requiredId of REQUIRED_HELP_IDS) {
  assert.ok(ids.has(requiredId), `必須SDK FAQがありません: ${requiredId}`);
}

assert.match(helpPage, /SDK_HELP_ENTRIES/, "/help画面がSDK Help正本を参照していません");
assert.match(mcpRoute, /searchSdkHelp/, "MCPがSDK Help検索を参照していません");
assert.match(mcpRoute, /name: "search_sdk_help"/, "search_sdk_helpがMCP公開ツールにありません");

console.log(`SDK Help checks passed (${SDK_HELP_ENTRIES.length} entries).`);
