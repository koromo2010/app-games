import assert from "node:assert/strict";
import test from "node:test";
import { generateGeminiText } from "../lib/gemini.ts";
import { gameLlmTextMatchesJsonSchema } from "../lib/game-llm-json-schema.ts";

const verdictSchema = {
  name: "akinator_five_verdict",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: [
          "definitely_yes",
          "probably_yes",
          "unknown_or_neutral",
          "probably_no",
          "definitely_no",
        ],
      },
    },
    required: ["verdict"],
    additionalProperties: false,
  },
};

test("structured LLM output validation rejects malformed and off-schema JSON", () => {
  assert.equal(
    gameLlmTextMatchesJsonSchema(
      "{\"verdict\":\"definitely_yes\"}",
      verdictSchema,
    ),
    true,
  );
  assert.equal(
    gameLlmTextMatchesJsonSchema(
      "{\"verdict\":\"はい\"}",
      verdictSchema,
    ),
    false,
  );
  assert.equal(
    gameLlmTextMatchesJsonSchema(
      "{\"verdict\":\"definitely_yes\",\"reason\":\"extra\"}",
      verdictSchema,
    ),
    false,
  );
  assert.equal(
    gameLlmTextMatchesJsonSchema("```json\n{}\n```", verdictSchema),
    false,
  );
});

test("Gemini receives the SDK response JSON schema", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      candidates: [{
        content: {
          parts: [{ text: "{\"verdict\":\"definitely_yes\"}" }],
        },
      }],
    });
  };
  try {
    const text = await generateGeminiText("判定してください。", {
      apiKey: "test-key",
      responseJsonSchema: verdictSchema,
    });
    assert.equal(text, "{\"verdict\":\"definitely_yes\"}");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    (
      requestBody?.generationConfig as Record<string, unknown>
    )?.responseJsonSchema,
    verdictSchema.schema,
  );
  assert.equal(
    (
      requestBody?.generationConfig as Record<string, unknown>
    )?.responseMimeType,
    "application/json",
  );
});
