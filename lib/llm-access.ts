import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { paidLlmModel } from "@/lib/llm-model";

export { paidLlmModel };

const paidLlmCookieName = "app_games_paid_llm";
const personalOpenAiCookieName = "app_games_personal_openai";
const paidLlmCookieMaxAge = 60 * 60 * 8;

export type PaidLlmAccessSource = "personal" | "game-fields";

function getAccessPassword() {
  return process.env.LLM_ACCESS_PASSWORD?.trim() ?? "";
}

function getSessionSecret() {
  return process.env.LLM_SESSION_SECRET?.trim() ?? "";
}

function sessionEncryptionKey() {
  const secret = getSessionSecret();
  if (secret.length < 32) return null;
  return createHash("sha256").update(`app-games-personal-openai:${secret}`).digest();
}

function encryptPersonalApiKey(apiKey: string) {
  const key = sessionEncryptionKey();
  if (!key) throw new Error("LLM_SESSION_SECRET_NOT_CONFIGURED");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptPersonalApiKey(token: string) {
  const key = sessionEncryptionKey();
  if (!key || !token) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = token.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function makeAccessToken(password = getAccessPassword()) {
  return createHash("sha256")
    .update(`app-games-paid-llm:${password}`)
    .digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasPaidLlmPassword() {
  return Boolean(getAccessPassword());
}

export function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasPersonalOpenAiConfiguration() {
  return Boolean(sessionEncryptionKey());
}

export function verifyPaidLlmPassword(password: string) {
  const configuredPassword = getAccessPassword();
  if (!configuredPassword || !password) return false;
  return safeEqual(password, configuredPassword);
}

async function hasGameFieldsPaidLlmAccess() {
  if (!hasPaidLlmPassword() || !hasOpenAiApiKey()) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(paidLlmCookieName)?.value ?? "";
  return Boolean(token) && safeEqual(token, makeAccessToken());
}

export async function getPersonalOpenAiApiKey() {
  const cookieStore = await cookies();
  return decryptPersonalApiKey(cookieStore.get(personalOpenAiCookieName)?.value ?? "");
}

export async function getPaidLlmAccessSource(): Promise<PaidLlmAccessSource | null> {
  if (await getPersonalOpenAiApiKey()) return "personal";
  if (await hasGameFieldsPaidLlmAccess()) return "game-fields";
  return null;
}

export async function getActiveOpenAiApiKey() {
  const personalApiKey = await getPersonalOpenAiApiKey();
  if (personalApiKey) return { apiKey: personalApiKey, source: "personal" as const };
  if (await hasGameFieldsPaidLlmAccess()) {
    return { apiKey: process.env.OPENAI_API_KEY!, source: "game-fields" as const };
  }
  return null;
}

export async function hasPaidLlmAccess() {
  return Boolean(await getActiveOpenAiApiKey());
}

export async function enablePaidLlmAccess() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: paidLlmCookieName,
    value: makeAccessToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: paidLlmCookieMaxAge,
  });
}

export async function disablePaidLlmAccess() {
  const cookieStore = await cookies();
  cookieStore.delete(paidLlmCookieName);
}

export async function enablePersonalOpenAiAccess(apiKey: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: personalOpenAiCookieName,
    value: encryptPersonalApiKey(apiKey.trim()),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: paidLlmCookieMaxAge,
  });
}

export async function disablePersonalOpenAiAccess() {
  const cookieStore = await cookies();
  cookieStore.delete(personalOpenAiCookieName);
}

export async function verifyPersonalOpenAiApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length < 20 || normalized.length > 512 || /\s/.test(normalized)) return false;

  const response = await fetch("https://api.openai.com/v1/me", {
    headers: { Authorization: `Bearer ${normalized}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error(`OPENAI_KEY_VALIDATION_FAILED_${response.status}`);
  return true;
}
