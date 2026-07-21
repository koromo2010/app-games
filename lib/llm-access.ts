import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { freeGroqLlmModel, freeLlmModel, paidLlmModel } from "@/lib/llm-model";
import { sharedEnvironmentVariable } from "@/lib/shared-environment";

export { paidLlmModel };

const paidLlmCookieName = "app_games_paid_llm";
const personalLlmCookieName = "app_games_personal_llm";
const legacyPersonalOpenAiCookieName = "app_games_personal_openai";
const paidLlmCookieMaxAge = 60 * 60 * 8;

export type PaidLlmAccessSource = "personal" | "game-fields";
export type PersonalLlmProvider = "openai" | "gemini" | "groq";
export type PersonalLlmAccess = { provider: PersonalLlmProvider; apiKey: string };

function getAccessPassword() {
  return process.env.LLM_ACCESS_PASSWORD?.trim() ?? "";
}

function getSessionSecret() {
  const configured = process.env.LLM_SESSION_SECRET?.trim() ?? "";
  if (configured.length >= 32) return configured;

  const accessPassword = getAccessPassword();
  const sharedApiKey = sharedEnvironmentVariable("OPENAI_API_KEY") ?? "";
  if (!accessPassword || !sharedApiKey) return "";
  return createHash("sha256")
    .update(`app-games-llm-session-fallback:${accessPassword}:${sharedApiKey}`)
    .digest("hex");
}

function sessionEncryptionKey() {
  const secret = getSessionSecret();
  if (secret.length < 32) return null;
  return createHash("sha256").update(`app-games-personal-openai:${secret}`).digest();
}

function encryptPersonalAccess(access: PersonalLlmAccess) {
  const key = sessionEncryptionKey();
  if (!key) throw new Error("LLM_SESSION_SECRET_NOT_CONFIGURED");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(access), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptPersonalAccess(token: string): PersonalLlmAccess | null {
  const key = sessionEncryptionKey();
  if (!key || !token) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = token.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    try {
      const parsed = JSON.parse(decrypted) as Partial<PersonalLlmAccess>;
      if (
        (parsed.provider === "openai" || parsed.provider === "gemini" || parsed.provider === "groq") &&
        typeof parsed.apiKey === "string" && parsed.apiKey
      ) {
        return { provider: parsed.provider, apiKey: parsed.apiKey };
      }
    } catch {
      // The legacy cookie encrypted only the raw OpenAI key.
      if (decrypted) return { provider: "openai", apiKey: decrypted };
    }
    return null;
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
  return Boolean(sharedEnvironmentVariable("OPENAI_API_KEY"));
}

export function hasPersonalLlmConfiguration() {
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

export async function getPersonalLlmAccess() {
  const cookieStore = await cookies();
  const current = decryptPersonalAccess(cookieStore.get(personalLlmCookieName)?.value ?? "");
  if (current) return current;
  return decryptPersonalAccess(cookieStore.get(legacyPersonalOpenAiCookieName)?.value ?? "");
}

export async function getPaidLlmAccessSource(): Promise<PaidLlmAccessSource | null> {
  if (await getPersonalLlmAccess()) return "personal";
  if (await hasGameFieldsPaidLlmAccess()) return "game-fields";
  return null;
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

export async function enablePersonalLlmAccess(provider: PersonalLlmProvider, apiKey: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: personalLlmCookieName,
    value: encryptPersonalAccess({ provider, apiKey: apiKey.trim() }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: paidLlmCookieMaxAge,
  });
  cookieStore.delete(legacyPersonalOpenAiCookieName);
}

export async function disablePersonalLlmAccess() {
  const cookieStore = await cookies();
  cookieStore.delete(personalLlmCookieName);
  cookieStore.delete(legacyPersonalOpenAiCookieName);
}

export async function verifyPersonalLlmApiKey(provider: PersonalLlmProvider, apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length < 20 || normalized.length > 512 || /\s/.test(normalized)) return false;

  try {
    if (provider === "gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${freeLlmModel}`, {
        headers: { "x-goog-api-key": normalized },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if ([400, 401, 403, 404].includes(response.status)) return false;
      if (!response.ok) throw new Error(`GEMINI_KEY_VALIDATION_FAILED_${response.status}`);
      return true;
    }

    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: normalized,
      ...(provider === "groq" ? { baseURL: "https://api.groq.com/openai/v1" } : {}),
      maxRetries: 0,
      timeout: 10000,
    });
    await client.models.retrieve(provider === "groq" ? freeGroqLlmModel : paidLlmModel);
    return true;
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
    if ([400, 401, 403, 404].includes(status)) return false;
    throw error;
  }
}
