import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { isWebpImage, maxAvatarUploadBytes } from "@/lib/avatar-image-server";
import { createRequestTelemetry } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-avatar", { operation: "avatar-upload" });
  try {
    const player = await requireAuthenticatedPlayer();
    const token = (
      process.env.AVATAR_BLOB_READ_WRITE_TOKEN ??
      process.env.BLOB_READ_WRITE_TOKEN
    )?.trim();
    if (!token) {
      telemetry.reject("auth.avatar", 503, { actorRef: telemetry.actorRef(player.id), errorCode: "AVATAR_BLOB_NOT_CONFIGURED" });
      return Response.json({ error: "AVATAR_BLOB_NOT_CONFIGURED" }, { status: 503 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxAvatarUploadBytes + 16 * 1024) {
      telemetry.reject("auth.avatar", 413, { actorRef: telemetry.actorRef(player.id), errorCode: "AVATAR_FILE_TOO_LARGE" });
      return Response.json({ error: "AVATAR_FILE_TOO_LARGE" }, { status: 413 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      telemetry.responseError("auth.avatar", error, 400, { actorRef: telemetry.actorRef(player.id) });
      return Response.json({ error: "AVATAR_FILE_INVALID" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "image/webp" || file.size > maxAvatarUploadBytes) {
      telemetry.reject("auth.avatar", 400, { actorRef: telemetry.actorRef(player.id), errorCode: "AVATAR_FILE_INVALID" });
      return Response.json({ error: "AVATAR_FILE_INVALID" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isWebpImage(bytes)) {
      telemetry.reject("auth.avatar", 400, { actorRef: telemetry.actorRef(player.id), errorCode: "AVATAR_FILE_INVALID" });
      return Response.json({ error: "AVATAR_FILE_INVALID" }, { status: 400 });
    }

    const blob = await put(`avatars/${randomUUID()}.webp`, file, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "image/webp",
      cacheControlMaxAge: 31_536_000,
      abortSignal: AbortSignal.timeout(10_000),
    });
    telemetry.success("auth.avatar", { actorRef: telemetry.actorRef(player.id) });
    return Response.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("auth.avatar", error, 401);
      return Response.json({ error: "PLAYER_AUTH_REQUIRED" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("auth.avatar", error, 503);
      return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    }
    telemetry.failure("auth.avatar", error);
    return Response.json({ error: "AVATAR_UPLOAD_FAILED" }, { status: 500 });
  }
}
