import type {
  GameSdkStandardResultView,
} from "@game-fields/game-sdk/modules";
import type { AppLocale } from "./app-locale";

const knownReasonLabels: Record<string, Record<AppLocale, string>> = {
  "turn-limit-reached": {
    ja: "手数上限に達したため終了",
    en: "The turn limit was reached",
  },
  "time-limit-reached": {
    ja: "制限時間に達したため終了",
    en: "The time limit was reached",
  },
  "timer-expired": {
    ja: "制限時間に達したため終了",
    en: "The time limit was reached",
  },
  "target-reached": {
    ja: "目標を達成して終了",
    en: "The target was reached",
  },
  solved: {
    ja: "正解にたどり着いて終了",
    en: "The answer was found",
  },
  completed: {
    ja: "ゲーム完了",
    en: "Game completed",
  },
  aborted: {
    ja: "ゲームが中断されました",
    en: "The game was stopped",
  },
};

function looksLikeMachineCode(value: string) {
  return /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/.test(value);
}

export function gameSdkResultReasonText(
  result: Pick<GameSdkStandardResultView, "reason" | "presentation">,
  locale: AppLocale,
) {
  const localized = result.presentation?.reason[locale]?.trim();
  if (localized) return localized;
  const reason = result.reason.trim();
  const known = knownReasonLabels[reason]?.[locale];
  if (known) return known;
  if (reason && !looksLikeMachineCode(reason)) return reason;
  return locale === "en"
    ? "The game ended after meeting its end condition"
    : "ゲームの終了条件を満たしました";
}

export function gameSdkResultHighlights(
  result: Pick<GameSdkStandardResultView, "presentation">,
  locale: AppLocale,
) {
  return (result.presentation?.highlights ?? [])
    .map((line) => line[locale]?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(0, 3);
}

export function gameSdkResultPlayLog(
  result: Pick<GameSdkStandardResultView, "presentation">,
  locale: AppLocale,
) {
  return (result.presentation?.playLog ?? [])
    .map((line) => line[locale]?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(0, 50);
}
