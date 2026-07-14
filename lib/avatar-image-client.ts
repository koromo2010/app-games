const maxUploadBytes = 10 * 1024 * 1024;
const outputSizes = [128, 96] as const;
const outputQualities = [0.82, 0.68, 0.52] as const;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("AVATAR_ENCODE_FAILED"));
    reader.onerror = () => reject(new Error("AVATAR_ENCODE_FAILED"));
    reader.readAsDataURL(blob);
  });
}

export async function compressAvatarImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("AVATAR_FILE_TYPE");
  if (file.size > maxUploadBytes) throw new Error("AVATAR_FILE_TOO_LARGE");

  const bitmap = await createImageBitmap(file);
  try {
    const cropSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.floor((bitmap.width - cropSize) / 2);
    const sourceY = Math.floor((bitmap.height - cropSize) / 2);
    let smallestBlob: Blob | null = null;

    for (const size of outputSizes) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("AVATAR_CANVAS_UNAVAILABLE");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);

      for (const quality of outputQualities) {
        const blob = await canvasToBlob(canvas, "image/webp", quality);
        if (!blob) continue;
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= 48 * 1024) return blobToDataUrl(blob);
      }
    }

    if (!smallestBlob) throw new Error("AVATAR_ENCODE_FAILED");
    return blobToDataUrl(smallestBlob);
  } finally {
    bitmap.close();
  }
}
