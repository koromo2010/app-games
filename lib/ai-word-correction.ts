export type AiWordCorrectionInput = {
  schemaVersion: 1;
  correctionKey: string;
  correctedBy: string;
  policyVersion: string;
  items: Array<
    | { surface: string; action: "replace_surface"; newSurface: string; reason: string }
    | { surface: string; action: "exclude"; reason: string }
    | { surface: string; action: "approve"; reason: string }
  >;
};

const japaneseSurfacePattern =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function parseAiWordCorrectionInput(value: unknown): AiWordCorrectionInput {
  if (!value || typeof value !== "object") throw new Error("AI_WORD_CORRECTION_OBJECT_REQUIRED");
  const source = value as Partial<AiWordCorrectionInput>;
  if (source.schemaVersion !== 1) throw new Error("AI_WORD_CORRECTION_SCHEMA_VERSION_UNSUPPORTED");

  const correctionKey = cleanString(source.correctionKey);
  const correctedBy = cleanString(source.correctedBy);
  const policyVersion = cleanString(source.policyVersion);
  if (!correctionKey || !correctedBy || !policyVersion) {
    throw new Error("AI_WORD_CORRECTION_METADATA_REQUIRED");
  }
  if (!Array.isArray(source.items) || source.items.length === 0) {
    throw new Error("AI_WORD_CORRECTION_ITEMS_REQUIRED");
  }

  const seen = new Set<string>();
  const items = source.items.map((item) => {
    const surface = cleanString(item?.surface);
    const reason = cleanString(item?.reason);
    if (
      !surface
      || !reason
      || (item?.action !== "replace_surface" && item?.action !== "exclude" && item?.action !== "approve")
    ) {
      throw new Error("AI_WORD_CORRECTION_ITEM_INVALID");
    }
    if (seen.has(surface)) throw new Error(`AI_WORD_CORRECTION_DUPLICATE_SURFACE:${surface}`);
    seen.add(surface);

    if (item.action === "replace_surface") {
      const newSurface = cleanString(item.newSurface);
      if (!newSurface || [...newSurface].length > 24 || !japaneseSurfacePattern.test(newSurface)) {
        throw new Error(`AI_WORD_CORRECTION_NEW_SURFACE_INVALID:${surface}`);
      }
      return { surface, action: "replace_surface" as const, newSurface, reason };
    }
    return { surface, action: item.action, reason };
  });

  return { schemaVersion: 1, correctionKey, correctedBy, policyVersion, items };
}
