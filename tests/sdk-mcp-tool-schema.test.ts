import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "apps/sdk-portal/app/api/mcp/route.ts";

function extractObjectLiteral(source: string, declaration: string) {
  const declarationStart = source.indexOf(declaration);
  assert.notEqual(declarationStart, -1, `missing ${declaration}`);
  const objectStart = source.indexOf("{", declarationStart);
  assert.notEqual(objectStart, -1, `missing object for ${declaration}`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const objectText = source.slice(objectStart, index + 1);
        return Function(`"use strict"; return (${objectText});`)();
      }
    }
  }
  assert.fail(`unterminated object for ${declaration}`);
}

function publishPostHandshakeSchema(inputSchema: Record<string, unknown>) {
  const environmentBindingSchema = extractObjectLiteral(
    readFileSync(routePath, "utf8"),
    "const environmentBindingSchema =",
  ) as Record<string, unknown>;
  return {
    ...inputSchema,
    properties: {
      ...(inputSchema.properties as Record<string, unknown>),
      environmentBinding: environmentBindingSchema,
    },
    required: [...((inputSchema.required as string[] | undefined) ?? []), "environmentBinding"],
  };
}

function validateChatGptWorkInputSchema(schema: Record<string, unknown>) {
  assert.equal(schema.type, "object");
  assert.equal(typeof schema.properties, "object");
  assert.equal(typeof schema.additionalProperties, "boolean");
  const properties = schema.properties as Record<string, unknown>;
  const required = (schema.required as unknown[] | undefined) ?? [];
  assert.ok(required.every((name) => typeof name === "string"));
  assert.equal(new Set(required).size, required.length, "required must not contain duplicate property names");
  for (const name of required as string[]) {
    assert.ok(Object.hasOwn(properties, name), `required property ${name} must be declared`);
  }
}

test("published get_module_update_status schema is accepted after shared binding injection", () => {
  const source = readFileSync(routePath, "utf8");
  const definition = extractObjectLiteral(
    source,
    "const moduleUpdateStatusToolDefinition =",
  ) as { inputSchema: Record<string, unknown> };
  const publishedInputSchema = publishPostHandshakeSchema(definition.inputSchema);

  assert.deepEqual(publishedInputSchema.required, [
    "slug",
    "gameId",
    "requestId",
    "environmentBinding",
  ]);
  assert.deepEqual(Object.keys(publishedInputSchema.properties as object).sort(), [
    "environmentBinding",
    "gameId",
    "requestId",
    "slug",
  ]);
  validateChatGptWorkInputSchema(publishedInputSchema);
});

test("the rejected pre-correction status schema identifies the exact incompatible element", () => {
  const source = readFileSync(routePath, "utf8");
  const definition = extractObjectLiteral(
    source,
    "const moduleUpdateStatusToolDefinition =",
  ) as { inputSchema: Record<string, unknown> };
  const preCorrectionSchema = {
    ...definition.inputSchema,
    properties: {
      ...(definition.inputSchema.properties as Record<string, unknown>),
      environmentBinding: { type: "string", minLength: 32 },
    },
    required: [
      ...((definition.inputSchema.required as string[] | undefined) ?? []),
      "environmentBinding",
      "environmentBinding",
    ],
  };

  assert.throws(
    () => validateChatGptWorkInputSchema(preCorrectionSchema),
    /required must not contain duplicate property names/,
  );
});
