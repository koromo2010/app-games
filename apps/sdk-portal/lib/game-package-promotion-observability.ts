export type GamePackagePromotionFailureStage =
  | "input_validation"
  | "schema_validation"
  | "source_lookup"
  | "manifest_verification"
  | "release_write"
  | "result_validation";

export type GamePackagePromotionFailureContext = {
  stage: GamePackagePromotionFailureStage;
  targetEnvironment?: "development" | "main";
  creatorSlug?: string;
  gameId?: string;
  sourceRevision?: string;
};

const NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

const PROMOTION_ERROR_CODES = new Set([
  "GAME_SDK_PACKAGE_RUNTIME_MANIFEST_MISMATCH",
  "promotion_decision_invalid",
  "promotion_expected_source_changed",
  "promotion_expected_source_invalid",
  "promotion_input_invalid",
  "promotion_source_changed",
  "promotion_source_missing",
  "promotion_target_not_found",
]);

const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

function safeFailureClassification(error: unknown) {
  const controlledCode = typeof (error as { code?: unknown } | null)?.code
    === "string"
    ? (error as { code: string }).code
    : "";
  const controlledStatus = typeof (error as { status?: unknown } | null)?.status
    === "number"
    ? (error as { status: number }).status
    : 0;
  if (
    PROMOTION_ERROR_CODES.has(controlledCode)
    && controlledStatus >= 400
    && controlledStatus <= 599
  ) {
    return {
      errorType: "promotion_error",
      errorCode: controlledCode,
      level: controlledStatus >= 500 ? "error" : "warning",
    } as const;
  }
  const code = typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code.toUpperCase()
    : "";
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return {
      errorType: "database_error",
      errorCode: `POSTGRES_${code}`,
      level: "error",
    } as const;
  }
  if (NETWORK_ERROR_CODES.has(code) || error instanceof TypeError) {
    return {
      errorType: "network_error",
      errorCode: code ? `NETWORK_${code}` : "NETWORK_FAILURE",
      level: "error",
    } as const;
  }
  return {
    errorType: "unexpected_error",
    errorCode: "PROMOTION_UNEXPECTED_FAILURE",
    level: "error",
  } as const;
}

export function createGamePackagePromotionFailureEvent(
  context: GamePackagePromotionFailureContext,
  error: unknown,
  now = new Date(),
) {
  const failure = safeFailureClassification(error);
  const targetEnvironment = context.targetEnvironment === "development"
    || context.targetEnvironment === "main"
    ? context.targetEnvironment
    : undefined;
  const creatorSlug = context.creatorSlug
    && IDENTIFIER_PATTERN.test(context.creatorSlug)
    ? context.creatorSlug
    : undefined;
  const gameId = context.gameId && IDENTIFIER_PATTERN.test(context.gameId)
    ? context.gameId
    : undefined;
  const sourceRevision = context.sourceRevision
    && REVISION_PATTERN.test(context.sourceRevision)
    ? context.sourceRevision
    : undefined;
  const packageId = creatorSlug && gameId
    ? `${creatorSlug}/${gameId}`
    : undefined;
  return {
    schemaVersion: 1,
    occurredAt: now.toISOString(),
    level: failure.level,
    event: "sdk.promotion.failure",
    service: "game-fields-sdk-portal",
    environment: targetEnvironment === "main"
      ? "production"
      : "development",
    fields: {
      stage: context.stage,
      promotionRoute: "sdk-candidate",
      action: "approve",
      targetEnvironment,
      creatorSlug,
      gameId,
      packageId,
      sourceRevision,
      errorType: failure.errorType,
      errorCode: failure.errorCode,
    },
  };
}

export function logGamePackagePromotionFailure(
  context: GamePackagePromotionFailureContext,
  error: unknown,
) {
  console.error(JSON.stringify(
    createGamePackagePromotionFailureEvent(context, error),
  ));
}
