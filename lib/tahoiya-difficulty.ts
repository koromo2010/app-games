const commonSpokenWords = new Set([
  "あめ", "いし", "かき", "かめ", "かみ", "かわ", "かえる", "きく", "くも", "さけ",
  "しろ", "つる", "はし", "はな", "ふく", "まつ", "みみ", "もち", "もも", "ゆき",
]);

export function hasVeryCommonSpokenHomophone(reading?: string) {
  if (!reading) return false;
  const normalized = reading.normalize("NFKC").trim().toLocaleLowerCase("ja");
  return commonSpokenWords.has(normalized);
}
