export const maxAvatarUploadBytes = 64 * 1024;

export function isWebpImage(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes.length > maxAvatarUploadBytes) return false;
  return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}
