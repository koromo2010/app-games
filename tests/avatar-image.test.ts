import assert from "node:assert/strict";
import test from "node:test";
import { isWebpImage, maxAvatarUploadBytes, resolveAvatarBlobStoreId, resolveAvatarBlobToken } from "../lib/avatar-image-server.ts";
import { isAvatarImage } from "../lib/player-session.ts";

test("accepts only avatar URLs from public Vercel Blob storage", () => {
  assert.equal(isAvatarImage("https://example.public.blob.vercel-storage.com/avatars/id.webp"), true);
  assert.equal(isAvatarImage("https://example.public.blob.vercel-storage.com/other/id.webp"), false);
  assert.equal(isAvatarImage("https://example.com/avatars/id.webp"), false);
  assert.equal(isAvatarImage("http://example.public.blob.vercel-storage.com/avatars/id.webp"), false);
});

test("checks WebP signatures and upload size", () => {
  const valid = new Uint8Array(12);
  valid.set(new TextEncoder().encode("RIFF"), 0);
  valid.set(new TextEncoder().encode("WEBP"), 8);
  assert.equal(isWebpImage(valid), true);
  assert.equal(isWebpImage(new TextEncoder().encode("not-an-image")), false);
  assert.equal(isWebpImage(new Uint8Array(maxAvatarUploadBytes + 1)), false);
});

test("resolves standard and custom Vercel Blob token names", () => {
  assert.equal(resolveAvatarBlobToken({ BLOB_READ_WRITE_TOKEN: "standard-token" }).token, "standard-token");
  assert.equal(
    resolveAvatarBlobToken({ APP_GAMES_BLOB_READ_WRITE_TOKEN: "custom-token" }).token,
    "custom-token",
  );
});

test("prefers an avatar Blob token when more than one Blob is configured", () => {
  const result = resolveAvatarBlobToken({
    REPORTS_BLOB_READ_WRITE_TOKEN: "reports-token",
    PLAYER_AVATAR_BLOB_READ_WRITE_TOKEN: "avatar-token",
  });
  assert.equal(result.key, "PLAYER_AVATAR_BLOB_READ_WRITE_TOKEN");
  assert.equal(result.token, "avatar-token");
});

test("does not guess when multiple unrelated Blob tokens are configured", () => {
  const result = resolveAvatarBlobToken({
    FIRST_BLOB_READ_WRITE_TOKEN: "first-token",
    SECOND_BLOB_READ_WRITE_TOKEN: "second-token",
  });
  assert.equal(result.key, null);
  assert.equal(result.token, null);
  assert.deepEqual(result.candidateKeys, [
    "FIRST_BLOB_READ_WRITE_TOKEN",
    "SECOND_BLOB_READ_WRITE_TOKEN",
  ]);
});

test("prefers the connected avatar Blob store ID for OIDC uploads", () => {
  const result = resolveAvatarBlobStoreId({
    BLOB_STORE_ID: "generic-store",
    BLOB_avatars_STORE_ID: "avatar-store",
  });
  assert.equal(result.key, "BLOB_avatars_STORE_ID");
  assert.equal(result.token, "avatar-store");
});
