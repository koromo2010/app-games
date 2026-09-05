import assert from "node:assert/strict";
import test from "node:test";
import { PUBLISH_MOCK_TOOL } from "../apps/sdk-portal/lib/sdk-mcp-tool-definitions.ts";

test("published tool contract accepts only the two lossless representations", () => {
  const files = PUBLISH_MOCK_TOOL.inputSchema.properties.files;
  assert.equal(files.oneOf.length, 2);
  assert.match(files.description, /src\/\*\*/);
});
