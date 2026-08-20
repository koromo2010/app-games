const LEGACY_MODULE_USAGE_REVIEW_PATTERN =
  /<details data-game-fields-module-usage>[\s\S]*?<\/details>/g;
const LEGACY_MODULE_USAGE_TABLE_WRAPPER = '<div style="overflow:auto">';
const SAFE_MODULE_USAGE_TABLE_WRAPPER = '<div class="game-fields-module-usage-table">';

export function normalizeLegacyModuleUsageReview(html: string) {
  return html.replace(
    LEGACY_MODULE_USAGE_REVIEW_PATTERN,
    (review) => review.replace(
      LEGACY_MODULE_USAGE_TABLE_WRAPPER,
      SAFE_MODULE_USAGE_TABLE_WRAPPER,
    ),
  );
}
