import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { paidLlmModel } from "@/lib/llm-model";

export { paidLlmModel };

const paidLlmCookieName = "app_games_paid_llm";
const paidLlmCookieMaxAge = 60 * 60 * 8;

function getAccessPassword() {
  return process.env.LLM_ACCESS_PASSWORD?.trim() ?? "";
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

export function verifyPaidLlmPassword(password: string) {
  const configuredPassword = getAccessPassword();
  if (!configuredPassword || !password) return false;
  return safeEqual(password, configuredPassword);
}

export async function hasPaidLlmAccess() {
  if (!hasPaidLlmPassword() || !hasOpenAiApiKey()) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(paidLlmCookieName)?.value ?? "";
  return Boolean(token) && safeEqual(token, makeAccessToken());
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
