export const maxSiteIconUploadBytes = 512 * 1024;

export function isPngImage(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && bytes.length <= maxSiteIconUploadBytes && signature.every((value, index) => bytes[index] === value);
}

export function isSiteIconImage(bytes: Uint8Array, type: string) {
  if (type === "image/png") return isPngImage(bytes);
  if (type !== "image/webp" || bytes.length < 12 || bytes.length > maxSiteIconUploadBytes) return false;
  return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}
