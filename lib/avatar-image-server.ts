export const maxAvatarUploadBytes = 64 * 1024;

type AvatarBlobEnvironment = Record<string, string | undefined>;

export type AvatarBlobTokenResolution = {
  key: string | null;
  token: string | null;
  candidateKeys: string[];
};

function normalizedEnvironmentKey(key: string) {
  return key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function resolveAvatarBlobToken(env: AvatarBlobEnvironment): AvatarBlobTokenResolution {
  const entries = Object.entries(env)
    .map(([key, value]) => [key, value?.trim()] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));

  const candidates = entries.filter(([key]) => {
    const normalized = normalizedEnvironmentKey(key);
    return normalized.includes("BLOB") && normalized.endsWith("READ_WRITE_TOKEN");
  });
  const candidateKeys = candidates.map(([key]) => key);

  for (const key of ["AVATAR_BLOB_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN"]) {
    const match = entries.find(([entryKey]) => entryKey === key);
    if (match) return { key: match[0], token: match[1], candidateKeys };
  }

  const avatarCandidates = candidates.filter(([key]) => normalizedEnvironmentKey(key).includes("AVATAR"));
  if (avatarCandidates.length === 1) {
    return { key: avatarCandidates[0][0], token: avatarCandidates[0][1], candidateKeys };
  }

  const appCandidates = candidates.filter(([key]) => {
    const normalized = normalizedEnvironmentKey(key);
    return normalized.includes("APP_GAMES") || normalized.includes("GAME_FIELDS");
  });
  if (appCandidates.length === 1) {
    return { key: appCandidates[0][0], token: appCandidates[0][1], candidateKeys };
  }

  if (candidates.length === 1) {
    return { key: candidates[0][0], token: candidates[0][1], candidateKeys };
  }

  return { key: null, token: null, candidateKeys };
}

export function resolveAvatarBlobStoreId(env: AvatarBlobEnvironment): AvatarBlobTokenResolution {
  const entries = Object.entries(env)
    .map(([key, value]) => [key, value?.trim()] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));

  const candidates = entries.filter(([key]) => {
    const normalized = normalizedEnvironmentKey(key);
    return normalized.includes("BLOB") && normalized.endsWith("STORE_ID");
  });
  const candidateKeys = candidates.map(([key]) => key);

  for (const key of ["AVATAR_BLOB_STORE_ID", "BLOB_avatars_STORE_ID"]) {
    const match = entries.find(([entryKey]) => entryKey === key);
    if (match) return { key: match[0], token: match[1], candidateKeys };
  }

  const avatarCandidates = candidates.filter(([key]) => normalizedEnvironmentKey(key).includes("AVATAR"));
  if (avatarCandidates.length === 1) {
    return { key: avatarCandidates[0][0], token: avatarCandidates[0][1], candidateKeys };
  }

  if (candidates.length === 1) {
    return { key: candidates[0][0], token: candidates[0][1], candidateKeys };
  }

  return { key: null, token: null, candidateKeys };
}

export function isWebpImage(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes.length > maxAvatarUploadBytes) return false;
  return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}
