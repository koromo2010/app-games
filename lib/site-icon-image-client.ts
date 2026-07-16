const maxSourceBytes = 10 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function prepareSiteIcon(file: File) {
  if (!file.type.startsWith("image/") || file.size > maxSourceBytes) throw new Error("SITE_ICON_SOURCE_INVALID");
  const bitmap = await createImageBitmap(file);
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("SITE_ICON_CANVAS_UNAVAILABLE");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, Math.floor((bitmap.width - crop) / 2), Math.floor((bitmap.height - crop) / 2), crop, crop, 0, 0, 192, 192);
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error("SITE_ICON_ENCODE_FAILED");
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function uploadSiteIcon(file: File) {
  const icon = await prepareSiteIcon(file);
  const formData = new FormData();
  formData.set("file", icon, "site-icon.png");
  const response = await fetch("/api/admin/site-icon", { method: "POST", body: formData });
  const data = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null;
  if (!response.ok || typeof data?.url !== "string") throw new Error(typeof data?.error === "string" ? data.error : "SITE_ICON_UPLOAD_FAILED");
  return data.url;
}
