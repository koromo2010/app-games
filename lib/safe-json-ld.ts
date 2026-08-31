const jsonLdScriptContextEscapes: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeJsonLd(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("JSON_LD_VALUE_NOT_SERIALIZABLE");
  }
  return serialized.replace(/[<>&\u2028\u2029]/g, (character) => jsonLdScriptContextEscapes[character]);
}
