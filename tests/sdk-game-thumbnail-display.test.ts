import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("SDK game routes render the registered presentation visual in a dedicated layout", () => {
  const layout = read("apps/sdk-portal/app/[instanceId]/games/[gameId]/layout.tsx");

  assert.match(layout, /resolveApprovedSdkGamePresentation/);
  assert.match(layout, /src=\{presentation\.visual\}/);
  assert.match(layout, /alt=\{`\$\{presentation\.title\.ja\}のゲームサムネイル`\}/);
  assert.match(layout, /width=\{1200\}/);
  assert.match(layout, /height=\{500\}/);
});
