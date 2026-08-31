import type { AppLocale } from "./app-locale.ts";
import type { PlayerGameResult } from "./player-stats-store.ts";

export function playerGameResultLabel(
  result: Pick<PlayerGameResult, "won" | "draw" | "resultLabel" | "details">,
  locale: AppLocale,
) {
  if (result.draw) return locale === "en" ? "Draw" : "引き分け";
  const rank = result.details?.rank;
  const score = result.details?.score;
  if (typeof rank === "number") {
    return locale === "en"
      ? `Rank ${rank}${typeof score === "number" ? ` · ${score} points` : ""}`
      : `${rank}位${typeof score === "number" ? `・${score}点` : ""}`;
  }
  if (result.won) return locale === "en" ? "Win" : "勝利";
  if (["敗北", "Lose", "Loss"].includes(result.resultLabel)) {
    return locale === "en" ? "Loss" : "敗北";
  }
  return result.resultLabel;
}
