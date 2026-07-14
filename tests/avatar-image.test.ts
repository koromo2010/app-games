import assert from "node:assert/strict";
import test from "node:test";
import { isWebpImage, maxAvatarUploadBytes } from "../lib/avatar-image-server.ts";
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
