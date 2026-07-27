import type { GameLlmJsonSchema } from "@/lib/game-llm";

const maximumSchemaValidationDepth = 32;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function valueMatchesType(value: unknown, type: unknown) {
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "number":
      return finiteNumber(value);
    case "integer":
      return Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return objectValue(value) !== null;
    default:
      return true;
  }
}

function matchesSchema(
  value: unknown,
  schemaValue: unknown,
  depth = 0,
): boolean {
  if (depth > maximumSchemaValidationDepth) return false;
  const schema = objectValue(schemaValue);
  if (!schema) return true;

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (anyOf && !anyOf.some((candidate) => (
    matchesSchema(value, candidate, depth + 1)
  ))) {
    return false;
  }
  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : null;
  if (oneOf && !oneOf.some((candidate) => (
    matchesSchema(value, candidate, depth + 1)
  ))) {
    return false;
  }

  const acceptedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type === undefined
      ? []
      : [schema.type];
  if (
    acceptedTypes.length > 0
    && !acceptedTypes.some((type) => valueMatchesType(value, type))
  ) {
    return false;
  }

  if (
    Array.isArray(schema.enum)
    && !schema.enum.some((candidate) => Object.is(candidate, value))
  ) {
    return false;
  }

  if (typeof value === "string") {
    if (finiteNumber(schema.minLength) && value.length < schema.minLength) {
      return false;
    }
    if (finiteNumber(schema.maxLength) && value.length > schema.maxLength) {
      return false;
    }
  }

  if (finiteNumber(value)) {
    if (finiteNumber(schema.minimum) && value < schema.minimum) return false;
    if (finiteNumber(schema.maximum) && value > schema.maximum) return false;
  }

  if (Array.isArray(value)) {
    if (finiteNumber(schema.minItems) && value.length < schema.minItems) {
      return false;
    }
    if (finiteNumber(schema.maxItems) && value.length > schema.maxItems) {
      return false;
    }
    if (
      schema.items
      && !value.every((item) => matchesSchema(item, schema.items, depth + 1))
    ) {
      return false;
    }
  }

  const object = objectValue(value);
  if (object) {
    const properties = objectValue(schema.properties) ?? {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [];
    if (required.some((key) => !(key in object))) return false;
    for (const [key, propertyValue] of Object.entries(object)) {
      if (key in properties) {
        if (!matchesSchema(propertyValue, properties[key], depth + 1)) {
          return false;
        }
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (
        objectValue(schema.additionalProperties)
        && !matchesSchema(
          propertyValue,
          schema.additionalProperties,
          depth + 1,
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function gameLlmTextMatchesJsonSchema(
  text: string,
  responseJsonSchema?: GameLlmJsonSchema,
) {
  if (!responseJsonSchema) return true;
  try {
    return matchesSchema(JSON.parse(text), responseJsonSchema.schema);
  } catch {
    return false;
  }
}
