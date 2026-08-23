const UTF8_FLAG = 0x0800;

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

export function createStoredZip(entries: readonly { name: string; content: Uint8Array | string }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const names = new Set<string>();
  const foldedNames = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    const foldedName = entry.name.toLocaleLowerCase("en-US");
    if (
      !entry.name
      || entry.name.length > 1_024
      || entry.name.startsWith("/")
      || entry.name.split("/").some((part) => part === "" || part === "." || part === "..")
      || entry.name.includes("\\")
      || entry.name.includes("\0")
      || names.has(entry.name)
      || foldedNames.has(foldedName)
    ) {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_PATH_INVALID");
    }
    names.add(entry.name);
    foldedNames.add(foldedName);
    const name = Buffer.from(entry.name, "utf8");
    const content = typeof entry.content === "string" ? Buffer.from(entry.content, "utf8") : Buffer.from(entry.content);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    localParts.push(local, name, content); centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

export type StoredZipEntry = {
  name: string;
  content: Buffer;
};

/**
 * Parses only the deterministic, uncompressed ZIP dialect emitted above.
 * Unsupported flags, compression, comments, duplicate/case-colliding names,
 * malformed offsets, and CRC mismatches fail closed.
 */
export function extractStoredZip(archive: Uint8Array): StoredZipEntry[] {
  const value = Buffer.from(archive);
  if (value.length < 22 || value.readUInt32LE(value.length - 22) !== 0x06054b50) {
    throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
  }
  const endOffset = value.length - 22;
  const disk = value.readUInt16LE(endOffset + 4);
  const directoryDisk = value.readUInt16LE(endOffset + 6);
  const entriesOnDisk = value.readUInt16LE(endOffset + 8);
  const entryCount = value.readUInt16LE(endOffset + 10);
  const directoryBytes = value.readUInt32LE(endOffset + 12);
  const directoryOffset = value.readUInt32LE(endOffset + 16);
  const commentBytes = value.readUInt16LE(endOffset + 20);
  if (
    disk !== 0
    || directoryDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount > 16_384
    || commentBytes !== 0
    || directoryOffset + directoryBytes !== endOffset
  ) {
    throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
  }

  const entries: StoredZipEntry[] = [];
  const names = new Set<string>();
  const foldedNames = new Set<string>();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || value.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
    }
    const flags = value.readUInt16LE(cursor + 8);
    const method = value.readUInt16LE(cursor + 10);
    const expectedCrc = value.readUInt32LE(cursor + 16);
    const compressedBytes = value.readUInt32LE(cursor + 20);
    const contentBytes = value.readUInt32LE(cursor + 24);
    const nameBytes = value.readUInt16LE(cursor + 28);
    const extraBytes = value.readUInt16LE(cursor + 30);
    const commentLength = value.readUInt16LE(cursor + 32);
    const localOffset = value.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameBytes + extraBytes + commentLength;
    if (
      flags !== UTF8_FLAG
      || method !== 0
      || compressedBytes !== contentBytes
      || next > endOffset
      || localOffset + 30 > directoryOffset
      || value.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
    }
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(
        value.subarray(cursor + 46, cursor + 46 + nameBytes),
      );
    } catch {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
    }
    const foldedName = name.toLocaleLowerCase("en-US");
    const localFlags = value.readUInt16LE(localOffset + 6);
    const localMethod = value.readUInt16LE(localOffset + 8);
    const localCrc = value.readUInt32LE(localOffset + 14);
    const localCompressedBytes = value.readUInt32LE(localOffset + 18);
    const localContentBytes = value.readUInt32LE(localOffset + 22);
    const localNameBytes = value.readUInt16LE(localOffset + 26);
    const localExtraBytes = value.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameBytes;
    const contentOffset = localNameEnd + localExtraBytes;
    const contentEnd = contentOffset + contentBytes;
    if (
      !name
      || name.length > 1_024
      || name.startsWith("/")
      || name.includes("\\")
      || name.includes("\0")
      || name.split("/").some((part) => part === "" || part === "." || part === "..")
      || names.has(name)
      || foldedNames.has(foldedName)
      || localNameEnd > directoryOffset
      || !value.subarray(localNameStart, localNameEnd).equals(Buffer.from(name, "utf8"))
      || localFlags !== flags
      || localMethod !== method
      || localCrc !== expectedCrc
      || localCompressedBytes !== compressedBytes
      || localContentBytes !== contentBytes
      || contentEnd > directoryOffset
    ) {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
    }
    const content = Buffer.from(value.subarray(contentOffset, contentEnd));
    if (crc32(content) !== expectedCrc) {
      throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
    }
    names.add(name);
    foldedNames.add(foldedName);
    entries.push({ name, content });
    cursor = next;
  }
  if (cursor !== endOffset) throw new Error("SDK_PACKAGE_EXPORT_ZIP_INVALID");
  return entries;
}
