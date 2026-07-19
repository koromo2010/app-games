import {
  isTahoiyaHistoryTopicId,
  normalizeTahoiyaHistoryTopicIds,
  normalizeTahoiyaHistoryWord,
} from "../../lib/tahoiya-topic-history-id.ts";

const storageKey = "tahoiya-device-topic-history-v1";
const historyLimit = 100;
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64Url(bytes: Uint8Array) {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += base64UrlAlphabet[(value >> 18) & 63];
    encoded += base64UrlAlphabet[(value >> 12) & 63];
    if (second !== undefined) encoded += base64UrlAlphabet[(value >> 6) & 63];
    if (third !== undefined) encoded += base64UrlAlphabet[value & 63];
  }
  return encoded;
}

export async function createTahoiyaDeviceTopicId(word: string) {
  const normalized = normalizeTahoiyaHistoryWord(word);
  if (!normalized) return "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return `word-v1:${bytesToBase64Url(new Uint8Array(digest))}`;
}

export function parseTahoiyaDeviceTopicHistory(value: unknown) {
  return normalizeTahoiyaHistoryTopicIds(value, historyLimit);
}

export function loadTahoiyaDeviceTopicHistory(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    const raw = storage.getItem(storageKey);
    return raw ? parseTahoiyaDeviceTopicHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function rememberTahoiyaDeviceTopic(
  word: string,
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
) {
  const topicId = await createTahoiyaDeviceTopicId(word);
  if (!isTahoiyaHistoryTopicId(topicId)) return [];
  const next = [topicId, ...loadTahoiyaDeviceTopicHistory(storage).filter((id) => id !== topicId)].slice(0, historyLimit);
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export async function syncTahoiyaDeviceTopicHistory(
  history = loadTahoiyaDeviceTopicHistory(),
  request: typeof fetch = fetch,
) {
  if (history.length === 0) return true;
  const response = await request("/api/tahoiya/topic-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicIds: history }),
  });
  return response.ok;
}
