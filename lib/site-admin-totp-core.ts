import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const siteAdminTotpDigits = 6;
export const siteAdminTotpStepMilliseconds = 30_000;
export const siteAdminTotpAllowedStepDrift = 1;

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function timingSafeCodeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function encodeSiteAdminTotpSecret(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function decodeSiteAdminTotpSecret(secret: string) {
  const normalized = secret.replace(/[\s-]/g, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) throw new Error("SITE_ADMIN_TOTP_SECRET_INVALID");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    value = (value << 5) | base32Alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

export function createSiteAdminTotpSecret() {
  return encodeSiteAdminTotpSecret(randomBytes(20));
}

export function siteAdminTotpCounter(now = Date.now()) {
  return Math.floor(now / siteAdminTotpStepMilliseconds);
}

export function createSiteAdminTotpCode(secret: string, counter: number) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("SITE_ADMIN_TOTP_COUNTER_INVALID");
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(decodeSiteAdminTotpSecret(secret)))
    .update(counterBytes)
    .digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24)
    | (digest[offset + 1]! << 16)
    | (digest[offset + 2]! << 8)
    | digest[offset + 3]!;
  return String(binary % (10 ** siteAdminTotpDigits)).padStart(siteAdminTotpDigits, "0");
}

export function findSiteAdminTotpCounter(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = siteAdminTotpCounter(now);
  const offsets = [0];
  for (let offset = 1; offset <= siteAdminTotpAllowedStepDrift; offset += 1) offsets.push(-offset, offset);
  const counters = offsets.map((offset) => current + offset).filter((counter, index, values) => counter >= 0 && values.indexOf(counter) === index);
  for (const counter of counters) {
    if (timingSafeCodeEqual(createSiteAdminTotpCode(secret, counter), code)) return counter;
  }
  return null;
}

export function canConsumeSiteAdminTotpCounter(lastUsedCounter: number | null, candidateCounter: number) {
  return Number.isSafeInteger(candidateCounter)
    && candidateCounter >= 0
    && (lastUsedCounter === null || candidateCounter > lastUsedCounter);
}

function encryptionKey(material: string) {
  return createHash("sha256").update(`game-fields-site-admin-totp:v1:${material}`).digest();
}

export type SiteAdminEncryptedTotpSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function encryptSiteAdminTotpSecret(secret: string, keyMaterial: string): SiteAdminEncryptedTotpSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyMaterial), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptSiteAdminTotpSecret(encrypted: SiteAdminEncryptedTotpSecret, keyMaterial: string) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyMaterial), Buffer.from(encrypted.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("SITE_ADMIN_TOTP_SECRET_UNAVAILABLE");
  }
}

export function siteAdminTotpProvisioningUri(email: string, secret: string) {
  const label = encodeURIComponent(`GAME FIELDS Admin:${email}`);
  const issuer = encodeURIComponent("GAME FIELDS Admin");
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=${siteAdminTotpDigits}&period=30`;
}
