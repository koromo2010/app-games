import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { resolveAvatarBlobStoreId, resolveAvatarBlobToken } from "@/lib/avatar-image-server";
import { isSiteAdminConfigurationError, requireSiteAdminSession } from "@/lib/site-admin-auth";
import { isSiteIconImage, maxSiteIconUploadBytes } from "@/lib/site-icon-image";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/admin/site-icon", { operation: "site-icon-upload" });
  try {
    await requireSiteAdminSession();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.avatarUpload);
    if (limited) return limited;
    const blobToken = resolveAvatarBlobToken(process.env);
    const blobStore = resolveAvatarBlobStoreId(process.env);
    if (!blobToken.token && !blobStore.token) return Response.json({ error: "SITE_ICON_BLOB_NOT_CONFIGURED" }, { status: 503 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxSiteIconUploadBytes + 16 * 1024) return Response.json({ error: "SITE_ICON_FILE_TOO_LARGE" }, { status: 413 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !["image/png", "image/webp"].includes(file.type) || file.size > maxSiteIconUploadBytes) return Response.json({ error: "SITE_ICON_FILE_INVALID" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isSiteIconImage(bytes, file.type)) return Response.json({ error: "SITE_ICON_FILE_INVALID" }, { status: 400 });
    const extension = file.type === "image/png" ? "png" : "webp";
    const blob = await put(`site-icons/${randomUUID()}.${extension}`, file, {
      access: "public",
      ...(blobToken.token ? { token: blobToken.token } : { storeId: blobStore.token!, ...(process.env.VERCEL_OIDC_TOKEN ? { oidcToken: process.env.VERCEL_OIDC_TOKEN } : {}) }),
      addRandomSuffix: false,
      contentType: file.type,
      cacheControlMaxAge: 31_536_000,
      abortSignal: AbortSignal.timeout(10_000),
    });
    telemetry.success("site.settings", { action: "icon-upload" });
    return Response.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
    if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
    telemetry.failure("site.settings", error, 500, { action: "icon-upload" });
    return Response.json({ error: "SITE_ICON_UPLOAD_FAILED" }, { status: 500 });
  }
}
