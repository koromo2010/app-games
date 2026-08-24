export const originalDataPreservationArchiveInvalidStages = [
  "INTERNAL_ARCHIVE_STRUCTURE_VERIFY",
  "INTERNAL_RECEIPT_ENCODE",
  "PROXY_UPSTREAM_ARCHIVE_INVALID",
  "PROXY_RECEIPT_DECODE_OR_SHAPE",
  "PROXY_SOURCE_COMMIT",
  "PROXY_CONTENT_TYPE",
  "PROXY_CONTENT_DISPOSITION",
  "PROXY_DECLARED_LENGTH_OR_CEILING",
  "PROXY_RECEIVED_LENGTH",
  "PROXY_RECEIVED_SHA256",
] as const;

export type OriginalDataPreservationArchiveInvalidStage =
  typeof originalDataPreservationArchiveInvalidStages[number];

const stageSet = new Set<string>(originalDataPreservationArchiveInvalidStages);
const internalStageSet = new Set<OriginalDataPreservationArchiveInvalidStage>([
  "INTERNAL_ARCHIVE_STRUCTURE_VERIFY",
  "INTERNAL_RECEIPT_ENCODE",
]);

export function parseOriginalDataPreservationArchiveInvalidStage(
  value: unknown,
): OriginalDataPreservationArchiveInvalidStage | null {
  return typeof value === "string" && stageSet.has(value)
    ? value as OriginalDataPreservationArchiveInvalidStage
    : null;
}

export function formatOriginalDataPreservationArchiveInvalidStage(value: unknown) {
  const stage = parseOriginalDataPreservationArchiveInvalidStage(value);
  return stage ? ` / ${stage}` : "";
}

export function isOriginalDataPreservationInternalArchiveInvalidStage(
  value: unknown,
): value is OriginalDataPreservationArchiveInvalidStage {
  const stage = parseOriginalDataPreservationArchiveInvalidStage(value);
  return stage !== null && internalStageSet.has(stage);
}
