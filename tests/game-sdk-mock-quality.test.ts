import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateGameSdkMockQuality } from "../packages/game-sdk/src/mock-quality.ts";

function starterMockFiles() {
  return Object.fromEntries(["index.html", "styles.css", "mock.js", "preview.json"].map(
    (file) => [file, readFileSync(`sdk/starter-template/mock/${file}`, "utf8")],
  ));
}

test("mock quality accepts observable game-specific states and actions", () => {
  const result = validateGameSdkMockQuality({ files: starterMockFiles() });
  assert.equal(result.gameId, "my-first-game");
  assert.equal(result.evidence.representativeStates.length, 2);
  assert.equal(result.evidence.visibleGameSpecificElements.length, 4);
  assert.equal(result.evidence.primaryActions[0]?.observableResultId, "count-updated");
});

test("mock quality rejects shared Shell duplication and missing evidence", () => {
  const files = starterMockFiles();
  assert.throws(() => validateGameSdkMockQuality({
    files: { ...files, "index.html": `${files["index.html"]}<div data-screen="lobby"></div>` },
  }), /GAME_SDK_MOCK_COMMON_SHELL_DUPLICATED/);
  const preview = JSON.parse(files["preview.json"]);
  delete preview.reviewEvidence.completionState;
  assert.throws(() => validateGameSdkMockQuality({
    files: { ...files, "preview.json": JSON.stringify(preview) },
  }), /GAME_SDK_MOCK_COMPLETION_STATE_REQUIRED/);
});
