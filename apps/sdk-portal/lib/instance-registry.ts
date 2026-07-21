import { randomBytes } from "node:crypto";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const RESERVED = new Set(["api", "download", "downloads", "foundation", "status", "review", "www", "admin"]);

export function normalizeInstanceSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
}

export function validateInstanceSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) return "URL名は3〜32文字の小文字英数字とハイフンで指定してください。";
  if (RESERVED.has(slug)) return "このURL名はシステムで使用するため予約できません。";
  return null;
}

function redisConfig() {
  const url = process.env.SDK_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.SDK_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("SDK instance registry is not configured.");
  return { url: url.replace(/\/$/, ""), token };
}

async function command(parts: readonly string[]) {
  const { url, token } = redisConfig();
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(parts), cache: "no-store" });
  if (!response.ok) throw new Error("SDK instance registry request failed.");
  return response.json() as Promise<{ result: unknown }>;
}

const keyFor = (slug: string) => `sdk:preview-instance:v1:${slug}`;

export async function instanceSlugAvailable(slug: string) {
  const response = await command(["EXISTS", keyFor(slug)]);
  return Number(response.result) === 0;
}

export async function reserveInstanceSlug(slug: string, displayName: string) {
  const reservationToken = randomBytes(24).toString("base64url");
  const value = JSON.stringify({ slug, displayName: displayName.slice(0, 80), status: "reserved", reservationToken, createdAt: new Date().toISOString() });
  const response = await command(["SET", keyFor(slug), value, "NX", "EX", String(7 * 24 * 60 * 60)]);
  if (response.result !== "OK") return null;
  return { slug, url: `https://sdk.game-fields.com/${slug}`, reservationToken, expiresInSeconds: 7 * 24 * 60 * 60 };
}
