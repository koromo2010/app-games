import { emitObservabilityEvent } from "../../../lib/observability/logger.ts";
import { redisPipeline } from "../../../lib/redis-store.ts";
import type { ObservabilityOutcome } from "../../../lib/observability/types.ts";
import type { PreviewAssetSourceKind } from "./preview-security.ts";

export type PreviewAssetTokenVersion = "v1" | "v2" | "unknown";
export type PreviewAssetTokenAction = "issue" | "verify";

const METRIC_RETENTION_SECONDS = 48 * 60 * 60;

function hourBucket(now: number) {
  return new Date(now).toISOString().slice(0, 13).replace(/[-T:]/g, "");
}

function normalizedAssetPath(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").split("?", 1)[0]?.slice(0, 100) ?? "";
}

export function previewAssetTokenVersionHint(token: string): PreviewAssetTokenVersion {
  if (!token) return "unknown";
  return token.startsWith("v2.") ? "v2" : "v1";
}

export function previewAssetTokenRejectionCode(token: string, now = Date.now()) {
  if (!token) return "preview_asset_token_missing";
  if (token.startsWith("v2.")) {
    const [version, encodedExpiry, encodedSignature, extra] = token.split(".");
    if (version !== "v2" || !encodedExpiry || !encodedSignature || extra) {
      return "preview_asset_token_malformed";
    }
    const expiresAt = Number.parseInt(encodedExpiry, 36);
    if (!Number.isSafeInteger(expiresAt)) return "preview_asset_token_malformed";
    if (expiresAt <= now) return "preview_asset_token_expired";
    return "preview_asset_token_rejected";
  }
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return "preview_asset_token_malformed";
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: unknown };
    if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= now) {
      return "preview_asset_token_expired";
    }
  } catch {
    return "preview_asset_token_malformed";
  }
  return "preview_asset_token_rejected";
}

export function recordPreviewAssetTokenEvent({
  action,
  version,
  outcome,
  sourceKind,
  gameId,
  revision,
  assetPath,
  errorCode,
  now = Date.now(),
  context = {},
}: {
  action: PreviewAssetTokenAction;
  version: PreviewAssetTokenVersion;
  outcome: Extract<ObservabilityOutcome, "success" | "rejected" | "failed">;
  sourceKind: PreviewAssetSourceKind;
  gameId: string;
  revision: number;
  assetPath: string;
  errorCode?: string;
  now?: number;
  context?: { route?: string; method?: string; requestId?: string; traceId?: string };
}) {
  const event = action === "issue"
    ? "sdk_preview_asset_token_issue"
    : "sdk_preview_asset_token_verify";
  const fields = {
    game: `sdk:${gameId}`,
    action,
    outcome,
    revision,
    tokenVersion: version,
    sourceKind,
    assetPath: normalizedAssetPath(assetPath),
    ...(errorCode ? { errorCode } : {}),
  } as const;
  emitObservabilityEvent(
    outcome === "failed" ? "error" : outcome === "rejected" ? "warn" : "info",
    event,
    fields,
    context,
  );

  const key = `sdk-preview:asset-token-metrics:${hourBucket(now)}`;
  const counter = `${version}_${action}_${outcome}`;
  const commands: unknown[][] = [
    ["HINCRBY", key, counter, 1],
    ["EXPIRE", key, METRIC_RETENTION_SECONDS],
  ];
  if (action === "verify" && outcome === "success" && version !== "unknown") {
    commands.splice(1, 0, ["HSET", key, `last_${version}_verified_at`, new Date(now).toISOString()]);
  }
  void redisPipeline(commands).catch(() => {
    emitObservabilityEvent(
      "error",
      "sdk_preview_asset_token_metrics",
      {
        game: `sdk:${gameId}`,
        action,
        outcome: "failed",
        revision,
        tokenVersion: version,
        sourceKind,
        assetPath: normalizedAssetPath(assetPath),
        errorCode: "PREVIEW_ASSET_TOKEN_METRICS_WRITE_FAILED",
      },
      context,
    );
  });
}
