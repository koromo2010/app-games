export type OriginalDataOfflineTargetReceipt = {
  target: "moi-lab2" | "yabobojpn-lab";
  lifecycle: "active" | "deleted";
  principalValidity: "BOUND" | "NULL";
  recordCounts: Record<string, number>;
  artifactStatus: "COMPLETE" | "ARTIFACT_SOURCE_NOT_LOCATED";
  artifactLocatorCount: number;
  artifactPresentCount: number;
  artifactMissingCount: 0;
  artifactUnavailableCount: 0;
  artifactFileCount: number;
};

export type OriginalDataOfflineReceipt = {
  schemaVersion: 1;
  phaseId: "T-131-A0";
  sourceMainCommit: string;
  sourceDeploymentFingerprint: string;
  semanticEnvironment: "production";
  sourceDatabaseFingerprint: string;
  snapshotFingerprint: string;
  observedAt: string;
  observedSchemaVersion: 9;
  migrationLedger: "CANONICAL_001_009_AND_010_ABSENT";
  targets: [OriginalDataOfflineTargetReceipt, OriginalDataOfflineTargetReceipt];
  filename: string;
  zipBytes: number;
  zipSha256: string;
  serverArchiveVerification: "PASS";
  credentialScan: "PASS";
  productionWriteCount: 0;
  controlPlaneWriteCount: 0;
};

const targetNames = ["moi-lab2", "yabobojpn-lab"] as const;
const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const receiptFilenamePattern = /^Game-Fields-T-131-A0-original-data-\d{8}T\d{6}Z\.zip$/;
const utf8Flag = 0x0800;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return value >>> 0;
});

function crc32(content: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of content) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function receiptTargetShape(value: unknown, target: string): value is OriginalDataOfflineTargetReceipt {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<OriginalDataOfflineTargetReceipt>;
  return row.target === target
    && (row.lifecycle === "active" || row.lifecycle === "deleted")
    && (row.principalValidity === "BOUND" || row.principalValidity === "NULL")
    && row.recordCounts !== null
    && typeof row.recordCounts === "object"
    && Object.values(row.recordCounts).every((count) => Number.isSafeInteger(count) && count >= 0)
    && (row.artifactStatus === "COMPLETE" || row.artifactStatus === "ARTIFACT_SOURCE_NOT_LOCATED")
    && Number.isSafeInteger(row.artifactLocatorCount)
    && Number.isSafeInteger(row.artifactPresentCount)
    && row.artifactMissingCount === 0
    && row.artifactUnavailableCount === 0
    && Number.isSafeInteger(row.artifactFileCount);
}

function receiptShape(value: unknown): value is OriginalDataOfflineReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<OriginalDataOfflineReceipt>;
  return receipt.schemaVersion === 1
    && receipt.phaseId === "T-131-A0"
    && typeof receipt.sourceMainCommit === "string"
    && sha1Pattern.test(receipt.sourceMainCommit)
    && typeof receipt.sourceDeploymentFingerprint === "string"
    && sha256Pattern.test(receipt.sourceDeploymentFingerprint)
    && receipt.semanticEnvironment === "production"
    && typeof receipt.sourceDatabaseFingerprint === "string"
    && sha256Pattern.test(receipt.sourceDatabaseFingerprint)
    && typeof receipt.snapshotFingerprint === "string"
    && sha256Pattern.test(receipt.snapshotFingerprint)
    && typeof receipt.observedAt === "string"
    && receipt.observedSchemaVersion === 9
    && receipt.migrationLedger === "CANONICAL_001_009_AND_010_ABSENT"
    && Array.isArray(receipt.targets)
    && receipt.targets.length === 2
    && receiptTargetShape(receipt.targets[0], targetNames[0])
    && receiptTargetShape(receipt.targets[1], targetNames[1])
    && typeof receipt.filename === "string"
    && receiptFilenamePattern.test(receipt.filename)
    && Number.isSafeInteger(receipt.zipBytes)
    && Number(receipt.zipBytes) > 0
    && typeof receipt.zipSha256 === "string"
    && sha256Pattern.test(receipt.zipSha256)
    && receipt.serverArchiveVerification === "PASS"
    && receipt.credentialScan === "PASS"
    && receipt.productionWriteCount === 0
    && receipt.controlPlaneWriteCount === 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function decodeOriginalDataOfflineReceipt(value: string | null) {
  if (!value || value.length > 16_384) throw new Error("A0_SAFE_RECEIPT_INVALID");
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!receiptShape(receipt)) throw new Error("shape");
    return receipt;
  } catch {
    throw new Error("A0_SAFE_RECEIPT_INVALID");
  }
}

export async function browserSha256Hex(value: ArrayBuffer | Uint8Array) {
  const input = value instanceof ArrayBuffer
    ? value
    : (() => {
      const copy = new Uint8Array(value.byteLength);
      copy.set(value);
      return copy.buffer;
    })();
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type BrowserZipEntry = {
  name: string;
  content: Uint8Array;
  localStart: number;
  localEnd: number;
};

function safeZipPath(name: string) {
  return name.length > 0
    && name.length <= 1_024
    && !name.startsWith("/")
    && !name.includes("\\")
    && !name.includes("\0")
    && name.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function extractBrowserStoredZip(archive: Uint8Array) {
  if (archive.byteLength < 22) throw new Error("A0_LOCAL_ZIP_INVALID");
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const endOffset = archive.byteLength - 22;
  if (view.getUint32(endOffset, true) !== 0x06054b50) throw new Error("A0_LOCAL_ZIP_INVALID");
  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryBytes = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  if (
    view.getUint16(endOffset + 4, true) !== 0
    || view.getUint16(endOffset + 6, true) !== 0
    || view.getUint16(endOffset + 8, true) !== entryCount
    || entryCount > 16_384
    || view.getUint16(endOffset + 20, true) !== 0
    || directoryOffset + directoryBytes !== endOffset
  ) throw new Error("A0_LOCAL_ZIP_INVALID");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const entries: BrowserZipEntry[] = [];
  const names = new Set<string>();
  const foldedNames = new Set<string>();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("A0_LOCAL_ZIP_INVALID");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const contentBytes = view.getUint32(cursor + 24, true);
    const nameBytes = view.getUint16(cursor + 28, true);
    const extraBytes = view.getUint16(cursor + 30, true);
    const commentBytes = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (
      flags !== utf8Flag
      || method !== 0
      || compressedBytes !== contentBytes
      || next > endOffset
      || localOffset + 30 > directoryOffset
      || view.getUint32(localOffset, true) !== 0x04034b50
    ) throw new Error("A0_LOCAL_ZIP_INVALID");
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameBytes));
    const foldedName = name.toLocaleLowerCase("en-US");
    const localNameBytes = view.getUint16(localOffset + 26, true);
    const localExtraBytes = view.getUint16(localOffset + 28, true);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameBytes;
    const contentOffset = localNameEnd + localExtraBytes;
    const contentEnd = contentOffset + contentBytes;
    const localName = decoder.decode(archive.subarray(localNameStart, localNameEnd));
    if (
      !safeZipPath(name)
      || encoder.encode(name).byteLength !== nameBytes
      || names.has(name)
      || foldedNames.has(foldedName)
      || localName !== name
      || view.getUint16(localOffset + 6, true) !== flags
      || view.getUint16(localOffset + 8, true) !== method
      || view.getUint32(localOffset + 14, true) !== expectedCrc
      || view.getUint32(localOffset + 18, true) !== compressedBytes
      || view.getUint32(localOffset + 22, true) !== contentBytes
      || contentEnd > directoryOffset
    ) throw new Error("A0_LOCAL_ZIP_INVALID");
    const content = archive.subarray(contentOffset, contentEnd);
    if (crc32(content) !== expectedCrc) throw new Error("A0_LOCAL_ZIP_INVALID");
    names.add(name);
    foldedNames.add(foldedName);
    entries.push({ name, content, localStart: localOffset, localEnd: contentEnd });
    cursor = next;
  }
  if (cursor !== endOffset) throw new Error("A0_LOCAL_ZIP_INVALID");
  const ranges = [...entries].sort((left, right) => left.localStart - right.localStart);
  let expectedOffset = 0;
  for (const range of ranges) {
    if (range.localStart !== expectedOffset) throw new Error("A0_LOCAL_ZIP_INVALID");
    expectedOffset = range.localEnd;
  }
  if (expectedOffset !== directoryOffset) throw new Error("A0_LOCAL_ZIP_INVALID");
  return entries;
}

function json<T>(files: Map<string, Uint8Array>, path: string): T {
  const content = files.get(path);
  if (!content) throw new Error("A0_LOCAL_ZIP_INVALID");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)) as T;
  } catch {
    throw new Error("A0_LOCAL_ZIP_INVALID");
  }
}

export async function verifyOriginalDataOfflineArchive(
  archive: ArrayBuffer,
  receipt: OriginalDataOfflineReceipt,
) {
  if (archive.byteLength !== receipt.zipBytes) throw new Error("A0_LOCAL_ZIP_SIZE_MISMATCH");
  const zipSha256 = await browserSha256Hex(archive);
  if (zipSha256 !== receipt.zipSha256) throw new Error("A0_LOCAL_ZIP_SHA256_MISMATCH");
  const entries = extractBrowserStoredZip(new Uint8Array(archive));
  const files = new Map(entries.map((entry) => [entry.name, entry.content]));
  const checksumsFile = files.get("SHA256SUMS");
  if (!checksumsFile) throw new Error("A0_LOCAL_ZIP_INTERNAL_HASH_INVALID");
  const checksumText = new TextDecoder("utf-8", { fatal: true }).decode(checksumsFile);
  const checksums = new Map<string, string>();
  for (const line of checksumText.trim().split("\n")) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match || checksums.has(match[2]!)) throw new Error("A0_LOCAL_ZIP_INTERNAL_HASH_INVALID");
    checksums.set(match[2]!, match[1]!);
  }
  if (checksums.size !== files.size - 1 || checksums.has("SHA256SUMS")) {
    throw new Error("A0_LOCAL_ZIP_INTERNAL_HASH_INVALID");
  }
  for (const [path, content] of files) {
    if (path === "SHA256SUMS") continue;
    if (checksums.get(path) !== await browserSha256Hex(content)) {
      throw new Error("A0_LOCAL_ZIP_INTERNAL_HASH_INVALID");
    }
  }
  const manifest = json<{
    formatVersion?: unknown;
    phaseId?: unknown;
    source?: {
      snapshotFingerprint?: unknown;
      sourceMainCommit?: unknown;
      observedSchemaVersion?: unknown;
      migrationLedger?: unknown;
    };
    targets?: unknown;
    payloadEntries?: Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>;
  }>(files, "manifest.json");
  if (
    manifest.formatVersion !== 1
    || manifest.phaseId !== "T-131-A0"
    || manifest.source?.snapshotFingerprint !== receipt.snapshotFingerprint
    || manifest.source?.sourceMainCommit !== receipt.sourceMainCommit
    || manifest.source?.observedSchemaVersion !== 9
    || manifest.source?.migrationLedger !== "CANONICAL_001_009_AND_010_ABSENT"
    || canonicalJson(manifest.targets) !== canonicalJson(receipt.targets)
  ) throw new Error("A0_LOCAL_ZIP_MANIFEST_MISMATCH");
  const ledger = json<{ observedSchemaVersion?: unknown; absentVersions?: unknown; applied?: unknown[] }>(
    files,
    "db/migration-ledger.json",
  );
  if (
    ledger.observedSchemaVersion !== 9
    || JSON.stringify(ledger.absentVersions) !== "[10]"
    || !Array.isArray(ledger.applied)
    || ledger.applied.length !== 9
  ) throw new Error("A0_LOCAL_ZIP_MANIFEST_MISMATCH");
  for (const target of receipt.targets) {
    for (const [table, count] of Object.entries(target.recordCounts)) {
      const recordRows = json<unknown[]>(files, `db/${target.target}/${table}.json`);
      if (!Array.isArray(recordRows) || recordRows.length !== count) {
        throw new Error("A0_LOCAL_ZIP_RECORD_COUNT_MISMATCH");
      }
    }
    const artifact = json<{
      target?: unknown;
      status?: unknown;
      locatorCount?: unknown;
      presentCount?: unknown;
      missingCount?: unknown;
      unavailableCount?: unknown;
      fileCount?: unknown;
      locators?: Array<{ files?: Array<{ archivePath?: unknown; bytes?: unknown; contentSha256?: unknown }> }>;
    }>(files, `git-artifacts/${target.target}/manifest.json`);
    if (
      artifact.target !== target.target
      || artifact.status !== target.artifactStatus
      || artifact.locatorCount !== target.artifactLocatorCount
      || artifact.presentCount !== target.artifactPresentCount
      || artifact.missingCount !== 0
      || artifact.unavailableCount !== 0
      || artifact.fileCount !== target.artifactFileCount
      || !Array.isArray(artifact.locators)
    ) throw new Error("A0_LOCAL_ZIP_ARTIFACT_MISMATCH");
    let artifactFiles = 0;
    for (const locator of artifact.locators) {
      if (!Array.isArray(locator.files)) throw new Error("A0_LOCAL_ZIP_ARTIFACT_MISMATCH");
      for (const entry of locator.files) {
        if (
          typeof entry.archivePath !== "string"
          || typeof entry.bytes !== "number"
          || typeof entry.contentSha256 !== "string"
        ) throw new Error("A0_LOCAL_ZIP_ARTIFACT_MISMATCH");
        const content = files.get(entry.archivePath);
        if (
          !content
          || content.byteLength !== entry.bytes
          || await browserSha256Hex(content) !== entry.contentSha256
        ) throw new Error("A0_LOCAL_ZIP_ARTIFACT_MISMATCH");
        artifactFiles += 1;
      }
    }
    if (artifactFiles !== target.artifactFileCount) {
      throw new Error("A0_LOCAL_ZIP_ARTIFACT_MISMATCH");
    }
  }
  const payloadEntries = manifest.payloadEntries ?? [];
  if (payloadEntries.length !== files.size - 2) throw new Error("A0_LOCAL_ZIP_MANIFEST_MISMATCH");
  for (const entry of payloadEntries) {
    if (
      typeof entry.path !== "string"
      || typeof entry.bytes !== "number"
      || typeof entry.sha256 !== "string"
    ) throw new Error("A0_LOCAL_ZIP_MANIFEST_MISMATCH");
    const content = files.get(entry.path);
    if (!content || content.byteLength !== entry.bytes || await browserSha256Hex(content) !== entry.sha256) {
      throw new Error("A0_LOCAL_ZIP_MANIFEST_MISMATCH");
    }
  }
  return {
    zipBytes: archive.byteLength,
    zipSha256,
    entryCount: entries.length,
    internallyHashedEntryCount: checksums.size,
    targetCount: receipt.targets.length,
    verdict: "PASS" as const,
  };
}

export async function hashOriginalDataOfflineContainer(file: File) {
  const bytes = await file.arrayBuffer();
  return {
    filename: file.name,
    bytes: file.size,
    sha256: await browserSha256Hex(bytes),
  };
}
