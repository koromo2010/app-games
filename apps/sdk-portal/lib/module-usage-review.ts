import type { GameSdkModuleUsageAudit } from "@game-fields/game-sdk/module-usage";
import { GAME_SDK_MODULE_CATALOG } from "@game-fields/game-sdk/modules";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function appendModuleUsageReview(
  files: Readonly<Record<string, string>>,
  audit: GameSdkModuleUsageAudit,
) {
  const html = files["index.html"];
  if (typeof html !== "string" || !/<\/body>/i.test(html)) {
    throw new Error("GAME_SDK_PROTOTYPE_HTML_INVALID");
  }
  const definitions = new Map(GAME_SDK_MODULE_CATALOG.map((item) => [item.id, item]));
  const rows = audit.moduleUsage.map((usage) => {
    const definition = definitions.get(usage.id)!;
    const source = usage.delivery === "platform-owned" ? "Game Fields Platform" : "Game Fields SDK";
    const status = usage.status === "used" ? "利用中" : "Platformへ委譲";
    const contractUse = usage.publicApisUsed.length > 0
      ? usage.publicApisUsed.join("、")
      : usage.nonReimplementationEvidence.join("、");
    return `<tr><th>${escapeHtml(definition.label)}<br><small>${escapeHtml(definition.description)}</small></th><td>${escapeHtml(source)}</td><td>${escapeHtml(status)}</td><td>${escapeHtml(usage.sourcePaths.join("、"))}<br><small>${escapeHtml(contractUse)}</small></td><td>${escapeHtml(usage.runtimeEvidence.join("、"))}</td></tr>`;
  }).join("");
  const panel = `<details data-game-fields-module-usage><summary>この操作プロトタイプで使っているGame Fields機能</summary><p>profile ${escapeHtml(audit.binding.moduleProfileRevision)} / SDK ${escapeHtml(audit.binding.sdkPackageVersion)}</p><div style="overflow:auto"><table><thead><tr><th>module・目的</th><th>提供元</th><th>状態</th><th>利用source・API</th><th>動作証拠</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  return {
    ...files,
    "index.html": html.replace(/<\/body>/i, `${panel}</body>`),
  };
}
