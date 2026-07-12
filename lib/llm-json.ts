/**
 * Shared boundary helpers for model output.
 * Providers may return bare JSON, fenced JSON, or a JSON string containing JSON.
 */
export function stripLlmCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? trimmed).trim();
}

export function decodeUnicodeEscapes(value: string) {
  if (!value.includes("\\u")) return value;
  return value
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (match, code: string) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );
}

export function parseLlmJson<T>(value: unknown): T | null {
  if (value && typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  let current = stripLlmCodeFence(value);
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(current) as unknown;
      if (typeof parsed !== "string") return parsed as T;
      current = stripLlmCodeFence(parsed);
    } catch {
      return null;
    }
  }
  return null;
}
