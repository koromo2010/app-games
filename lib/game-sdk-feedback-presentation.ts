import type { AppLocale } from "./app-locale";

const verdictLabels: Record<string, Record<AppLocale, string>> = {
  definitely_yes: { ja: "はい", en: "Yes" },
  probably_yes: { ja: "たぶんはい", en: "Probably yes" },
  unknown: { ja: "わからない", en: "Unknown" },
  probably_no: { ja: "たぶんいいえ", en: "Probably no" },
  definitely_no: { ja: "いいえ", en: "No" },
  yes: { ja: "はい", en: "Yes" },
  no: { ja: "いいえ", en: "No" },
  true: { ja: "はい", en: "Yes" },
  false: { ja: "いいえ", en: "No" },
};

const fieldLabels: Record<string, Record<AppLocale, string>> = {
  verdict: { ja: "判定", en: "Verdict" },
  answer: { ja: "回答", en: "Answer" },
  question: { ja: "質問", en: "Question" },
  reason: { ja: "理由", en: "Reason" },
  explanation: { ja: "説明", en: "Explanation" },
  hint: { ja: "ヒント", en: "Hint" },
  message: { ja: "内容", en: "Content" },
};

function scalarText(value: unknown, locale: AppLocale) {
  if (typeof value === "string") {
    return verdictLabels[value.trim().toLowerCase()]?.[locale]
      ?? value.trim().slice(0, 300);
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return verdictLabels[String(value)]![locale];
  return "";
}

export type GameSdkFeedbackArtifactPresentation = {
  title: string;
  summary: string;
};

export function presentGameSdkFeedbackArtifact(
  artifactText: string,
  task: string,
  locale: AppLocale,
): GameSdkFeedbackArtifactPresentation {
  const isVerdictTask = task.toLowerCase().includes("verdict");
  const defaultTitle = isVerdictTask
    ? (locale === "en" ? "AI verdict" : "AIの判定")
    : (locale === "en" ? "AI-generated content" : "AIが生成した内容");
  try {
    const parsed = JSON.parse(artifactText) as unknown;
    if (Array.isArray(parsed)) {
      return {
        title: defaultTitle,
        summary: locale === "en"
          ? `${parsed.length} structured items were generated.`
          : `${parsed.length}件の候補を生成しました。`,
      };
    }
    if (parsed && typeof parsed === "object") {
      const entries = Object.entries(parsed as Record<string, unknown>);
      for (const [key, value] of entries) {
        const label = fieldLabels[key]?.[locale];
        const text = scalarText(value, locale);
        if (label && text) {
          return {
            title: key === "verdict"
              ? (locale === "en" ? "AI verdict" : "AIの判定")
              : defaultTitle,
            summary: `${label}：${text}`,
          };
        }
      }
      return {
        title: defaultTitle,
        summary: locale === "en"
          ? "Structured data was generated for the game."
          : "ゲーム進行に使うデータを生成しました。",
      };
    }
  } catch {
    // Plain-text generations are already suitable for a human-readable preview.
  }
  const summary = artifactText.trim().slice(0, 300);
  return {
    title: defaultTitle,
    summary: summary || (
      locale === "en"
        ? "AI-generated content was used in this game."
        : "このゲームでAI生成内容を使用しました。"
    ),
  };
}
