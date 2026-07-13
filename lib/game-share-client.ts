export type GameShareInput = {
  title: string;
  text: string;
  url: string;
};

export type GameShareOutcome = "shared" | "copied" | "cancelled";

function legacyCopy(text: string) {
  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();
  const copied = document.execCommand("copy");
  element.remove();
  if (!copied) throw new Error("SHARE_COPY_FAILED");
}

export async function shareGameResult(input: GameShareInput): Promise<GameShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share(input);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }

  const combined = `${input.text}\n${input.url}`;
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(combined);
  else legacyCopy(combined);
  return "copied";
}
